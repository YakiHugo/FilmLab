import type { GenerationConfig } from "@/stores/generationConfigStore";
import { dedupeImageInputAssets, type ImageGenerationOperation } from "@/types/imageGeneration";

const getGuideInputAssets = (config: GenerationConfig) =>
  config.inputAssets.filter((inputAsset) => inputAsset.binding === "guide");

const getSourceInputAssets = (config: GenerationConfig) =>
  config.inputAssets.filter((inputAsset) => inputAsset.binding === "source");

export const bindGuideAssetToConfig = (
  config: GenerationConfig,
  input: {
    assetId: string;
    guideType?: "style" | "content" | "controlnet";
    weight?: number;
  }
): GenerationConfig => {
  const nextInputAssets = dedupeImageInputAssets([
    {
      assetId: input.assetId,
      binding: "guide",
      guideType: input.guideType ?? "content",
      ...(typeof input.weight === "number" ? { weight: input.weight } : { weight: 1 }),
    },
    ...config.inputAssets.filter((inputAsset) => inputAsset.assetId !== input.assetId),
  ]);
  const hasSourceAsset = nextInputAssets.some((inputAsset) => inputAsset.binding === "source");

  return {
    ...config,
    operation: hasSourceAsset ? config.operation : "generate",
    inputAssets: nextInputAssets,
  };
};

export const updateGuideAssetInConfig = (
  config: GenerationConfig,
  assetId: string,
  patch: {
    guideType?: "style" | "content" | "controlnet";
    weight?: number;
  }
): GenerationConfig => ({
  ...config,
  inputAssets: config.inputAssets.map((inputAsset) =>
    inputAsset.assetId === assetId && inputAsset.binding === "guide"
      ? {
          ...inputAsset,
          ...(patch.guideType ? { guideType: patch.guideType } : {}),
          ...(typeof patch.weight === "number" ? { weight: patch.weight } : {}),
        }
      : inputAsset
  ),
});

export const removeGuideAssetFromConfig = (
  config: GenerationConfig,
  assetId: string
): GenerationConfig => {
  const nextInputAssets = config.inputAssets.filter(
    (inputAsset) =>
      !(inputAsset.assetId === assetId && inputAsset.binding === "guide")
  );
  const hasSourceAsset = nextInputAssets.some((inputAsset) => inputAsset.binding === "source");

  return {
    ...config,
    operation: hasSourceAsset ? config.operation : "generate",
    inputAssets: nextInputAssets,
  };
};

export const clearGuideAssetsFromConfig = (config: GenerationConfig): GenerationConfig => {
  const nextInputAssets = config.inputAssets.filter((inputAsset) => inputAsset.binding !== "guide");
  const hasSourceAsset = nextInputAssets.some((inputAsset) => inputAsset.binding === "source");

  return {
    ...config,
    operation: hasSourceAsset ? config.operation : "generate",
    inputAssets: nextInputAssets,
  };
};

export const setSourceAssetInConfig = (
  config: GenerationConfig,
  input: {
    assetId: string;
    operation: Exclude<ImageGenerationOperation, "generate">;
  }
): GenerationConfig => ({
  ...config,
  operation: input.operation,
  inputAssets: dedupeImageInputAssets([
    {
      assetId: input.assetId,
      binding: "source",
    },
    ...getGuideInputAssets(config),
  ]),
});

export const clearSourceAssetFromConfig = (config: GenerationConfig): GenerationConfig => ({
  ...config,
  operation: "generate",
  inputAssets: getGuideInputAssets(config),
});

export const removeInputAssetFromConfig = (
  config: GenerationConfig,
  assetId: string
): GenerationConfig => {
  const remainingInputAssets = config.inputAssets.filter((inputAsset) => inputAsset.assetId !== assetId);
  const stillHasSource = remainingInputAssets.some((inputAsset) => inputAsset.binding === "source");

  return {
    ...config,
    operation: stillHasSource ? config.operation : "generate",
    inputAssets: remainingInputAssets,
  };
};

export const clearImageInputsForUnsupportedModel = (
  config: GenerationConfig
): {
  nextConfig: GenerationConfig;
  removedGuideCount: number;
  removedSourceCount: number;
} => ({
  nextConfig: {
    ...config,
    operation: "generate",
    inputAssets: [],
  },
  removedGuideCount: getGuideInputAssets(config).length,
  removedSourceCount: getSourceInputAssets(config).length,
});
