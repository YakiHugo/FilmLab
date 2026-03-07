import { useEffect, useMemo, useState } from "react";
import { IMAGE_STYLE_PRESETS, type ImageStylePreset } from "@/lib/ai/imageStylePresets";
import type { ImageModelParamValue } from "@/lib/ai/imageModelParams";
import { ImageChatFeed } from "@/features/image-lab/ImageChatFeed";
import { ImagePromptInput } from "@/features/image-lab/ImagePromptInput";
import { useImageGeneration } from "@/features/image-lab/hooks/useImageGeneration";
import type { ImageStyleId } from "@/types/imageGeneration";

const IMAGE_SPEED_TO_STEPS: Record<"fast" | "balanced" | "quality", number> = {
  fast: 20,
  balanced: 30,
  quality: 45,
};

export function ImageLabPage() {
  const imageGeneration = useImageGeneration();
  const updateGenerationConfig = imageGeneration.updateConfig;
  const [imagePrompt, setImagePrompt] = useState("");
  const [generationSpeed, setGenerationSpeed] = useState<"fast" | "balanced" | "quality">(
    "fast"
  );

  useEffect(() => {
    updateGenerationConfig({ steps: IMAGE_SPEED_TO_STEPS[generationSpeed] });
  }, [generationSpeed, updateGenerationConfig]);

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

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#050506]">
      <ImageChatFeed
        turns={imageGeneration.turns}
        currentModelName={currentModelName}
        onToggleResultSelection={imageGeneration.toggleResultSelection}
        onSaveSelectedResults={(turnId) => {
          void imageGeneration.saveSelectedResults(turnId);
        }}
        onAddToCanvas={(turnId, assetId) => {
          void imageGeneration.addToCanvas(turnId, assetId);
        }}
      />

      <ImagePromptInput
        isGeneratingImage={imageGeneration.isGenerating}
        promptValue={imagePrompt}
        onPromptChange={setImagePrompt}
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
        onGenerationSpeedChange={setGenerationSpeed}
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
