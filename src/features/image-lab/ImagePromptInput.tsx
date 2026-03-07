import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  SendHorizonal,
  Settings2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ImageModelParamDefinition,
  ImageModelParamValue,
} from "@/lib/ai/imageModelParams";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ImageAspectRatio, ImageProviderId } from "@/types/imageGeneration";
import { ProviderApiKeyPanel } from "./ProviderApiKeyPanel";

interface ImagePromptInputProps {
  isGeneratingImage?: boolean;
  promptValue: string;
  onPromptChange: (value: string) => void;
  hideSettings?: boolean;
  selectedStyle: { title: string; previewUrl: string } | null;
  generationSpeed: "fast" | "balanced" | "quality";
  imageProviders: Array<{
    id: ImageProviderId;
    name: string;
    models: Array<{ id: string; name: string }>;
  }>;
  imageProvider: ImageProviderId;
  imageModel: string;
  providerFeatures: {
    negativePrompt: boolean;
    referenceImages: boolean;
    seed: boolean;
    guidanceScale: boolean;
    steps: boolean;
    styles: boolean;
  };
  aspectRatioOptions: ImageAspectRatio[];
  maxBatchSize: number;
  commonParams: {
    aspectRatio: ImageAspectRatio;
    width: number | null;
    height: number | null;
    batchSize: number;
  };
  modelParams: {
    seed: number | null;
    guidanceScale: number | null;
    steps: number | null;
    sampler: string;
    negativePrompt: string;
    extra: Record<string, ImageModelParamValue>;
  };
  modelParamDefinitions: ImageModelParamDefinition[];
  onGenerationSpeedChange: (speed: "fast" | "balanced" | "quality") => void;
  onImageProviderChange: (provider: ImageProviderId) => void;
  onImageModelChange: (model: string) => void;
  onCommonParamsChange: (patch: {
    aspectRatio?: ImageAspectRatio;
    width?: number | null;
    height?: number | null;
    batchSize?: number;
  }) => void;
  onModelParamsChange: (patch: {
    seed?: number | null;
    guidanceScale?: number | null;
    steps?: number | null;
    sampler?: string;
    negativePrompt?: string;
  }) => void;
  onModelExtraParamChange: (key: string, value: ImageModelParamValue) => void;
  onGenerateImage: (input: { text: string; files?: FileList | null }) => void;
}

const IMAGE_MAX_TEXTAREA_HEIGHT = 220;
const RESOLUTION_PRESETS = [1024, 1536, 2048] as const;

const toNumberOrNull = (value: string): number | null => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const next = Number(trimmedValue);
  return Number.isFinite(next) ? next : null;
};

const parseAspectRatio = (ratio: ImageAspectRatio): number => {
  if (ratio === "custom") {
    return 1;
  }

  const [rawWidth, rawHeight] = ratio.split(":");
  const width = Number(rawWidth);
  const height = Number(rawHeight);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 1;
  }

  return width / height;
};

const resolveResolutionFromSize = (width: number | null, height: number | null) => {
  const longEdge = Math.max(width ?? 0, height ?? 0);
  if (longEdge >= 1900) {
    return "2048";
  }
  if (longEdge >= 1400) {
    return "1536";
  }
  return "1024";
};

const resolveSizeFromAspectAndResolution = (
  aspectRatio: ImageAspectRatio,
  resolution: number,
  currentWidth: number | null,
  currentHeight: number | null
) => {
  if (aspectRatio === "custom") {
    return {
      width: currentWidth ?? resolution,
      height: currentHeight ?? resolution,
    };
  }

  const ratio = parseAspectRatio(aspectRatio);
  if (ratio >= 1) {
    return {
      width: resolution,
      height: Math.max(256, Math.round(resolution / ratio)),
    };
  }

  return {
    width: Math.max(256, Math.round(resolution * ratio)),
    height: resolution,
  };
};

