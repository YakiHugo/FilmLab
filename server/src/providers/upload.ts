import type { ImageProviderId } from "../shared/imageGenerationSchema";
import { getGeneratedImage } from "../shared/generatedImageStore";
import { toDataUrl } from "./types";

export interface LocalAsset {
  url?: string;
  buffer?: Buffer;
  mimeType?: string;
}

export interface UploadRequestContext {
  signal?: AbortSignal;
}

export type ProviderUploadStrategy = (
  localAsset: LocalAsset,
  apiKey: string,
  requestContext?: UploadRequestContext
) => Promise<string>;

const UPLOAD_STRATEGIES: Partial<Record<ImageProviderId, ProviderUploadStrategy>> = {};

const toGeneratedImageDataUrl = (url: string) => {
  const match = url.match(/^\/?api\/generated-images\/([A-Za-z0-9_-]+)$/);
  if (!match?.[1]) {
    return null;
  }

  const image = getGeneratedImage(match[1]);
  if (!image) {
    return null;
  }

  return toDataUrl(image.buffer, image.mimeType);
};

const defaultNoopUploadStrategy: ProviderUploadStrategy = async (localAsset) => {
  if (typeof localAsset.url === "string" && localAsset.url.trim()) {
    return localAsset.url.trim();
  }
  if (localAsset.buffer && localAsset.mimeType) {
    return toDataUrl(localAsset.buffer, localAsset.mimeType);
  }

  return "";
};

export const registerUploadStrategy = (
  providerId: ImageProviderId,
  strategy: ProviderUploadStrategy
) => {
  UPLOAD_STRATEGIES[providerId] = strategy;
};

export const createGeneratedImageUploadStrategy = (): ProviderUploadStrategy => async (
  localAsset
) => {
  if (typeof localAsset.url === "string" && localAsset.url.trim()) {
    const normalizedUrl = localAsset.url.trim();
    const generatedImageDataUrl = toGeneratedImageDataUrl(normalizedUrl);
    if (generatedImageDataUrl) {
      return generatedImageDataUrl;
    }
    return normalizedUrl;
  }

  if (localAsset.buffer && localAsset.mimeType) {
    return toDataUrl(localAsset.buffer, localAsset.mimeType);
  }

  return "";
};

export const uploadAssetIfNeeded = async (
  providerId: ImageProviderId,
  localAsset: LocalAsset,
  apiKey: string,
  requestContext?: UploadRequestContext
) => {
  const strategy = UPLOAD_STRATEGIES[providerId] ?? defaultNoopUploadStrategy;
  return strategy(localAsset, apiKey, requestContext);
};
