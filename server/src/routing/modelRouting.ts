import type { ParsedImageGenerationRequest } from "../shared/imageGenerationSchema";
import type { ProviderError } from "../providers/types";
import { resolveModelFallbackChain } from "../../../shared/providerCapabilityRegistry";

export const shouldFallbackToNextModel = (error: ProviderError) => error.isRetriable;

export const buildRoutedRequests = (
  payload: ParsedImageGenerationRequest
): ParsedImageGenerationRequest[] => {
  const models = resolveModelFallbackChain(payload.provider, payload.model);

  return models.map((model) => ({
    ...payload,
    model,
  }));
};
