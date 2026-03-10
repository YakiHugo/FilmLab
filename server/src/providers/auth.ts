import type { ImageProviderId } from "../shared/imageGenerationSchema";
import type { ProviderRequestContext } from "./types";

export type ProviderAuthStrategy = (
  apiKey: string,
  requestContext?: ProviderRequestContext
) => Record<string, string>;

const AUTH_STRATEGIES: Partial<Record<ImageProviderId, ProviderAuthStrategy>> = {};

export const registerAuthStrategy = (
  providerId: ImageProviderId,
  strategy: ProviderAuthStrategy
) => {
  AUTH_STRATEGIES[providerId] = strategy;
};

export const resolveAuthHeaders = (
  providerId: ImageProviderId,
  apiKey: string,
  requestContext?: ProviderRequestContext
) => {
  const strategy = AUTH_STRATEGIES[providerId];
  if (!strategy) {
    return {};
  }

  return strategy(apiKey, requestContext);
};
