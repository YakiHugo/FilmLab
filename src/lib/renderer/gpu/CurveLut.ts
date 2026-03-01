import type { PointCurvePoint } from "@/types";
import type { CurveUniforms } from "../types";

const LUT_SIZE = 256;

const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));
const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

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

const buildCurveTable = (points: PointCurvePoint[]): Float32Array => {
  const table = new Float32Array(LUT_SIZE);
  const normalized = normalizeCurvePoints(points);
  if (normalized.length < 2) {
    for (let i = 0; i < LUT_SIZE; i += 1) {
      table[i] = i / (LUT_SIZE - 1);
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
    table[x] = clampUnit(sampleHermite(p0, p1, m0, m1, x) / 255);
  }

  return table;
};

export const createIdentityCurvePixels = (): Float32Array => {
  const pixels = new Float32Array(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i += 1) {
    const base = i * 4;
    const value = i / (LUT_SIZE - 1);
    pixels[base] = value;
    pixels[base + 1] = value;
    pixels[base + 2] = value;
    pixels[base + 3] = value;
  }
  return pixels;
};

export const buildCurveLutPixels = (
  curve: CurveUniforms,
  output: Float32Array = createIdentityCurvePixels()
): Float32Array => {
  const rgbTable = buildCurveTable(curve.rgb);
  const redTable = buildCurveTable(curve.red);
  const greenTable = buildCurveTable(curve.green);
  const blueTable = buildCurveTable(curve.blue);

  for (let i = 0; i < LUT_SIZE; i += 1) {
    const base = i * 4;
    output[base] = rgbTable[i] ?? i / (LUT_SIZE - 1);
    output[base + 1] = redTable[i] ?? i / (LUT_SIZE - 1);
    output[base + 2] = greenTable[i] ?? i / (LUT_SIZE - 1);
    output[base + 3] = blueTable[i] ?? i / (LUT_SIZE - 1);
  }

  return output;
};

export const CURVE_LUT_SIZE = LUT_SIZE;