export function ImagePromptInput({
  isGeneratingImage = false,
  promptValue,
  onPromptChange,
  hideSettings = false,
  selectedStyle,
  generationSpeed,
  imageProviders,
  imageProvider,
  imageModel,
  providerFeatures,
  aspectRatioOptions,
  maxBatchSize,
  commonParams,
  modelParams,
  modelParamDefinitions,
  onGenerationSpeedChange,
  onImageProviderChange,
  onImageModelChange,
  onCommonParamsChange,
  onModelParamsChange,
  onModelExtraParamChange,
  onGenerateImage,
}: ImagePromptInputProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showCommonPanel, setShowCommonPanel] = useState(true);
  const [showModelPanel, setShowModelPanel] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedProvider = useMemo(
    () => imageProviders.find((provider) => provider.id === imageProvider) ?? imageProviders[0],
    [imageProvider, imageProviders]
  );
  const resolutionValue = resolveResolutionFromSize(commonParams.width, commonParams.height);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, IMAGE_MAX_TEXTAREA_HEIGHT)}px`;
  }, [promptValue]);

  useEffect(() => {
    if (hideSettings) {
      setShowSettings(false);
    }
  }, [hideSettings]);

  const resetAttachments = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!providerFeatures.referenceImages) {
      resetAttachments();
    }
  }, [providerFeatures.referenceImages]);

  const submit = () => {
    const text = promptValue.trim();
    const files = fileInputRef.current?.files;
    const hasFiles = Boolean(files && files.length > 0);

    if ((!text && !hasFiles) || isGeneratingImage) {
      return;
    }

    onGenerateImage({ text, files: files ?? null });
    resetAttachments();
  };

  return (
    <div className="border-t border-white/10 bg-black/20 p-3 sm:p-4">
      <form
        className="relative mx-auto w-full max-w-5xl rounded-[30px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(10,14,22,0.92))] p-3 shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            setSelectedFiles(Array.from(event.target.files ?? []));
          }}
        />

        {selectedStyle && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 p-1.5 pr-2">
            <img
              src={selectedStyle.previewUrl}
              alt={selectedStyle.title}
              className="h-14 w-24 rounded-xl object-cover"
            />
            <div>
              <p className="text-sm font-medium text-zinc-100">{selectedStyle.title}</p>
              <p className="text-[11px] text-zinc-500">Selected style</p>
            </div>
          </div>
        )}

        {selectedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-300">
            {selectedFiles.map((file) => (
              <span
                key={`${file.name}-${file.size}`}
                className="rounded-full border border-white/15 bg-white/5 px-2 py-1"
              >
                {file.name}
              </span>
            ))}
            <button
              type="button"
              className="ml-auto text-zinc-500 transition hover:text-zinc-100"
              onClick={resetAttachments}
            >
              Clear
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={promptValue}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) {
              return;
            }
            event.preventDefault();
            submit();
          }}
          placeholder="Describe subject, camera language, lighting, mood, and composition."
          className="min-h-[96px] max-h-[220px] w-full resize-none overflow-y-auto border-none bg-transparent px-2 py-2 text-[24px] leading-tight text-zinc-100 outline-none placeholder:text-zinc-500/90"
        />

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => fileInputRef.current?.click()}
              disabled={!providerFeatures.referenceImages}
              aria-label="Add files"
            >
              <Plus className="h-5 w-5" />
            </button>

            {!hideSettings && (
              <button
                type="button"
                className={[
                  "rounded-full p-2 transition",
                  showSettings
                    ? "bg-amber-300/20 text-amber-100"
                    : "text-zinc-400 hover:bg-white/10 hover:text-zinc-100",
                ].join(" ")}
                onClick={() => setShowSettings((previous) => !previous)}
                aria-label="Open generation settings"
              >
                <Settings2 className="h-5 w-5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={generationSpeed}
              onValueChange={(nextValue) =>
                onGenerationSpeedChange(nextValue as "fast" | "balanced" | "quality")
              }
            >
              <SelectTrigger className="h-9 w-[110px] rounded-full border-white/15 bg-white/5 text-xs text-zinc-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fast">Fast</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="quality">Quality</SelectItem>
              </SelectContent>
            </Select>

            <button
              type="submit"
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-300 text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={(!promptValue.trim() && selectedFiles.length === 0) || isGeneratingImage}
              aria-label="Generate image"
            >
              {isGeneratingImage ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <SendHorizonal className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {showSettings && !hideSettings && (
          <div className="absolute bottom-[96px] left-3 right-3 space-y-2 rounded-2xl border border-white/15 bg-[#0c111b]/95 p-3 shadow-[0_18px_34px_rgba(0,0,0,0.55)] backdrop-blur">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-left"
              onClick={() => setShowCommonPanel((previous) => !previous)}
            >
              <span className="text-sm font-medium text-zinc-200">Common Params</span>
              {showCommonPanel ? (
                <ChevronDown className="h-4 w-4 text-zinc-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              )}
            </button>

            {showCommonPanel && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-[11px] text-zinc-400">Aspect Ratio</Label>
                  <Select
                    value={commonParams.aspectRatio}
                    onValueChange={(nextValue) => {
                      const nextAspectRatio = nextValue as ImageAspectRatio;
                      const resized = resolveSizeFromAspectAndResolution(
                        nextAspectRatio,
                        Number(resolutionValue),
                        commonParams.width,
                        commonParams.height
                      );
                      onCommonParamsChange({
                        aspectRatio: nextAspectRatio,
                        width: resized.width,
                        height: resized.height,
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 border-white/10 bg-black/35 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {aspectRatioOptions.map((ratio) => (
                        <SelectItem key={ratio} value={ratio}>
                          {ratio}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-zinc-400">Resolution</Label>
                  <Select
                    value={resolutionValue}
                    onValueChange={(nextValue) => {
                      const resolution = Number(nextValue);
                      const resized = resolveSizeFromAspectAndResolution(
                        commonParams.aspectRatio,
                        resolution,
                        commonParams.width,
                        commonParams.height
                      );
                      onCommonParamsChange({
                        width: resized.width,
                        height: resized.height,
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 border-white/10 bg-black/35 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOLUTION_PRESETS.map((preset) => (
                        <SelectItem key={preset} value={String(preset)}>
                          {preset}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-zinc-400">Batch</Label>
                  <Input
                    type="number"
                    min={1}
                    max={maxBatchSize}
                    value={commonParams.batchSize}
                    onChange={(event) =>
                        onCommonParamsChange({
                        batchSize: Math.min(
                          maxBatchSize,
                          Math.max(1, Number(event.target.value) || 1)
                        ),
                      })
                    }
                    className="h-8 border-white/10 bg-black/35 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-zinc-400">Width</Label>
                  <Input
                    type="number"
                    value={commonParams.width ?? ""}
                    onChange={(event) =>
                      onCommonParamsChange({ width: toNumberOrNull(event.target.value) })
                    }
                    className="h-8 border-white/10 bg-black/35 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-zinc-400">Height</Label>
                  <Input
                    type="number"
                    value={commonParams.height ?? ""}
                    onChange={(event) =>
                      onCommonParamsChange({ height: toNumberOrNull(event.target.value) })
                    }
                    className="h-8 border-white/10 bg-black/35 text-xs"
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-left"
              onClick={() => setShowModelPanel((previous) => !previous)}
            >
              <span className="text-sm font-medium text-zinc-200">Model Params</span>
              {showModelPanel ? (
                <ChevronDown className="h-4 w-4 text-zinc-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              )}
            </button>

            {showModelPanel && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-zinc-400">Provider</Label>
                    <Select
                      value={imageProvider}
                      onValueChange={(value) => onImageProviderChange(value as ImageProviderId)}
                    >
                      <SelectTrigger className="h-8 border-white/10 bg-black/35 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {imageProviders.map((provider) => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-zinc-400">Model</Label>
                    <Select value={imageModel} onValueChange={onImageModelChange}>
                      <SelectTrigger className="h-8 border-white/10 bg-black/35 text-xs">
                        <SelectValue />
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

                {(providerFeatures.seed ||
                  providerFeatures.guidanceScale ||
                  providerFeatures.steps) && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {providerFeatures.seed && (
                      <div className="space-y-1">
                        <Label className="text-[11px] text-zinc-400">Seed</Label>
                        <Input
                          type="number"
                          value={modelParams.seed ?? ""}
                          onChange={(event) =>
                            onModelParamsChange({ seed: toNumberOrNull(event.target.value) })
                          }
                          placeholder="Auto"
                          className="h-8 border-white/10 bg-black/35 text-xs"
                        />
                      </div>
                    )}

                    {providerFeatures.guidanceScale && (
                      <div className="space-y-1">
                        <Label className="text-[11px] text-zinc-400">Guidance</Label>
                        <Input
                          type="number"
                          step={0.1}
                          min={1}
                          max={20}
                          value={modelParams.guidanceScale ?? ""}
                          onChange={(event) =>
                            onModelParamsChange({
                              guidanceScale: toNumberOrNull(event.target.value),
                            })
                          }
                          placeholder="Auto"
                          className="h-8 border-white/10 bg-black/35 text-xs"
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
                          value={modelParams.steps ?? ""}
                          onChange={(event) =>
                            onModelParamsChange({ steps: toNumberOrNull(event.target.value) })
                          }
                          placeholder="Auto"
                          className="h-8 border-white/10 bg-black/35 text-xs"
                        />
                      </div>
                    )}
                  </div>
                )}

                {modelParamDefinitions.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {modelParamDefinitions.map((field) => {
                      const value = modelParams.extra[field.key];

                      if (field.type === "select") {
                        return (
                          <div key={field.key} className="space-y-1">
                            <Label className="text-[11px] text-zinc-400">{field.label}</Label>
                            <Select
                              value={
                                typeof value === "string"
                                  ? value
                                  : String(field.defaultValue ?? "")
                              }
                              onValueChange={(nextValue) =>
                                onModelExtraParamChange(field.key, nextValue)
                              }
                            >
                              <SelectTrigger className="h-8 border-white/10 bg-black/35 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(field.options ?? []).map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      }

                      if (field.type === "boolean") {
                        return (
                          <label
                            key={field.key}
                            className="flex h-8 items-center gap-2 rounded-xl border border-white/10 bg-black/35 px-2 text-xs text-zinc-300"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(value)}
                              onChange={(event) =>
                                onModelExtraParamChange(field.key, event.target.checked)
                              }
                              className="h-3.5 w-3.5 rounded border-white/20 bg-transparent"
                            />
                            {field.label}
                          </label>
                        );
                      }

                      return (
                        <div key={field.key} className="space-y-1">
                          <Label className="text-[11px] text-zinc-400">{field.label}</Label>
                          <Input
                            type="number"
                            min={field.min}
                            max={field.max}
                            step={field.step ?? 1}
                            value={typeof value === "number" ? value : ""}
                            onChange={(event) =>
                              onModelExtraParamChange(field.key, toNumberOrNull(event.target.value))
                            }
                            className="h-8 border-white/10 bg-black/35 text-xs"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {providerFeatures.negativePrompt && (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-zinc-400">Negative Prompt</Label>
                    <textarea
                      value={modelParams.negativePrompt}
                      onChange={(event) =>
                        onModelParamsChange({ negativePrompt: event.target.value })
                      }
                      placeholder="Describe what to avoid"
                      className="min-h-[58px] w-full resize-y rounded-xl border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-500"
                    />
                  </div>
                )}
              </div>
            )}

            <ProviderApiKeyPanel
              providers={imageProviders.map((provider) => ({
                id: provider.id,
                name: provider.name,
              }))}
              currentProvider={imageProvider}
            />
          </div>
        )}
      </form>
    </div>
  );
}
