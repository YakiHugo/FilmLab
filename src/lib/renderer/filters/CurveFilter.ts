import * as PIXI from "pixi.js";
import { Filter } from "pixi.js";
import type { PointCurvePoint } from "@/types";
import type { CurveUniforms } from "../types";

import vertexSrc from "../shaders/default.vert?raw";
import fragmentSrc from "../shaders/Curve.frag?raw";

const LUT_SIZE = 256;

const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

const normalizeCurvePoints = (points: PointCurvePoint[]): PointCurvePoint[] => {
  const sorted = [...points]
    .sort((a, b) => a.x - b.x)
    .map((point) => ({ x: clampByte(point.x), y: clampByte(point.y) }));

  const deduped: PointCurvePoint[] = [];
  for (const point of sorted) {
    const lastPoint = deduped[deduped.length - 1];
    if (lastPoint && lastPoint.x === point.x) {
      lastPoint.y = point.y;
      continue;
    }
    deduped.push(point);
  }

  if (deduped.length < 2) {
    return deduped;
  }

  const first = deduped[0]!;
  if (first.x > 0) {
    deduped.unshift({ x: 0, y: first.y });
  }

  const last = deduped[deduped.length - 1]!;
  if (last.x < LUT_SIZE - 1) {
    deduped.push({ x: LUT_SIZE - 1, y: last.y });
  }

  return deduped;
};

const buildMonotoneTangents = (points: PointCurvePoint[]): number[] => {
  const n = points.length;
  const tangents = new Array<number>(n).fill(0);
  if (n < 2) {
    return tangents;
  }

  const h = new Array<number>(n - 1);
  const delta = new Array<number>(n - 1);
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const dx = Math.max(1, p1.x - p0.x);
    h[i] = dx;
    delta[i] = (p1.y - p0.y) / dx;
  }

  if (n === 2) {
    tangents[0] = delta[0] ?? 0;
    tangents[1] = delta[0] ?? 0;
    return tangents;
  }

  for (let i = 1; i < n - 1; i += 1) {
    const prevSlope = delta[i - 1] ?? 0;
    const nextSlope = delta[i] ?? 0;
    if (prevSlope === 0 || nextSlope === 0 || prevSlope * nextSlope < 0) {
      tangents[i] = 0;
      continue;
    }

    const prevWidth = h[i - 1] ?? 1;
    const nextWidth = h[i] ?? 1;
    const w1 = 2 * nextWidth + prevWidth;
    const w2 = nextWidth + 2 * prevWidth;
    tangents[i] = (w1 + w2) / (w1 / prevSlope + w2 / nextSlope);
  }

  const delta0 = delta[0] ?? 0;
  const delta1 = delta[1] ?? delta0;
  const h0 = h[0] ?? 1;
  const h1 = h[1] ?? h0;
  let d0 = ((2 * h0 + h1) * delta0 - h0 * delta1) / (h0 + h1);
  if (Math.sign(d0) !== Math.sign(delta0)) {
    d0 = 0;
  } else if (Math.sign(delta0) !== Math.sign(delta1) && Math.abs(d0) > Math.abs(3 * delta0)) {
    d0 = 3 * delta0;
  }
  tangents[0] = d0;

  const last = n - 1;
  const deltaN = delta[last - 1] ?? 0;
  const deltaPrev = delta[last - 2] ?? deltaN;
  const hN = h[last - 1] ?? 1;
  const hPrev = h[last - 2] ?? hN;
  let dN = ((2 * hN + hPrev) * deltaN - hN * deltaPrev) / (hN + hPrev);
  if (Math.sign(dN) !== Math.sign(deltaN)) {
    dN = 0;
  } else if (Math.sign(deltaN) !== Math.sign(deltaPrev) && Math.abs(dN) > Math.abs(3 * deltaN)) {
    dN = 3 * deltaN;
  }
  tangents[last] = dN;

  return tangents;
};

