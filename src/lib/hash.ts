const toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

const fallbackHash = (bytes: Uint8Array) => {
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const sha256FromBytes = async (bytes: Uint8Array): Promise<string> => {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const normalizedBytes = new Uint8Array(bytes);
    const digest = await crypto.subtle.digest("SHA-256", normalizedBytes.buffer);
    return toHex(new Uint8Array(digest));
  }

  // Only used in environments that do not expose WebCrypto.
  return fallbackHash(bytes);
};

export const sha256FromBlob = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer();
  return sha256FromBytes(new Uint8Array(buffer));
};

export const sha256FromCanvas = async (
  canvas: Pick<HTMLCanvasElement, "width" | "height" | "getContext">
): Promise<string> => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Failed to acquire 2D canvas context for hashing.");
  }
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const encoded = new Uint8Array(8 + imageData.data.length);
  const view = new DataView(encoded.buffer);
  view.setUint32(0, canvas.width);
  view.setUint32(4, canvas.height);
  encoded.set(imageData.data, 8);
  return sha256FromBytes(encoded);
};
