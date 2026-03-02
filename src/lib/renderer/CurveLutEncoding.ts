const _floatToHalfView = new Float32Array(1);
const _floatToHalfIntView = new Int32Array(_floatToHalfView.buffer);

const floatToHalf = (value: number): number => {
  _floatToHalfView[0] = value;
  const x = _floatToHalfIntView[0] ?? 0;

  let bits = (x >> 16) & 0x8000;
  let m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;

  if (e < 103) {
    return bits;
  }
  if (e > 142) {
    bits |= 0x7c00;
    bits |= e === 255 && (x & 0x007fffff) ? 1 : 0;
    return bits;
  }
  if (e < 113) {
    m |= 0x0800;
    bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
    return bits;
  }

  bits |= ((e - 112) << 10) | (m >> 1);
  bits += m & 1;
  return bits;
};

export const encodeCurveLutToBytes = (source: Float32Array, target: Uint8Array): Uint8Array => {
  const length = Math.min(source.length, target.length);
  for (let i = 0; i < length; i += 1) {
    target[i] = Math.min(255, Math.max(0, Math.round((source[i] ?? 0) * 255)));
  }
  return target;
};

export const encodeCurveLutToHalfFloats = (
  source: Float32Array,
  target: Uint16Array
): Uint16Array => {
  const length = Math.min(source.length, target.length);
  for (let i = 0; i < length; i += 1) {
    target[i] = floatToHalf(Math.min(1, Math.max(0, source[i] ?? 0)));
  }
  return target;
};
