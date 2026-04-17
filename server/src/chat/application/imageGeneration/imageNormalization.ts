import type { FastifyBaseLogger } from "fastify";
import type { ImageProviderId } from "../../../../../shared/imageGeneration";
import { downloadGeneratedImage, type DownloadGeneratedImageConfig } from "../../../shared/downloadGeneratedImage";
import { assertGeneratedImageSize } from "./helpers";

export type NormalizedGeneratedImageEntry = {
  buffer: Buffer;
  provider: ImageProviderId;
  model: string;
  mimeType: string;
  revisedPrompt: string | null;
  index: number;
};

export const normalizeGeneratedImage = async (
  image: {
    binaryData?: Buffer;
    imageUrl?: string;
    mimeType?: string;
    revisedPrompt?: string | null;
  },
  index: number,
  signal: AbortSignal,
  maxBytes: number,
  downloadConfig: DownloadGeneratedImageConfig
) => {
  let buffer: Buffer | null = null;
  let mimeType: string | null = null;

  if (image.imageUrl) {
    const downloaded = await downloadGeneratedImage(image.imageUrl, downloadConfig, { signal });
    buffer = downloaded.buffer;
    mimeType = downloaded.mimeType;
  } else if (image.binaryData && image.mimeType) {
    buffer = image.binaryData;
    mimeType = image.mimeType;
  }

  if (!buffer || !mimeType) {
    return null;
  }

  assertGeneratedImageSize(buffer, maxBytes);

  return {
    buffer,
    mimeType,
    revisedPrompt: image.revisedPrompt ?? null,
    index,
  };
};

export const collectNormalizedImages = (
  settledResults: Array<PromiseSettledResult<Awaited<ReturnType<typeof normalizeGeneratedImage>>>>,
  meta: {
    provider: ImageProviderId;
    providerModel: string;
    conversationId: string | null;
    turnId: string | null;
    runId: string | null;
  },
  logger: FastifyBaseLogger
) => {
  const normalizedImages: NormalizedGeneratedImageEntry[] = [];
  let normalizationFailureCount = 0;
  let firstNormalizationError: unknown = null;

  for (const [settledIndex, result] of settledResults.entries()) {
    if (result.status === "fulfilled") {
      if (result.value) {
        normalizedImages.push({
          buffer: result.value.buffer,
          provider: meta.provider,
          model: meta.providerModel,
          mimeType: result.value.mimeType,
          revisedPrompt: result.value.revisedPrompt,
          index: result.value.index,
        });
      }
      continue;
    }

    normalizationFailureCount += 1;
    firstNormalizationError ??= result.reason;
    logger.warn(
      {
        err: result.reason,
        imageIndex: settledIndex,
        conversationId: meta.conversationId,
        turnId: meta.turnId,
        runId: meta.runId,
      },
      "Generated image result could not be normalized."
    );
  }

  return { normalizedImages, normalizationFailureCount, firstNormalizationError };
};
