import { randomUUID } from "node:crypto";
import { getConfig } from "../config";
import { ProviderError } from "../providers/types";

interface StoredGeneratedImage {
  buffer: Buffer;
  mimeType: string;
  expiresAt: number;
  sizeBytes: number;
}

const GENERATED_IMAGE_TTL_MS = 15 * 60 * 1_000;
const generatedImages = new Map<string, StoredGeneratedImage>();
let totalStoredBytes = 0;

const deleteGeneratedImage = (id: string, entry?: StoredGeneratedImage) => {
  const existingEntry = entry ?? generatedImages.get(id);
  if (!existingEntry) {
    return;
  }

  generatedImages.delete(id);
  totalStoredBytes = Math.max(0, totalStoredBytes - existingEntry.sizeBytes);
};

const cleanupExpiredEntries = () => {
  const now = Date.now();
  for (const [id, entry] of generatedImages.entries()) {
    if (entry.expiresAt <= now) {
      deleteGeneratedImage(id, entry);
    }
  }
};

const evictUntilWithinLimits = (incomingSizeBytes: number) => {
  const config = getConfig();

  while (
    generatedImages.size > 0 &&
    (generatedImages.size >= config.generatedImageStoreMaxItems ||
      totalStoredBytes + incomingSizeBytes > config.generatedImageStoreMaxBytes)
  ) {
    const oldestEntry = generatedImages.entries().next().value;
    if (!oldestEntry) {
      break;
    }

    deleteGeneratedImage(oldestEntry[0], oldestEntry[1]);
  }
};

export const storeGeneratedImage = (buffer: Buffer, mimeType: string) => {
  cleanupExpiredEntries();
  const config = getConfig();
  const sizeBytes = buffer.byteLength;

  if (sizeBytes > config.generatedImageStoreMaxBytes) {
    throw new ProviderError("Generated image is too large to cache.", 503);
  }

  evictUntilWithinLimits(sizeBytes);
  const id = randomUUID();
  generatedImages.set(id, {
    buffer,
    mimeType,
    expiresAt: Date.now() + GENERATED_IMAGE_TTL_MS,
    sizeBytes,
  });
  totalStoredBytes += sizeBytes;
  return id;
};

export const getGeneratedImage = (id: string) => {
  cleanupExpiredEntries();
  const entry = generatedImages.get(id);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    deleteGeneratedImage(id, entry);
    return null;
  }

  return entry;
};
