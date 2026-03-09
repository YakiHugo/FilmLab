import type { ParsedImageGenerationRequest } from "../shared/imageGenerationSchema";
import { resolveModelFallbackChain } from "../../../shared/providerCapabilityRegistry";

export const shouldFallbackToNextModel = (statusCode?: number) => {
  if (typeof statusCode !== "number") {
    return true;
  }

  return statusCode === 408 || statusCode === 409 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
};

export const buildRoutedRequests = (
  payload: ParsedImageGenerationRequest
): ParsedImageGenerationRequest[] => {
  const models = resolveModelFallbackChain(payload.provider, payload.model);

  return models.map((model) => ({
    ...payload,
    model,
  }));
};
