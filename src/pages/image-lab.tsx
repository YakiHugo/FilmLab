import { useCallback, useMemo, useState } from "react";
import { IMAGE_STYLE_PRESETS, type ImageStylePreset } from "@/lib/ai/imageStylePresets";
import type { ImageModelParamValue } from "@/lib/ai/imageModelParams";
import { ImageChatFeed } from "@/features/image-lab/ImageChatFeed";
import { ImagePromptInput } from "@/features/image-lab/ImagePromptInput";
import { useImageGeneration } from "@/features/image-lab/hooks/useImageGeneration";
import {
  downloadAllResults,
  downloadImageFromUrl,
  getImageDownloadFilename,
} from "@/features/image-lab/utils/downloadUtils";
import type { ImageStyleId } from "@/types/imageGeneration";
import { IMAGE_GENERATION_LIMITS } from "@/lib/ai/imageGenerationSchema";

const resolveStepsForSpeed = (
  defaultSteps: number | undefined,
  speed: "fast" | "balanced" | "quality"
) => {
  const baseSteps = defaultSteps ?? 30;
  if (speed === "fast") {
    return Math.max(IMAGE_GENERATION_LIMITS.steps.min, baseSteps - 10);
  }
  if (speed === "quality") {
    return Math.min(IMAGE_GENERATION_LIMITS.steps.max, baseSteps + 15);
  }
  return Math.min(
    IMAGE_GENERATION_LIMITS.steps.max,
    Math.max(IMAGE_GENERATION_LIMITS.steps.min, baseSteps)
  );
};

const resolveSpeedFromSteps = (
  steps: number | null,
  defaultSteps: number | undefined
): "fast" | "balanced" | "quality" => {
  const baseSteps = defaultSteps ?? 30;
  const candidates = {
    fast: resolveStepsForSpeed(defaultSteps, "fast"),
    balanced: resolveStepsForSpeed(defaultSteps, "balanced"),
    quality: resolveStepsForSpeed(defaultSteps, "quality"),
  } as const;
  const target = steps ?? baseSteps;

  return (Object.entries(candidates) as Array<
    ["fast" | "balanced" | "quality", number]
  >).reduce(
    (closest, entry) =>
      Math.abs(entry[1] - target) < Math.abs(closest[1] - target) ? entry : closest,
    ["balanced", candidates.balanced]
  )[0];
};

