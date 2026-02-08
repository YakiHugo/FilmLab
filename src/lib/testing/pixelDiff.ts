export const computeMae = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  if (a.length !== b.length) {
    throw new Error("Pixel buffers must have the same length.");
  }
  if (a.length === 0) {
    return 0;
  }
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    total += Math.abs((a[index] ?? 0) - (b[index] ?? 0));
  }
  return total / a.length / 255;
};

