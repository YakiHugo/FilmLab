export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const range = edge1 - edge0;
  if (range === 0) {
    return x >= edge1 ? 1 : 0;
  }
  const t = clamp((x - edge0) / range, 0, 1);
  return t * t * (3 - 2 * t);
};

const hash32 = (value: number) => {
  let x = value | 0;
  x = (x ^ 61) ^ (x >>> 16);
  x = x + (x << 3);
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return x >>> 0;
};

export const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const hashNoise2d = (x: number, y: number, seed: number) => {
  const mixed =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(seed | 0, 2246822519);
  return hash32(mixed) / 4294967295;
};

export const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967295;
  };
};

export const toByte = (value: number) => Math.round(clamp(value, 0, 255));

export const toUnit = (value: number) => clamp(value / 255, 0, 1);
