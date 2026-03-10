import { getConfig } from "../config";
import { getImageProviderCredentialSlot } from "../../../shared/imageProviderCatalog";
import type { ImageProviderId } from "../shared/imageGenerationSchema";
import { createProviderAdapter, type ProviderProtocol } from "./protocol";
import { klingImageProtocol } from "./kling";
import { qwenImageProtocol } from "./qwen";
import { seedreamImageProtocol } from "./seedream";
import { zImageProtocol } from "./zimage";
import type { ImageProviderAdapter } from "./types";

const PROVIDER_PROTOCOLS: Record<ImageProviderId, ProviderProtocol<any, any, any, any>> = {
  seedream: seedreamImageProtocol,
  qwen: qwenImageProtocol,
  zimage: zImageProtocol,
  kling: klingImageProtocol,
};

const PROVIDER_ADAPTERS: Record<ImageProviderId, ImageProviderAdapter> = {
  seedream: createProviderAdapter(PROVIDER_PROTOCOLS.seedream),
  qwen: createProviderAdapter(PROVIDER_PROTOCOLS.qwen),
  zimage: createProviderAdapter(PROVIDER_PROTOCOLS.zimage),
  kling: createProviderAdapter(PROVIDER_PROTOCOLS.kling),
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
