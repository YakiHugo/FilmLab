import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  return (Object.entries(candidates) as Array<["fast" | "balanced" | "quality", number]>).reduce(
    (closest, entry) =>
      Math.abs(entry[1] - target) < Math.abs(closest[1] - target) ? entry : closest,
    ["balanced", candidates.balanced]
  )[0];
};

export function ImageLabPage() {
  const imageGeneration = useImageGeneration();
  const [externalPrompt, setExternalPrompt] = useState<string | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);
  const updateGenerationConfig = imageGeneration.updateConfig;
  const {
    turns,
    deleteTurn,
    retryTurn,
    reuseParameters,
    upscaleResult,
    toggleResultSelection,
    saveSelectedResults,
    addToCanvas,
  } = imageGeneration;
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const generationSpeed = resolveSpeedFromSteps(
    imageGeneration.config.steps,
    imageGeneration.modelConfig.defaultSteps
  );

  useEffect(() => {
    if (!downloadFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDownloadFeedback(null);
    }, 4_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [downloadFeedback]);

  const selectedPreset = useMemo(
    () =>
      IMAGE_STYLE_PRESETS.find(
        (preset) => preset.stylePreset === imageGeneration.config.stylePreset
      ) ?? null,
    [imageGeneration.config.stylePreset]
  );
  const currentModelName = useMemo(() => {
    const currentProvider = imageGeneration.providers.find(
      (provider) => provider.id === imageGeneration.config.provider
    );
    return (
      currentProvider?.models.find((model) => model.id === imageGeneration.config.model)?.name ??
      imageGeneration.config.model
    );
  }, [imageGeneration.config.model, imageGeneration.config.provider, imageGeneration.providers]);

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

  const handleRetryTurn = useCallback(
    (turnId: string) => {
      void retryTurn(turnId);
    },
    [retryTurn]
  );

  const handleReuseParameters = useCallback(
    (turnId: string) => {
      const prompt = reuseParameters(turnId);
      if (prompt) {
        setExternalPrompt(prompt);
      }
    },
    [reuseParameters]
  );

  const handleDownloadAll = useCallback((turnId: string) => {
    const turn = turnsRef.current.find((entry) => entry.id === turnId);
    if (!turn) {
      return;
    }

    void downloadAllResults(turn.results).then((summary) => {
      if (summary.failed > 0) {
        const firstFailure = summary.failures[0]?.message;
        setDownloadFeedback(
          summary.succeeded > 0
            ? `Downloaded ${summary.succeeded} images, ${summary.failed} failed.${firstFailure ? ` ${firstFailure}` : ""}`
            : (firstFailure ?? `Failed to download ${summary.failed} images.`)
        );
      }
    });
  }, []);

  const handleDownloadResult = useCallback((turnId: string, index: number) => {
    const turn = turnsRef.current.find((entry) => entry.id === turnId);
    const result = turn?.results.find((entry) => entry.index === index);
    if (!result) {
      return;
    }

    void downloadImageFromUrl(
      result.imageUrl,
      getImageDownloadFilename(result.index + 1, result.mimeType)
    ).catch((error: unknown) => {
      setDownloadFeedback(
        error instanceof Error ? error.message : "Generated image could not be downloaded."
      );
    });
  }, []);

  const handleUpscaleResult = useCallback(
    (turnId: string, index: number) => {
      void upscaleResult(turnId, index);
    },
    [upscaleResult]
  );

  const handleExternalPromptConsumed = useCallback(() => {
    setExternalPrompt(null);
  }, []);

  const handleGenerationSpeedChange = useCallback(
    (speed: "fast" | "balanced" | "quality") => {
      updateGenerationConfig({
        steps: resolveStepsForSpeed(imageGeneration.modelConfig.defaultSteps, speed),
      });
    },
    [imageGeneration.modelConfig.defaultSteps, updateGenerationConfig]
  );

  const handleSaveSelectedResults = useCallback(
    (turnId: string) => {
      void saveSelectedResults(turnId);
    },
    [saveSelectedResults]
  );

  const handleAddToCanvas = useCallback(
    (turnId: string, index: number, assetId?: string | null) => {
      void addToCanvas(turnId, index, assetId);
    },
    [addToCanvas]
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#050506]">
      <ImageChatFeed
        turns={turns}
        currentModelName={currentModelName}
        onToggleResultSelection={toggleResultSelection}
        onSaveSelectedResults={handleSaveSelectedResults}
        onAddToCanvas={handleAddToCanvas}
        onDeleteTurn={deleteTurn}
        onRetryTurn={handleRetryTurn}
        onReuseParameters={handleReuseParameters}
        onDownloadAll={handleDownloadAll}
        onDownloadResult={handleDownloadResult}
        onUpscaleResult={handleUpscaleResult}
      />

      {downloadFeedback ? (
        <div
          role="alert"
          className="border-t border-white/6 bg-[#090b10] px-6 py-2 text-sm text-amber-200 lg:px-8"
        >
          {downloadFeedback}
        </div>
      ) : null}

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
        onExternalPromptConsumed={handleExternalPromptConsumed}
        onGenerationSpeedChange={handleGenerationSpeedChange}
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
