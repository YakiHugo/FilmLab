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
  if (!frontendModel.constraints.referenceImages.enabled && request.referenceImages.length > 0) {
    const count = request.referenceImages.length;
    warnings.push(
      `${frontendModel.label} ignores ${count} reference image${count === 1 ? "" : "s"}.`
    );
  }

  return warnings;
};
