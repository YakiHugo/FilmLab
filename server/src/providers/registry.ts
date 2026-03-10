import { getConfig } from "../config";
import { getImageProviderCredentialSlot } from "../../../shared/imageProviderCatalog";
import type { ImageProviderId } from "../shared/imageGenerationSchema";
import { klingImageProvider } from "./kling";
import { qwenImageProvider } from "./qwen";
import seedreamImageProvider from "./seedream";
import { zImageProvider } from "./zimage";
import type { ImageProviderAdapter } from "./types";

const PROVIDER_ADAPTERS: Record<ImageProviderId, ImageProviderAdapter> = {
  seedream: seedreamImageProvider,
  qwen: qwenImageProvider,
  zimage: zImageProvider,
  kling: klingImageProvider,
};

export const getProviderAdapter = (providerId: ImageProviderId) =>
  PROVIDER_ADAPTERS[providerId];

const getServerApiKey = (providerId: ImageProviderId) => {
  const config = getConfig();
  switch (getImageProviderCredentialSlot(providerId)) {
    case "ark":
      return config.arkApiKey ?? "";
    case "dashscope":
      return config.dashscopeApiKey ?? "";
    case "kling":
      return config.klingApiKey ?? "";
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
