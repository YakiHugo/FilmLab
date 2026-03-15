import type { GenerationConfig } from "@/stores/generationConfigStore";
import type { ReferenceImage } from "@/types/imageGeneration";

const dedupeAssetRefs = (assetRefs: GenerationConfig["assetRefs"]) => {
  const seen = new Set<string>();
  return assetRefs.filter((assetRef) => {
    const key = `${assetRef.assetId}:${assetRef.role}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const bindResultReferenceToConfig = (
  config: GenerationConfig,
  input: {
    assetId: string;
    referenceImage: ReferenceImage;
  }
): GenerationConfig => {
  const nextReferenceImage: ReferenceImage = {
    ...input.referenceImage,
    type: "content",
    weight: 1,
    sourceAssetId: input.assetId,
  };

  return {
    ...config,
    referenceImages: [
      nextReferenceImage,
      ...config.referenceImages.filter((referenceImage) => referenceImage.sourceAssetId !== input.assetId),
    ],
    assetRefs: dedupeAssetRefs([
      { assetId: input.assetId, role: "reference" },
      ...config.assetRefs.filter((assetRef) => assetRef.assetId !== input.assetId),
    ]),
  };
};

export const removeBoundResultReferenceFromConfig = (
  config: GenerationConfig,
  assetId: string
): GenerationConfig => ({
  ...config,
  referenceImages: config.referenceImages.filter(
    (referenceImage) => referenceImage.sourceAssetId !== assetId
  ),
  assetRefs: config.assetRefs.filter((assetRef) => assetRef.assetId !== assetId),
});

export const clearReferenceInputsForUnsupportedModel = (
  config: GenerationConfig
): { nextConfig: GenerationConfig; removedReferenceImageCount: number } => {
  if (config.referenceImages.length === 0) {
    return {
      nextConfig: {
        ...config,
        referenceImages: [],
      },
      removedReferenceImageCount: 0,
    };
  }

  const boundAssetIds = new Set(
    config.referenceImages
      .map((referenceImage) => referenceImage.sourceAssetId)
      .filter((assetId): assetId is string => typeof assetId === "string" && assetId.trim().length > 0)
  );

  return {
    nextConfig: {
      ...config,
      referenceImages: [],
      assetRefs: config.assetRefs.filter((assetRef) => !boundAssetIds.has(assetRef.assetId)),
    },
    removedReferenceImageCount: config.referenceImages.length,
  };
};

export const clearBoundResultReferencesFromConfig = (
  config: GenerationConfig
): GenerationConfig => {
  const boundAssetIds = new Set(
    config.referenceImages
      .map((referenceImage) => referenceImage.sourceAssetId)
      .filter((assetId): assetId is string => typeof assetId === "string" && assetId.trim().length > 0)
  );

  if (boundAssetIds.size === 0) {
    return {
      ...config,
      assetRefs: [],
    };
  }

  return {
    ...config,
    referenceImages: config.referenceImages.filter(
      (referenceImage) => !referenceImage.sourceAssetId
    ),
    assetRefs: [],
  };
};
