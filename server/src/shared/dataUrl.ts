const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;

export const isDataUrl = (value: string) => DATA_URL_PATTERN.test(value);

export const dataUrlToBlob = (dataUrl: string) => {
  const match = dataUrl.match(DATA_URL_PATTERN);
  if (!match) {
    throw new Error("Invalid data URL.");
  }

  const mimeType = match[1] ?? "application/octet-stream";
  const base64 = match[2] ?? "";
  const buffer = Buffer.from(base64, "base64");
  return new Blob([buffer], { type: mimeType });
};

export const extensionFromMimeType = (mimeType: string) => {
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "png";
};
