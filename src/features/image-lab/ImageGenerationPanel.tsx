import { SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GenerationConfig } from "@/stores/generationConfigStore";
import type {
  ImageProviderId,
  ImageStyleId,
  ReferenceImage,
} from "@/types/imageGeneration";
import { ProviderApiKeyPanel } from "./ProviderApiKeyPanel";
import { ImageResultCard } from "./ImageResultCard";
import { ReferenceImagePicker } from "./ReferenceImagePicker";

interface ImageGenerationPanelProps {
  prompt: string;
  status: "idle" | "loading" | "done" | "error";
  error: string | null;
  config: GenerationConfig;
  providerName: string;
  providerFeatures: {
    negativePrompt: boolean;
    referenceImages: boolean;
    seed: boolean;
    guidanceScale: boolean;
    steps: boolean;
    styles: boolean;
  };
  providers: Array<{
    id: ImageProviderId;
    name: string;
    models: Array<{ id: string; name: string; costPerImage?: number }>;
  }>;
  styles: Array<{ id: ImageStyleId; label: string; promptHint: string }>;
  aspectRatioOptions: string[];
  maxBatchSize: number;
  results: Array<{
    imageUrl: string;
    provider: string;
    model: string;
    assetId: string | null;
    selected: boolean;
    saved: boolean;
    index: number;
  }>;
  isSavingSelection: boolean;
  onPromptChange: (value: string) => void;
  onProviderChange: (provider: ImageProviderId) => void;
  onModelChange: (model: string) => void;
  onConfigChange: (patch: Partial<GenerationConfig>) => void;
  onAddReferenceFiles: (files: FileList) => void;
  onUpdateReferenceImage: (id: string, patch: Partial<ReferenceImage>) => void;
  onRemoveReferenceImage: (id: string) => void;
  onClearReferenceImages: () => void;
  onGenerate: () => void;
  onToggleResultSelection: (index: number) => void;
  onSaveSelectedResults: () => void;
  onAddToCanvas: (assetId: string | null) => void;
}

const toNumberOrNull = (value: string) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const next = Number(trimmedValue);
  return Number.isFinite(next) ? next : null;
};

