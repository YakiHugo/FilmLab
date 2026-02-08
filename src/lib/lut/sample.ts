import { clamp, lerp } from "@/lib/film/utils";
import type { LutAsset } from "@/types";

const getLutValue = (
  data: Float32Array,
  size: number,
  x: number,
  y: number,
  z: number
): [number, number, number] => {
  const index = ((z * size + y) * size + x) * 3;
  return [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0];
};

export const sampleCubeLut = (
  lut: Pick<LutAsset, "size" | "data">,
  red: number,
  green: number,
  blue: number
): [number, number, number] => {
  const size = lut.size;
  const maxIndex = size - 1;
  const x = clamp(red, 0, 1) * maxIndex;
  const y = clamp(green, 0, 1) * maxIndex;
  const z = clamp(blue, 0, 1) * maxIndex;

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = Math.min(maxIndex, x0 + 1);
  const y1 = Math.min(maxIndex, y0 + 1);
  const z1 = Math.min(maxIndex, z0 + 1);

  const tx = x - x0;
  const ty = y - y0;
  const tz = z - z0;

  const c000 = getLutValue(lut.data, size, x0, y0, z0);
  const c100 = getLutValue(lut.data, size, x1, y0, z0);
  const c010 = getLutValue(lut.data, size, x0, y1, z0);
  const c110 = getLutValue(lut.data, size, x1, y1, z0);
  const c001 = getLutValue(lut.data, size, x0, y0, z1);
  const c101 = getLutValue(lut.data, size, x1, y0, z1);
  const c011 = getLutValue(lut.data, size, x0, y1, z1);
  const c111 = getLutValue(lut.data, size, x1, y1, z1);

  const lerp3 = (
    a: [number, number, number],
    b: [number, number, number],
    t: number
  ): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  const c00 = lerp3(c000, c100, tx);
  const c10 = lerp3(c010, c110, tx);
  const c01 = lerp3(c001, c101, tx);
  const c11 = lerp3(c011, c111, tx);
  const c0 = lerp3(c00, c10, ty);
  const c1 = lerp3(c01, c11, ty);
  return lerp3(c0, c1, tz);
};