export function ImageLabPage() {
  const imageGeneration = useImageGeneration();
  const [externalPrompt, setExternalPrompt] = useState<string | null>(null);
  const updateGenerationConfig = imageGeneration.updateConfig;
  const generationSpeed = resolveSpeedFromSteps(
    imageGeneration.config.steps,
    imageGeneration.modelConfig.defaultSteps
  );

  const selectedPreset = useMemo(
    () =>
      IMAGE_STYLE_PRESETS.find(
        (preset) => preset.stylePreset === imageGeneration.config.stylePreset
      ) ?? null,
    [imageGeneration.config.stylePreset]
  );
  const currentProvider = imageGeneration.providers.find(
    (provider) => provider.id === imageGeneration.config.provider
  );
  const currentModelName =
    currentProvider?.models.find((model) => model.id === imageGeneration.config.model)?.name ??
    imageGeneration.config.model;

  const selectStylePreset = (preset: ImageStylePreset) => {
    imageGeneration.updateConfig({
      style: preset.style,
      stylePreset: preset.stylePreset ?? "",
    });
  };

  const setBaseStyle = (style: ImageStyleId) => {
    imageGeneration.updateConfig({
      style,
      stylePreset: "",
    });
  };

  const updateModelExtraParam = (key: string, value: ImageModelParamValue) => {
    imageGeneration.updateConfig({
      modelParams: {
        ...imageGeneration.config.modelParams,
        [key]: value,
      },
    });
  };

  const handleDeleteTurn = useCallback(
    (turnId: string) => {
      imageGeneration.deleteTurn(turnId);
    },
    [imageGeneration]
  );

  const handleRetryTurn = useCallback(
    (turnId: string) => {
      void imageGeneration.retryTurn(turnId);
    },
    [imageGeneration]
  );

  const handleReuseParameters = useCallback(
    (turnId: string) => {
      const prompt = imageGeneration.reuseParameters(turnId);
      if (prompt) {
        setExternalPrompt(prompt);
      }
    },
    [imageGeneration]
  );

  const handleDownloadAll = useCallback(
    (turnId: string) => {
      const turn = imageGeneration.turns.find((entry) => entry.id === turnId);
      if (!turn) {
        return;
      }

      void downloadAllResults(turn.results);
    },
    [imageGeneration.turns]
  );

  const handleDownloadResult = useCallback(
    (turnId: string, index: number) => {
      const turn = imageGeneration.turns.find((entry) => entry.id === turnId);
      const result = turn?.results.find((entry) => entry.index === index);
      if (!result) {
        return;
      }

      void downloadImageFromUrl(
        result.imageUrl,
        getImageDownloadFilename(result.index + 1, result.mimeType)
      );
    },
    [imageGeneration.turns]
  );

  const handleUpscaleResult = useCallback(
    (turnId: string, index: number) => {
      void imageGeneration.upscaleResult(turnId, index);
    },
    [imageGeneration]
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#050506]">
      <ImageChatFeed
        turns={imageGeneration.turns}
        currentModelName={currentModelName}
        onToggleResultSelection={imageGeneration.toggleResultSelection}
        onSaveSelectedResults={(turnId) => {
          void imageGeneration.saveSelectedResults(turnId);
        }}
        onAddToCanvas={(turnId, index, assetId) => {
          void imageGeneration.addToCanvas(turnId, index, assetId);
        }}
        onDeleteTurn={handleDeleteTurn}
        onRetryTurn={handleRetryTurn}
        onReuseParameters={handleReuseParameters}
        onDownloadAll={handleDownloadAll}
        onDownloadResult={handleDownloadResult}
        onUpscaleResult={handleUpscaleResult}
      />

      <ImagePromptInput
        isGeneratingImage={imageGeneration.isGenerating}
        generationSpeed={generationSpeed}
        stylePresets={IMAGE_STYLE_PRESETS}
        selectedStylePresetId={selectedPreset?.id ?? null}
        styles={imageGeneration.styles}
        selectedStyleId={imageGeneration.config.style}
        imageProviders={imageGeneration.providers.map((provider) => ({
          id: provider.id,
          name: provider.name,
          models: provider.models.map((model) => ({
            id: model.id,
            name: model.name,
            description: model.description,
            costPerImage: model.costPerImage,
          })),
        }))}
        imageProvider={imageGeneration.config.provider}
        imageModel={imageGeneration.config.model}
        providerFeatures={imageGeneration.supportedFeatures}
        aspectRatioOptions={imageGeneration.aspectRatioOptions}
        maxBatchSize={imageGeneration.modelConfig.maxBatchSize ?? 4}
        commonParams={{
          aspectRatio: imageGeneration.config.aspectRatio,
          width: imageGeneration.config.width,
          height: imageGeneration.config.height,
          batchSize: imageGeneration.config.batchSize,
        }}
        modelParams={{
          seed: imageGeneration.config.seed,
          guidanceScale: imageGeneration.config.guidanceScale,
          steps: imageGeneration.config.steps,
          sampler: imageGeneration.config.sampler,
          negativePrompt: imageGeneration.config.negativePrompt,
          extra: imageGeneration.config.modelParams,
        }}
        modelParamDefinitions={imageGeneration.modelParamDefinitions}
        referenceImages={imageGeneration.config.referenceImages}
        externalPrompt={externalPrompt}
        onExternalPromptConsumed={() => setExternalPrompt(null)}
        onGenerationSpeedChange={(speed) =>
          updateGenerationConfig({
            steps: resolveStepsForSpeed(imageGeneration.modelConfig.defaultSteps, speed),
          })
        }
        onImageProviderChange={imageGeneration.setProvider}
        onImageModelChange={imageGeneration.setModel}
        onStyleChange={setBaseStyle}
        onSelectStylePreset={selectStylePreset}
        onCommonParamsChange={imageGeneration.updateConfig}
        onModelParamsChange={imageGeneration.updateConfig}
        onModelExtraParamChange={updateModelExtraParam}
        onAddReferenceFiles={(files) => {
          void imageGeneration.addReferenceFiles(files);
        }}
        onUpdateReferenceImage={imageGeneration.updateReferenceImage}
        onRemoveReferenceImage={imageGeneration.removeReferenceImage}
        onClearReferenceImages={imageGeneration.clearReferenceImages}
        onGenerateImage={(input) => {
          void imageGeneration.generateFromPromptInput(input);
        }}
      />
    </div>
  );
}