export function ImageGenerationPanel({
  prompt,
  status,
  error,
  config,
  providerName,
  providerFeatures,
  providers,
  styles,
  aspectRatioOptions,
  maxBatchSize,
  results,
  isSavingSelection,
  onPromptChange,
  onProviderChange,
  onModelChange,
  onConfigChange,
  onAddReferenceFiles,
  onUpdateReferenceImage,
  onRemoveReferenceImage,
  onClearReferenceImages,
  onGenerate,
  onToggleResultSelection,
  onSaveSelectedResults,
  onAddToCanvas,
}: ImageGenerationPanelProps) {
  const selectedProvider = providers.find((provider) => provider.id === config.provider);
  const selectedModel = selectedProvider?.models.find((model) => model.id === config.model);
  const isGenerating = status === "loading";
  const isBusy = isGenerating || isSavingSelection;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.09),transparent_45%),rgba(0,0,0,0.35)]">
      <div className="border-b border-white/10 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-300" />
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-200">
            Image Generation
          </p>
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">
          {providerName} / {selectedModel?.name ?? config.model}
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div className="space-y-1.5">
          <Label htmlFor="image-prompt" className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
            Prompt
          </Label>
          <textarea
            id="image-prompt"
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="Describe subject, mood, camera language, and composition..."
            className="min-h-[92px] w-full resize-y rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-amber-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Provider</Label>
            <Select
              value={config.provider}
              onValueChange={(value) => onProviderChange(value as ImageProviderId)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Model</Label>
            <Select value={config.model} onValueChange={onModelChange}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                {(selectedProvider?.models ?? []).map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ProviderApiKeyPanel
          providers={providers.map((provider) => ({
            id: provider.id,
            name: provider.name,
          }))}
          currentProvider={config.provider}
        />

        <div className="space-y-1.5 rounded-xl border border-white/10 bg-black/30 p-2.5">
          <Label className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
            Aspect Ratio
          </Label>
          <div className="grid grid-cols-4 gap-1.5">
            {aspectRatioOptions.map((ratio) => (
              <button
                key={ratio}
                type="button"
                className={[
                  "h-8 rounded-lg border text-[11px] transition",
                  config.aspectRatio === ratio
                    ? "border-amber-300/60 bg-amber-300/15 text-amber-100"
                    : "border-white/10 bg-black/35 text-zinc-400 hover:border-white/20 hover:text-zinc-200",
                ].join(" ")}
                onClick={() =>
                  onConfigChange({ aspectRatio: ratio as GenerationConfig["aspectRatio"] })
                }
              >
                {ratio}
              </button>
            ))}
          </div>
          {config.aspectRatio === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                value={config.width ?? ""}
                placeholder="Width"
                onChange={(event) =>
                  onConfigChange({ width: toNumberOrNull(event.target.value) })
                }
                className="h-8 text-xs"
              />
              <Input
                type="number"
                value={config.height ?? ""}
                placeholder="Height"
                onChange={(event) =>
                  onConfigChange({ height: toNumberOrNull(event.target.value) })
                }
                className="h-8 text-xs"
              />
            </div>
          )}
        </div>

        {providerFeatures.styles && (
          <div className="space-y-1.5 rounded-xl border border-white/10 bg-black/30 p-2.5">
            <Label className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
              Style
            </Label>
            <Select
              value={config.style}
              onValueChange={(value) =>
                onConfigChange({ style: value as GenerationConfig["style"] })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {styles.map((style) => (
                  <SelectItem key={style.id} value={style.id}>
                    {style.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-zinc-500">
              {
                styles.find((entry) => entry.id === config.style)?.promptHint ??
                "No style hint."
              }
            </p>
          </div>
        )}

        {providerFeatures.referenceImages ? (
          <ReferenceImagePicker
            referenceImages={config.referenceImages}
            onAddFiles={onAddReferenceFiles}
            onUpdateImage={onUpdateReferenceImage}
            onRemoveImage={onRemoveReferenceImage}
            onClearImages={onClearReferenceImages}
          />
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/30 p-2.5 text-[11px] text-zinc-500">
            Current provider does not support reference image control.
          </div>
        )}

        <details className="rounded-xl border border-white/10 bg-black/30 p-2.5">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Advanced
          </summary>

          <div className="mt-2 space-y-2.5">
            {providerFeatures.negativePrompt && (
              <div className="space-y-1">
                <Label className="text-[11px] text-zinc-400">Negative Prompt</Label>
                <textarea
                  value={config.negativePrompt}
                  onChange={(event) =>
                    onConfigChange({ negativePrompt: event.target.value })
                  }
                  className="min-h-[64px] w-full resize-y rounded-lg border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-500"
                  placeholder="Describe what to avoid..."
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-zinc-400">Batch</Label>
                  <Input
                    type="number"
                    min={1}
                    max={maxBatchSize}
                    value={config.batchSize}
                  onChange={(event) =>
                    onConfigChange({
                      batchSize: Math.min(
                        maxBatchSize,
                        Math.max(1, Number(event.target.value) || 1)
                      ),
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>
              {providerFeatures.seed && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-zinc-400">Seed</Label>
                  <Input
                    type="number"
                    value={config.seed ?? ""}
                    onChange={(event) =>
                      onConfigChange({ seed: toNumberOrNull(event.target.value) })
                    }
                    className="h-8 text-xs"
                    placeholder="Auto"
                  />
                </div>
              )}
            </div>

            {(providerFeatures.guidanceScale || providerFeatures.steps) && (
              <div className="grid grid-cols-2 gap-2">
                {providerFeatures.guidanceScale && (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-zinc-400">Guidance</Label>
                    <Input
                      type="number"
                      step={0.1}
                      min={1}
                      max={20}
                      value={config.guidanceScale ?? ""}
                      onChange={(event) =>
                        onConfigChange({
                          guidanceScale: toNumberOrNull(event.target.value),
                        })
                      }
                      className="h-8 text-xs"
                      placeholder="Auto"
                    />
                  </div>
                )}
                {providerFeatures.steps && (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-zinc-400">Steps</Label>
                    <Input
                      type="number"
                      min={1}
                      max={80}
                      value={config.steps ?? ""}
                      onChange={(event) =>
                        onConfigChange({ steps: toNumberOrNull(event.target.value) })
                      }
                      className="h-8 text-xs"
                      placeholder="Auto"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </details>

        <Button
          type="button"
          className="h-9 w-full rounded-xl bg-amber-400 text-black hover:bg-amber-300"
          disabled={isBusy || !prompt.trim()}
          onClick={onGenerate}
        >
          {isSavingSelection ? "Saving..." : isGenerating ? "Generating..." : "Generate Images"}
        </Button>

        {selectedModel?.costPerImage !== undefined && (
          <p className="text-center text-[11px] text-zinc-500">
            Estimated cost: ${selectedModel.costPerImage.toFixed(3)} / image
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-rose-300/25 bg-rose-300/10 px-2.5 py-2 text-xs text-rose-100">
            {error}
          </p>
        )}

        {results.length > 0 && (
          <div className="space-y-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 w-full rounded-xl border border-white/10 bg-emerald-500/15 text-xs text-emerald-100 hover:bg-emerald-500/25"
              disabled={
                isSavingSelection ||
                results.every((entry) => !entry.selected || entry.saved)
              }
              onClick={onSaveSelectedResults}
            >
              {isSavingSelection ? "Saving..." : "Save Selected to Library"}
            </Button>
            <Label className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
              Results
            </Label>
            <div className="grid grid-cols-1 gap-2">
              {results.map((entry, index) => (
                <ImageResultCard
                  key={`${entry.imageUrl}-${index}`}
                  imageUrl={entry.imageUrl}
                  provider={entry.provider}
                  model={entry.model}
                  assetId={entry.assetId}
                  selected={entry.selected}
                  saved={entry.saved}
                  onToggleSelection={() => onToggleResultSelection(entry.index)}
                  onAddToCanvas={onAddToCanvas}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
