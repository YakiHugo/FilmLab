import { useEffect, useMemo, useState } from "react";
import { PanelLeft } from "lucide-react";
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
import { ChatInput } from "./ChatInput";
import { ChatSidebar } from "./ChatSidebar";
import { ChatThread } from "./ChatThread";
import { ImageStyleGrid } from "./ImageStyleGrid";
import { useChatSession } from "./hooks/useChatSession";
import { useImageGeneration } from "./hooks/useImageGeneration";

const SPEED_TO_STEPS: Record<"fast" | "balanced" | "quality", number> = {
  fast: 20,
  balanced: 30,
  quality: 45,
};

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
    imageGeneration.setPrompt(
      preset.promptHint
        ? `${imageGeneration.prompt.trim()} ${preset.promptHint}`.trim()
        : imageGeneration.prompt
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
        historyCollapsed ? "lg:grid-cols-[84px_minmax(0,1fr)]" : "lg:grid-cols-[300px_minmax(0,1fr)]",
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
            void imageGeneration.generateFromChatInput(input);
          }}
          onStop={stop}
        />
      </section>
    </div>
  );
}
