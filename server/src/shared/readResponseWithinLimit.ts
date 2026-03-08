import { ProviderError } from "../providers/types";

export const readResponseBufferWithinLimit = async (
  response: Response,
  maxBytes: number,
  tooLargeMessage: string
) => {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new ProviderError(tooLargeMessage, 413);
    }
  }

  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new ProviderError(tooLargeMessage, 413);
    }
    return Buffer.from(arrayBuffer);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    totalBytes += chunk.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel(tooLargeMessage).catch(() => undefined);
      throw new ProviderError(tooLargeMessage, 413);
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks, totalBytes);
};

export const getImageContentType = (response: Response, fallback = "image/png") => {
  const contentType = response.headers.get("content-type") ?? "";
  const normalized = contentType.split(";")[0]?.trim();
  if (normalized?.startsWith("image/")) {
    return normalized;
  }
  return fallback;
};
