import { resolveRouteTarget } from "../gateway/router/registry";
import type { ParsedImageGenerationRequest } from "./imageGenerationSchema";

export const getImageGenerationCapabilityWarnings = (
  request: ParsedImageGenerationRequest
): string[] => {
  const target = resolveRouteTarget({
    providerId: request.provider,
    model: request.model,
    operation: "generate",
  });
  if (!target) {
    return [];
  }

  const warnings: string[] = [];
  if (!target.capability.referenceImages.enabled && request.referenceImages.length > 0) {
    const count = request.referenceImages.length;
    warnings.push(
      `${target.family.displayName} ${target.model.displayName} ignores ${count} reference image${
        count === 1 ? "" : "s"
      }.`
    );
  }

  return warnings;
};
