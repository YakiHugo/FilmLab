import { getConfig } from "../config";
import type { ImageProviderId } from "../shared/imageGenerationSchema";
import { fluxImageProvider } from "./flux";
import { ideogramImageProvider } from "./ideogram";
import { openAiImageProvider } from "./openai";
import { stabilityImageProvider } from "./stability";
import type { ImageProviderAdapter } from "./types";

const PROVIDER_ADAPTERS: Record<ImageProviderId, ImageProviderAdapter> = {
  openai: openAiImageProvider,
  stability: stabilityImageProvider,
  flux: fluxImageProvider,
  ideogram: ideogramImageProvider,
};

export const getProviderAdapter = (providerId: ImageProviderId) =>
  PROVIDER_ADAPTERS[providerId];

const getServerApiKey = (providerId: ImageProviderId) => {
  const config = getConfig();
  switch (providerId) {
    case "openai":
      return config.openAiApiKey ?? "";
    case "stability":
      return config.stabilityApiKey ?? "";
    case "flux":
      return config.fluxApiKey ?? "";
    case "ideogram":
      return config.ideogramApiKey ?? "";
    default:
      return "";
  }
};

const coerceHeaderValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
};

export const getUserProviderKey = (
  headers: Record<string, string | string[] | undefined>,
  providerId: ImageProviderId
) => coerceHeaderValue(headers[`x-provider-key-${providerId}`]);

export const resolveApiKey = (providerId: ImageProviderId, userKey?: string) => {
  const normalizedUserKey = userKey?.trim();
  if (normalizedUserKey) {
    return normalizedUserKey;
  }

  return getServerApiKey(providerId);
};
