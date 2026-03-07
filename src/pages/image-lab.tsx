import { useEffect, useMemo, useState } from "react";
import { PanelRight } from "lucide-react";
import { IMAGE_STYLE_PRESETS, type ImageStylePreset } from "@/lib/ai/imageStylePresets";
import type { ImageModelParamValue } from "@/lib/ai/imageModelParams";
import { ImagePromptInput } from "@/features/image-lab/ImagePromptInput";
import { ImageGenerationPanel } from "@/features/image-lab/ImageGenerationPanel";
import { ImageStyleGrid } from "@/features/image-lab/ImageStyleGrid";
import { useImageGeneration } from "@/features/image-lab/hooks/useImageGeneration";

const IMAGE_SPEED_TO_STEPS: Record<"fast" | "balanced" | "quality", number> = {
  fast: 20,
  balanced: 30,
  quality: 45,
};

const IMAGE_GRID_COLS = {
  normal: "lg:grid-cols-[minmax(0,1fr)_280px]",
  collapsed: "lg:grid-cols-[minmax(0,1fr)_84px]",
} as const;

export function ImageLabPage() {
  const imageGeneration = useImageGeneration();
  const updateGenerationConfig = imageGeneration.updateConfig;
  const [configPanelCollapsed, setConfigPanelCollapsed] = useState(false);
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

  const selectStylePreset = (preset: ImageStylePreset) => {
    imageGeneration.updateConfig({
      style: preset.style,
      stylePreset: preset.stylePreset ?? "",
    });
    setImagePrompt((previous) =>
      preset.promptHint ? `${previous.trim()} ${preset.promptHint}`.trim() : previous
    );
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
    <div
      className={[
        "grid h-[calc(100dvh-96px)] gap-4",
        configPanelCollapsed ? IMAGE_GRID_COLS.collapsed : IMAGE_GRID_COLS.normal,
      ].join(" ")}
    >
      <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/30">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">AI Image Lab</p>
          <button
            type="button"
            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-300 transition hover:border-white/30 hover:bg-white/5 lg:inline-flex"
            onClick={() => setConfigPanelCollapsed((previous) => !previous)}
            aria-label="Toggle config panel"
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>

        <ImageStyleGrid
          presets={IMAGE_STYLE_PRESETS}
          selectedPresetId={selectedPreset?.id ?? null}
          status={imageGeneration.status}
          error={imageGeneration.error}
          results={imageGeneration.results}
          isSavingSelection={imageGeneration.isSavingSelection}
          onSelectPreset={selectStylePreset}
          onToggleResultSelection={imageGeneration.toggleResultSelection}
          onSaveSelectedResults={() => {
            void imageGeneration.saveSelectedResults();
          }}
          onAddToCanvas={(assetId) => {
            void imageGeneration.addToCanvas(assetId);
          }}
        />

        <ImagePromptInput
          isGeneratingImage={
            imageGeneration.status === "loading" || imageGeneration.isSavingSelection
          }
          promptValue={imagePrompt}
          onPromptChange={setImagePrompt}
          hideSettings={!configPanelCollapsed}
          selectedStyle={
            selectedPreset
              ? {
                  title: selectedPreset.title,
                  previewUrl: selectedPreset.previewUrl,
                }
              : null
          }
          generationSpeed={generationSpeed}
          imageProviders={imageGeneration.providers.map((provider) => ({
            id: provider.id,
            name: provider.name,
            models: provider.models.map((model) => ({ id: model.id, name: model.name })),
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
          onGenerationSpeedChange={setGenerationSpeed}
          onImageProviderChange={imageGeneration.setProvider}
          onImageModelChange={imageGeneration.setModel}
          onCommonParamsChange={imageGeneration.updateConfig}
          onModelParamsChange={imageGeneration.updateConfig}
          onModelExtraParamChange={updateModelExtraParam}
          onGenerateImage={(input) => {
            setImagePrompt(input.text);
            void imageGeneration.generateFromPromptInput(input);
          }}
        />
      </section>

      <div className="hidden min-h-0 lg:block">
        {configPanelCollapsed ? (
          <div className="flex h-[calc(100dvh-96px)] flex-col items-center rounded-2xl border border-white/10 bg-black/20 pt-3">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-300 transition hover:border-white/30 hover:bg-white/5"
              onClick={() => setConfigPanelCollapsed(false)}
              aria-label="Expand config panel"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="h-[calc(100dvh-96px)]">
            <ImageGenerationPanel
              prompt={imagePrompt}
              status={imageGeneration.status}
              error={imageGeneration.error}
              config={imageGeneration.config}
              providerName={imageGeneration.providerConfig.name}
              providerFeatures={imageGeneration.supportedFeatures}
              providers={imageGeneration.providers.map((provider) => ({
                id: provider.id,
                name: provider.name,
                models: provider.models.map((model) => ({
                  id: model.id,
                  name: model.name,
                  costPerImage: model.costPerImage,
                })),
              }))}
              styles={imageGeneration.styles}
              aspectRatioOptions={imageGeneration.aspectRatioOptions}
              maxBatchSize={imageGeneration.modelConfig.maxBatchSize ?? 4}
              results={imageGeneration.results}
              isSavingSelection={imageGeneration.isSavingSelection}
              onPromptChange={setImagePrompt}
              onProviderChange={imageGeneration.setProvider}
              onModelChange={imageGeneration.setModel}
              onConfigChange={imageGeneration.updateConfig}
              onAddReferenceFiles={(files) => {
                void imageGeneration.addReferenceFiles(files);
              }}
              onUpdateReferenceImage={imageGeneration.updateReferenceImage}
              onRemoveReferenceImage={imageGeneration.removeReferenceImage}
              onClearReferenceImages={imageGeneration.clearReferenceImages}
              onGenerate={() => {
                void imageGeneration.generateFromPromptInput({ text: imagePrompt });
              }}
              onToggleResultSelection={imageGeneration.toggleResultSelection}
              onSaveSelectedResults={() => {
                void imageGeneration.saveSelectedResults();
              }}
              onAddToCanvas={(assetId) => {
                void imageGeneration.addToCanvas(assetId);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
