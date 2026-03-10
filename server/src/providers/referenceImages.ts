import type { ParsedImageGenerationRequest } from "../shared/imageGenerationSchema";

export const getUnsupportedReferenceImageWarning = (
  providerName: string,
  count: number
) =>
  `${providerName} does not support reference images yet. Ignored ${count} reference image${count === 1 ? "" : "s"}.`;

export const getReferenceImageWarningsForUnsupportedProvider = (
  request: ParsedImageGenerationRequest,
  providerName: string
) => {
  const count = request.referenceImages.length;
  if (count === 0) {
    return [];
  }

  return [getUnsupportedReferenceImageWarning(providerName, count)];
};
