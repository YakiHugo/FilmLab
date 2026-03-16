import type { GenerationConfig } from "@/stores/generationConfigStore";
import {
  validateImageAssetRefs,
  type ImageGenerationAssetRefRole,
  type ReferenceImage,
} from "@/types/imageGeneration";

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

const toBoundReferenceImage = (
  assetId: string,
  referenceImage: ReferenceImage
): ReferenceImage => ({
  ...referenceImage,
  type: "content",
  weight: 1,
  sourceAssetId: assetId,
});

const resolveBoundReferenceImage = (
  config: GenerationConfig,
  assetId: string,
  referenceImage?: ReferenceImage | null
) =>
  referenceImage ??
  config.referenceImages.find(
    (entry) => entry.sourceAssetId === assetId
  ) ??
  null;

const withUpdatedAssetBinding = (
  config: GenerationConfig,
  input: {
    assetId: string;
    role: ImageGenerationAssetRefRole;
    includeReferenceImage: boolean;
    referenceImage?: ReferenceImage | null;
  }
) => {
  const nextAssetRefs = dedupeAssetRefs([
    { assetId: input.assetId, role: input.role },
    ...config.assetRefs.filter((assetRef) => assetRef.assetId !== input.assetId),
  ]);
  const issues = validateImageAssetRefs(nextAssetRefs);
  if (issues.length > 0) {
    return {
      nextConfig: config,
      error: issues[0]?.message ?? "Asset roles are incompatible for this turn.",
    };
  }

  const nextReferenceImage = resolveBoundReferenceImage(
    config,
    input.assetId,
    input.referenceImage
  );
  const referenceImages = input.includeReferenceImage && nextReferenceImage
    ? [
        toBoundReferenceImage(input.assetId, nextReferenceImage),
        ...config.referenceImages.filter(
          (referenceImage) => referenceImage.sourceAssetId !== input.assetId
        ),
      ]
    : config.referenceImages.filter(
        (referenceImage) => referenceImage.sourceAssetId !== input.assetId
      );

  return {
    nextConfig: {
      ...config,
      referenceImages,
      assetRefs: nextAssetRefs,
    },
    error: null,
  };
};

export const bindResultAssetToConfig = (
  config: GenerationConfig,
  input: {
    assetId: string;
    role: ImageGenerationAssetRefRole;
    includeReferenceImage: boolean;
    referenceImage?: ReferenceImage | null;
  }
) => withUpdatedAssetBinding(config, input);

export const updateAssetRefRoleInConfig = (
  config: GenerationConfig,
  input: {
    assetId: string;
    role: ImageGenerationAssetRefRole;
    includeReferenceImage: boolean;
  }
) =>
  withUpdatedAssetBinding(config, {
    ...input,
    referenceImage: null,
  });

export const bindResultReferenceToConfig = (
  config: GenerationConfig,
  input: {
    assetId: string;
    referenceImage: ReferenceImage;
  }
): GenerationConfig =>
  bindResultAssetToConfig(config, {
    assetId: input.assetId,
    role: "reference",
    includeReferenceImage: true,
    referenceImage: input.referenceImage,
  }).nextConfig;

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
): { nextConfig: GenerationConfig; removedReferenceImageCount: number } => ({
  nextConfig: {
    ...config,
    referenceImages: [],
  },
  removedReferenceImageCount: config.referenceImages.length,
});

export const clearBoundResultReferencesFromConfig = (
  config: GenerationConfig
): GenerationConfig => ({
  ...config,
  referenceImages: config.referenceImages.filter(
    (referenceImage) => !referenceImage.sourceAssetId
  ),
  assetRefs: [],
});
