import { getFrontendImageModelById } from "../models/frontendRegistry";
import type { ParsedImageGenerationRequest } from "./imageGenerationSchema";

export const getImageGenerationCapabilityWarnings = (
  request: ParsedImageGenerationRequest
): string[] => {
  const frontendModel = getFrontendImageModelById(request.modelId);
  if (!frontendModel) {
    return [];
  }

  const warnings: string[] = [];
  const guidedAssetCount = (request.assetRefs ?? []).filter(
    (assetRef) => assetRef.role === "reference"
  ).length;
  if (!frontendModel.constraints.referenceImages.enabled && guidedAssetCount > 0) {
    const count = guidedAssetCount;
    warnings.push(
      `${frontendModel.label} ignores ${count} reference image${count === 1 ? "" : "s"}.`
    );
  }

  return warnings;
};