const sampleHermite = (
  p0: PointCurvePoint,
  p1: PointCurvePoint,
  m0: number,
  m1: number,
  x: number
): number => {
  const dx = Math.max(1, p1.x - p0.x);
  const t = Math.min(1, Math.max(0, (x - p0.x) / dx));
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return h00 * p0.y + h10 * dx * m0 + h01 * p1.y + h11 * dx * m1;
};

const buildCurveTable = (points: PointCurvePoint[]): Uint8Array => {
  const table = new Uint8Array(LUT_SIZE);
  const normalized = normalizeCurvePoints(points);
  if (normalized.length < 2) {
    for (let i = 0; i < LUT_SIZE; i += 1) {
      table[i] = i;
    }
    return table;
  }

  const tangents = buildMonotoneTangents(normalized);
  let segmentIndex = 0;
  for (let x = 0; x < LUT_SIZE; x += 1) {
    while (
      segmentIndex < normalized.length - 2 &&
      x > (normalized[segmentIndex + 1]?.x ?? 255)
    ) {
      segmentIndex += 1;
    }
    const p0 = normalized[segmentIndex]!;
    const p1 = normalized[Math.min(segmentIndex + 1, normalized.length - 1)]!;
    const m0 = tangents[segmentIndex] ?? 0;
    const m1 = tangents[Math.min(segmentIndex + 1, tangents.length - 1)] ?? 0;
    table[x] = clampByte(sampleHermite(p0, p1, m0, m1, x));
  }

  return table;
};

export class CurveFilter extends Filter {
  private lutPixels: Uint8Array;
  private lutBaseTexture: PIXI.BaseTexture;
  private lutTexture: PIXI.Texture;

  constructor() {
    const lutPixels = new Uint8Array(LUT_SIZE * 4);
    for (let i = 0; i < LUT_SIZE; i += 1) {
      const base = i * 4;
      lutPixels[base] = i;
      lutPixels[base + 1] = i;
      lutPixels[base + 2] = i;
      lutPixels[base + 3] = i;
    }
    const lutBaseTexture = PIXI.BaseTexture.fromBuffer(lutPixels, LUT_SIZE, 1, {
      scaleMode: PIXI.SCALE_MODES.LINEAR,
      alphaMode: PIXI.ALPHA_MODES.NO_PREMULTIPLIED_ALPHA,
    });
    const lutTexture = new PIXI.Texture(lutBaseTexture);

    super(vertexSrc, fragmentSrc, {
      u_enabled: false,
      u_curveLut: lutTexture,
    });

    this.lutPixels = lutPixels;
    this.lutBaseTexture = lutBaseTexture;
    this.lutTexture = lutTexture;

    // Initialize identity LUT.
    this.updateUniforms({
      enabled: false,
      rgb: [
        { x: 0, y: 0 },
        { x: 255, y: 255 },
      ],
      red: [
        { x: 0, y: 0 },
        { x: 255, y: 255 },
      ],
      green: [
        { x: 0, y: 0 },
        { x: 255, y: 255 },
      ],
      blue: [
        { x: 0, y: 0 },
        { x: 255, y: 255 },
      ],
    });
  }

  updateUniforms(u: CurveUniforms): void {
    this.uniforms.u_enabled = u.enabled;

    const rgbTable = buildCurveTable(u.rgb);
    const redTable = buildCurveTable(u.red);
    const greenTable = buildCurveTable(u.green);
    const blueTable = buildCurveTable(u.blue);

    for (let i = 0; i < LUT_SIZE; i += 1) {
      const base = i * 4;
      this.lutPixels[base] = rgbTable[i] ?? i;
      this.lutPixels[base + 1] = redTable[i] ?? i;
      this.lutPixels[base + 2] = greenTable[i] ?? i;
      this.lutPixels[base + 3] = blueTable[i] ?? i;
    }

    this.lutBaseTexture.update();
  }

  destroy(): void {
    this.lutTexture.destroy(true);
    super.destroy();
  }
}
