import { useEffect, useMemo, useState } from "react";
import { PanelLeft, PanelRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IMAGE_STYLE_PRESETS, type ImageStylePreset } from "@/lib/ai/imageStylePresets";
import type { ImageModelParamValue } from "@/lib/ai/imageModelParams";
import { AVAILABLE_MODELS } from "@/lib/ai/provider";
import { ChatInput } from "@/features/chat/ChatInput";
import { ImageGenerationPanel } from "@/features/chat/ImageGenerationPanel";
import { ChatSidebar } from "@/features/chat/ChatSidebar";
import { ChatThread } from "@/features/chat/ChatThread";
import { ImageStyleGrid } from "@/features/chat/ImageStyleGrid";
import { useChatSession } from "@/features/chat/hooks/useChatSession";
import { useImageGeneration } from "@/features/chat/hooks/useImageGeneration";

const SPEED_TO_STEPS: Record<"fast" | "balanced" | "quality", number> = {
  fast: 20,
  balanced: 30,
  quality: 45,
};

const GRID_COLS = {
  normal2Col: "lg:grid-cols-[300px_minmax(0,1fr)]",
  collapsed2Col: "lg:grid-cols-[84px_minmax(0,1fr)]",
  normal3Col: "lg:grid-cols-[300px_minmax(0,1fr)_280px]",
  collapsed3Col: "lg:grid-cols-[84px_minmax(0,1fr)_280px]",
} as const;

export function ChatPage() {
  const {
    messages,
    status,
    isLoading,
    error,
    stop,
    retryLast,
    conversations,
    activeConversationId,
    setActiveConversationId,
    sendUserMessage,
    newConversation,
    removeConversation,
    selectedModel,
    setSelectedModel,
    toolResults,
  } = useChatSession();
  const imageGeneration = useImageGeneration();
  const updateGenerationConfig = imageGeneration.updateConfig;
  const [imageMode, setImageMode] = useState(true);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [configPanelCollapsed, setConfigPanelCollapsed] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [generationSpeed, setGenerationSpeed] = useState<"fast" | "balanced" | "quality">(
    "fast"
  );

  useEffect(() => {
    updateGenerationConfig({ steps: SPEED_TO_STEPS[generationSpeed] });
  }, [generationSpeed, updateGenerationConfig]);

  const selectedPreset = useMemo(
    () =>
      IMAGE_STYLE_PRESETS.find(
        (preset) => preset.stylePreset === imageGeneration.config.stylePreset
      ) ?? null,
    [imageGeneration.config.stylePreset]
  );

  const selectStylePreset = (preset: ImageStylePreset) => {
    setImageMode(true);
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

  const gridClassName =
    imageMode && !configPanelCollapsed
      ? historyCollapsed
        ? GRID_COLS.collapsed3Col
        : GRID_COLS.normal3Col
      : historyCollapsed
        ? GRID_COLS.collapsed2Col
        : GRID_COLS.normal2Col;

  return (
    <div
      className={[
        "grid h-[calc(100dvh-96px)] gap-4",
        gridClassName,
      ].join(" ")}
    >
      <div className="hidden lg:block">
        <ChatSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          collapsed={historyCollapsed}
          onToggle={() => setHistoryCollapsed((previous) => !previous)}
          onSelect={setActiveConversationId}
          onNew={() => {
            void newConversation();
          }}
          onDelete={(id) => {
            void removeConversation(id);
          }}
        />
      </div>

      <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-black/30">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="hidden h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-300 transition hover:border-white/30 hover:bg-white/5 lg:inline-flex"
              onClick={() => setHistoryCollapsed((previous) => !previous)}
              aria-label="Toggle history panel"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Hub Chat
            </p>
            {imageMode && (
              <button
                type="button"
                className="hidden h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-300 transition hover:border-white/30 hover:bg-white/5 lg:inline-flex"
                onClick={() => setConfigPanelCollapsed((previous) => !previous)}
                aria-label="Toggle config panel"
              >
                <PanelRight className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={[
                "rounded-full border px-3 py-1 text-xs transition",
                imageMode
                  ? "border-blue-300/50 bg-blue-400/10 text-blue-100"
                  : "border-white/15 text-zinc-400 hover:text-zinc-200",
              ].join(" ")}
              onClick={() => setImageMode((previous) => !previous)}
            >
              {imageMode ? "风格生成" : "聊天模式"}
            </button>
            <Select
              value={`${selectedModel.provider}:${selectedModel.id}`}
              onValueChange={(value) => {
                setSelectedModel(value);
              }}
            >
              <SelectTrigger className="h-8 w-[220px] rounded-lg text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_MODELS.map((model) => (
                  <SelectItem
                    key={`${model.provider}:${model.id}`}
                    value={`${model.provider}:${model.id}`}
                  >
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {imageMode ? (
          <ImageStyleGrid
            presets={IMAGE_STYLE_PRESETS}
            selectedPresetId={selectedPreset?.id ?? null}
            status={imageGeneration.status}
            error={imageGeneration.error}
            results={imageGeneration.results}
            onSelectPreset={selectStylePreset}
            onAddToCanvas={(assetId) => {
              void imageGeneration.addToCanvas(assetId);
            }}
          />
        ) : (
          <ChatThread
            messages={messages}
            status={status}
            error={error}
            onRetry={retryLast}
            toolResults={toolResults}
          />
        )}

        <ChatInput
          isLoading={isLoading}
          isGeneratingImage={imageGeneration.status === "loading"}
          imageMode={imageMode}
          promptValue={imageMode ? imagePrompt : undefined}
          onPromptChange={imageMode ? setImagePrompt : undefined}
          hideSettings={imageMode && !configPanelCollapsed}
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
          aspectRatioOptions={imageGeneration.aspectRatioOptions}
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
          onImageProviderChange={(provider) => {
            imageGeneration.setProvider(provider);
          }}
          onImageModelChange={(model) => {
            imageGeneration.setModel(model);
          }}
          onCommonParamsChange={(patch) => {
            imageGeneration.updateConfig(patch);
          }}
          onModelParamsChange={(patch) => {
            imageGeneration.updateConfig(patch);
          }}
          onModelExtraParamChange={updateModelExtraParam}
          onImageModeChange={setImageMode}
          onSend={sendUserMessage}
          onGenerateImage={(input) => {
            setImagePrompt(input.text);
            void imageGeneration.generateFromChatInput(input);
          }}
          onStop={stop}
        />
      </section>

      {imageMode && (
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
                results={imageGeneration.results}
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
                  void imageGeneration.generateFromChatInput({ text: imagePrompt });
                }}
                onAddToCanvas={(assetId) => {
                  void imageGeneration.addToCanvas(assetId);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
