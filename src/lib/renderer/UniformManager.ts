export const copyVec3 = (
  target: Float32Array,
  source: readonly [number, number, number]
): void => {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
};

export const copyMat3 = (target: Float32Array, source: readonly number[]): void => {
  for (let i = 0; i < 9; i += 1) {
    target[i] = source[i] ?? (i % 4 === 0 ? 1 : 0);
  }
};

export const resolveShortEdgePx = (width: number, height: number): number =>
  Math.max(1, Math.min(width, height));
