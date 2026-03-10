import {
  getImageModelFeatureSupport,
  getImageModelName,
  getImageProviderName,
} from "../../../shared/imageProviderCatalog";
import type { ParsedImageGenerationRequest } from "./imageGenerationSchema";

export const getImageGenerationCapabilityWarnings = (
  request: ParsedImageGenerationRequest
): string[] => {
  const featureSupport = getImageModelFeatureSupport(request.provider, request.model);
  if (!featureSupport) {
    return [];
  }

  const warnings: string[] = [];
  if (!featureSupport.referenceImages.enabled && request.referenceImages.length > 0) {
    const providerName = getImageProviderName(request.provider);
    const modelName = getImageModelName(request.provider, request.model);
    const count = request.referenceImages.length;
    warnings.push(
      `${providerName} ${modelName} ignores ${count} reference image${count === 1 ? "" : "s"}.`
    );
  }

  return warnings;
};
