import * as PIXI from "pixi.js";
import { Filter } from "pixi.js";
import type { PointCurvePoint } from "@/types";
import type { CurveUniforms } from "../types";

import vertexSrc from "../shaders/default.vert?raw";
import fragmentSrc from "../shaders/Curve.frag?raw";

const LUT_SIZE = 256;

const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

const sortCurvePoints = (points: PointCurvePoint[]) =>
  [...points].sort((a, b) => a.x - b.x).map((point) => ({ x: clampByte(point.x), y: clampByte(point.y) }));

const buildCurveTable = (points: PointCurvePoint[]): Uint8Array => {
  const table = new Uint8Array(LUT_SIZE);
  const sorted = sortCurvePoints(points);
  if (sorted.length < 2) {
    for (let i = 0; i < LUT_SIZE; i += 1) {
      table[i] = i;
    }
    return table;
  }

  let segmentIndex = 0;
  for (let x = 0; x < LUT_SIZE; x += 1) {
    while (
      segmentIndex < sorted.length - 2 &&
      x > (sorted[segmentIndex + 1]?.x ?? 255)
    ) {
      segmentIndex += 1;
    }
    const p0 = sorted[segmentIndex]!;
    const p1 = sorted[Math.min(segmentIndex + 1, sorted.length - 1)]!;
    const dx = Math.max(1, p1.x - p0.x);
    const t = Math.min(1, Math.max(0, (x - p0.x) / dx));
    table[x] = clampByte(p0.y + (p1.y - p0.y) * t);
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
