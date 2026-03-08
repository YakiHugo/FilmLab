import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  ImagePlus,
  Loader2,
  Palette,
  Ratio,
  SendHorizonal,
  Settings2,
  Sparkles,
  SwatchBook,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ImageStylePreset } from "@/lib/ai/imageStylePresets";
import type {
  ImageModelParamDefinition,
  ImageModelParamValue,
} from "@/lib/ai/imageModelParams";
import type { ImageProviderFeatureSupport } from "@/lib/ai/imageProviders";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type {
  ImageAspectRatio,
  ImageProviderId,
  ImageStyleId,
  ReferenceImage,
} from "@/types/imageGeneration";
import { ProviderApiKeyPanel } from "./ProviderApiKeyPanel";
import { ReferenceImagePicker } from "./ReferenceImagePicker";

interface ImagePromptInputProps {
  isGeneratingImage?: boolean;
  generationSpeed: "fast" | "balanced" | "quality";
  stylePresets: ImageStylePreset[];
  selectedStylePresetId: string | null;
  styles: Array<{ id: ImageStyleId; label: string; promptHint: string }>;
  selectedStyleId: ImageStyleId;
  imageProviders: Array<{
    id: ImageProviderId;
    name: string;
    models: Array<{ id: string; name: string; description?: string; costPerImage?: number }>;
  }>;
  imageProvider: ImageProviderId;
  imageModel: string;
  providerFeatures: ImageProviderFeatureSupport;
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
  referenceImages: ReferenceImage[];
  onGenerationSpeedChange: (speed: "fast" | "balanced" | "quality") => void;
  onImageProviderChange: (provider: ImageProviderId) => void;
  onImageModelChange: (model: string) => void;
  onStyleChange: (style: ImageStyleId) => void;
  onSelectStylePreset: (preset: ImageStylePreset) => void;
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
  onAddReferenceFiles: (files: FileList) => void;
  onUpdateReferenceImage: (id: string, patch: Partial<ReferenceImage>) => void;
  onRemoveReferenceImage: (id: string) => void;
  onClearReferenceImages: () => void;
  onGenerateImage: (input: { text: string }) => void;
}

type HoverPanelId = "style" | "refs" | "ratio" | "resolution" | "more";

const IMAGE_MAX_TEXTAREA_HEIGHT = 220;
const RESOLUTION_PRESETS = [1024, 1536, 2048] as const;
const SPEED_OPTIONS = [
  { id: "fast", label: "Fast" },
  { id: "balanced", label: "Balanced" },
  { id: "quality", label: "Quality" },
] as const;

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

const formatResolutionLabel = (value: string) => {
  if (value === "1024") return "1K";
  if (value === "1536") return "1.5K";
  if (value === "2048") return "2K";
  return value;
};

function PanelShell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className={cn(
        "absolute bottom-full z-30 mb-3 rounded-[28px] border border-white/10 bg-[#17181d]/96 p-4 shadow-[0_28px_80px_rgba(0,0,0,0.46)] backdrop-blur-xl",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

function PillButton({
  icon,
  label,
  active = false,
  expanded = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  expanded?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition",
        active || expanded
          ? "border-white/16 bg-white/[0.1] text-zinc-100"
          : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/16 hover:bg-white/[0.08]"
      )}
      onClick={onClick}
    >
      <span className="text-zinc-400">{icon}</span>
      <span className="max-w-[160px] truncate">{label}</span>
      {expanded ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : null}
    </button>
  );
}

function SectionToggle({ title, open, onClick }: { title: string; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-left"
      onClick={onClick}
    >
      <span className="text-sm font-medium text-zinc-100">{title}</span>
      <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition", open && "rotate-180")} />
    </button>
  );
}

export function ImagePromptInput({
  isGeneratingImage = false,
  generationSpeed,
  stylePresets,
  selectedStylePresetId,
  styles,
  selectedStyleId,
  imageProviders,
  imageProvider,
  imageModel,
  providerFeatures,
  aspectRatioOptions,
  maxBatchSize,
  commonParams,
  modelParams,
  modelParamDefinitions,
  referenceImages,
  onGenerationSpeedChange,
  onImageProviderChange,
  onImageModelChange,
  onStyleChange,
  onSelectStylePreset,
  onCommonParamsChange,
  onModelParamsChange,
  onModelExtraParamChange,
  onAddReferenceFiles,
  onUpdateReferenceImage,
  onRemoveReferenceImage,
  onClearReferenceImages,
  onGenerateImage,
}: ImagePromptInputProps) {
  const [promptValue, setPromptValue] = useState("");
  const [activeHoverPanel, setActiveHoverPanel] = useState<HoverPanelId | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const selectedProvider = useMemo(
    () => imageProviders.find((provider) => provider.id === imageProvider) ?? imageProviders[0],
    [imageProvider, imageProviders]
  );
  const selectedPreset =
    stylePresets.find((preset) => preset.id === selectedStylePresetId) ?? null;
  const selectedStyle = styles.find((style) => style.id === selectedStyleId) ?? null;
  const selectedModel = selectedProvider?.models.find((model) => model.id === imageModel);
  const supportsCustomSize = aspectRatioOptions.includes("custom");
  const resolutionValue = resolveResolutionFromSize(commonParams.width, commonParams.height);
  const modelLabel = selectedModel?.name ?? imageModel;
  const styleLabel =
    selectedPreset?.title ??
    (selectedStyle && selectedStyle.id !== "none" ? selectedStyle.label : "Style");
  const resolutionLabel = supportsCustomSize
    ? formatResolutionLabel(resolutionValue)
    : "Auto size";
  const refsLabel =
    referenceImages.length > 0
      ? `Refs ${referenceImages.length}/${providerFeatures.referenceImages.maxImages}`
      : "Refs";

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, IMAGE_MAX_TEXTAREA_HEIGHT)}px`;
  }, [promptValue]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setModelMenuOpen(false);
        setActiveHoverPanel(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModelMenuOpen(false);
        setActiveHoverPanel(null);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!providerFeatures.referenceImages.enabled && activeHoverPanel === "refs") {
      setActiveHoverPanel(null);
    }
  }, [activeHoverPanel, providerFeatures.referenceImages.enabled]);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openHoverPanel = (panelId: HoverPanelId) => {
    clearCloseTimer();
    setModelMenuOpen(false);
    setActiveHoverPanel(panelId);
  };

  const scheduleHoverClose = (panelId: HoverPanelId) => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setActiveHoverPanel((current) => (current === panelId ? null : current));
    }, 140);
  };

  const toggleModelMenu = () => {
    clearCloseTimer();
    setActiveHoverPanel(null);
    setModelMenuOpen((current) => !current);
  };

  const submit = () => {
    const text = promptValue.trim();
    if (!text || isGeneratingImage) {
      return;
    }

    onGenerateImage({ text });
    setPromptValue("");
    setModelMenuOpen(false);
    setActiveHoverPanel(null);
  };

  const selectModel = (providerId: ImageProviderId, modelId: string) => {
    if (providerId !== imageProvider) {
      onImageProviderChange(providerId);
    }
    onImageModelChange(modelId);
    setModelMenuOpen(false);
  };

  const renderStylePanel = () => (
    <PanelShell className="left-0 w-[460px]">
      <div className="space-y-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">Style</p>
          <p className="mt-2 text-sm text-zinc-300">Pick a preset or lock a base style.</p>
        </div>

        <div className="grid max-h-[290px] grid-cols-2 gap-2 overflow-y-auto pr-1">
          {stylePresets.map((preset) => {
            const active = preset.id === selectedStylePresetId;
            return (
              <button
                key={preset.id}
                type="button"
                className={cn(
                  "overflow-hidden rounded-[20px] border text-left transition",
                  active
                    ? "border-white/18 bg-white/[0.08]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/18 hover:bg-white/[0.06]"
                )}
                onClick={() => onSelectStylePreset(preset)}
              >
                <img
                  src={preset.previewUrl}
                  alt={preset.title}
                  className="aspect-[5/4] w-full object-cover"
                />
                <div className="p-3">
                  <p className="text-sm font-medium text-zinc-100">{preset.title}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {styles.map((style) => {
            const active = style.id === selectedStyleId && !selectedStylePresetId;
            return (
              <button
                key={style.id}
                type="button"
                className={cn(
                  "rounded-full border px-3 py-2 text-xs font-medium transition",
                  active
                    ? "border-white/16 bg-white/[0.1] text-zinc-100"
                    : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/16 hover:bg-white/[0.08]"
                )}
                onClick={() => onStyleChange(style.id)}
              >
                {style.label}
              </button>
            );
          })}
        </div>
      </div>
    </PanelShell>
  );

  const renderRatioPanel = () => (
    <PanelShell className="left-1/2 w-[300px] -translate-x-1/2">
      <div className="grid grid-cols-3 gap-2">
        {aspectRatioOptions.map((ratio) => {
          const active = commonParams.aspectRatio === ratio;
          return (
            <button
              key={ratio}
              type="button"
              className={cn(
                "h-11 rounded-[18px] border text-sm font-medium transition",
                active
                  ? "border-white/16 bg-white/[0.1] text-zinc-100"
                  : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/16 hover:bg-white/[0.08]"
              )}
              onClick={() => {
                if (!supportsCustomSize) {
                  onCommonParamsChange({ aspectRatio: ratio });
                  return;
                }

                const resized = resolveSizeFromAspectAndResolution(
                  ratio,
                  Number(resolutionValue),
                  commonParams.width,
                  commonParams.height
                );
                onCommonParamsChange({
                  aspectRatio: ratio,
                  width: resized.width,
                  height: resized.height,
                });
              }}
            >
              {ratio}
            </button>
          );
        })}
      </div>
    </PanelShell>
  );

  const renderResolutionPanel = () => (
    <PanelShell className="left-1/2 w-[320px] -translate-x-1/2">
      {supportsCustomSize ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            {RESOLUTION_PRESETS.map((preset) => {
              const active = Number(resolutionValue) === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  className={cn(
                    "inline-flex h-10 flex-1 items-center justify-center rounded-full border text-sm font-medium transition",
                    active
                      ? "border-white/16 bg-white/[0.1] text-zinc-100"
                      : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/16 hover:bg-white/[0.08]"
                  )}
                  onClick={() => {
                    const resized = resolveSizeFromAspectAndResolution(
                      commonParams.aspectRatio,
                      preset,
                      commonParams.width,
                      commonParams.height
                    );
                    onCommonParamsChange({
                      width: resized.width,
                      height: resized.height,
                    });
                  }}
                >
                  {formatResolutionLabel(String(preset))}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              value={commonParams.width ?? ""}
              onChange={(event) =>
                onCommonParamsChange({ width: toNumberOrNull(event.target.value) })
              }
              className="h-11 rounded-[18px] border-white/10 bg-black/30 text-sm"
              placeholder="Width"
            />
            <Input
              type="number"
              value={commonParams.height ?? ""}
              onChange={(event) =>
                onCommonParamsChange({ height: toNumberOrNull(event.target.value) })
              }
              className="h-11 rounded-[18px] border-white/10 bg-black/30 text-sm"
              placeholder="Height"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-[18px] border border-white/10 bg-black/30 px-4 py-4 text-sm text-zinc-300">
          Current model uses provider-managed output sizes. Switch to a Flux model to set
          explicit resolution.
        </div>
      )}
    </PanelShell>
  );

  const renderRefsPanel = () => (
    <PanelShell className="left-1/2 w-[360px] -translate-x-1/2">
      <ReferenceImagePicker
        referenceImages={referenceImages}
        maxImages={providerFeatures.referenceImages.maxImages}
        supportedTypes={providerFeatures.referenceImages.supportedTypes}
        supportsWeight={providerFeatures.referenceImages.supportsWeight}
        onAddFiles={onAddReferenceFiles}
        onUpdateImage={onUpdateReferenceImage}
        onRemoveImage={onRemoveReferenceImage}
        onClearImages={onClearReferenceImages}
      />
    </PanelShell>
  );

  const renderMorePanel = () => (
    <PanelShell className="right-0 w-[520px]">
      <div className="space-y-3">
        <SectionToggle
          title="Advanced"
          open={showAdvanced}
          onClick={() => setShowAdvanced((current) => !current)}
        />

        {showAdvanced ? (
          <div className="space-y-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Batch</Label>
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
                  className="h-10 rounded-[16px] border-white/10 bg-black/30 text-sm"
                />
              </div>

              {providerFeatures.seed ? (
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Seed</Label>
                  <Input
                    type="number"
                    value={modelParams.seed ?? ""}
                    onChange={(event) =>
                      onModelParamsChange({ seed: toNumberOrNull(event.target.value) })
                    }
                    className="h-10 rounded-[16px] border-white/10 bg-black/30 text-sm"
                    placeholder="Auto"
                  />
                </div>
              ) : null}

              {providerFeatures.guidanceScale ? (
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                    Guidance
                  </Label>
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
                    className="h-10 rounded-[16px] border-white/10 bg-black/30 text-sm"
                    placeholder="Auto"
                  />
                </div>
              ) : null}

              {providerFeatures.steps ? (
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Steps</Label>
                  <Input
                    type="number"
                    min={1}
                    max={80}
                    value={modelParams.steps ?? ""}
                    onChange={(event) =>
                      onModelParamsChange({ steps: toNumberOrNull(event.target.value) })
                    }
                    className="h-10 rounded-[16px] border-white/10 bg-black/30 text-sm"
                    placeholder="Auto"
                  />
                </div>
              ) : null}
            </div>

            {providerFeatures.steps ? (
              <div className="space-y-2">
                <Label className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Speed</Label>
                <div className="flex flex-wrap gap-2">
                  {SPEED_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={cn(
                        "rounded-full border px-3 py-2 text-xs font-medium transition",
                        generationSpeed === option.id
                          ? "border-white/16 bg-white/[0.1] text-zinc-100"
                          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/16 hover:bg-white/[0.08]"
                      )}
                      onClick={() => onGenerationSpeedChange(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {modelParamDefinitions.length > 0 ? (
              <div className="space-y-3">
                {modelParamDefinitions.map((field) => {
                  const value = modelParams.extra[field.key];

                  if (field.type === "select") {
                    return (
                      <div key={field.key} className="space-y-1.5">
                        <Label className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                          {field.label}
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {(field.options ?? []).map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={cn(
                                "rounded-full border px-3 py-2 text-xs font-medium transition",
                                (typeof value === "string" ? value : String(field.defaultValue ?? "")) === option.value
                                  ? "border-white/16 bg-white/[0.1] text-zinc-100"
                                  : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/16 hover:bg-white/[0.08]"
                              )}
                              onClick={() => onModelExtraParamChange(field.key, option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  if (field.type === "boolean") {
                    return (
                      <label
                        key={field.key}
                        className="flex h-10 items-center gap-3 rounded-[16px] border border-white/10 bg-black/30 px-4 text-sm text-zinc-200"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(event) =>
                            onModelExtraParamChange(field.key, event.target.checked)
                          }
                          className="h-4 w-4 rounded border-white/20 bg-transparent"
                        />
                        {field.label}
                      </label>
                    );
                  }

                  return (
                    <div key={field.key} className="space-y-1.5">
                      <Label className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                        {field.label}
                      </Label>
                      <Input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step ?? 1}
                        value={typeof value === "number" ? value : ""}
                        onChange={(event) =>
                          onModelExtraParamChange(field.key, toNumberOrNull(event.target.value))
                        }
                        className="h-10 rounded-[16px] border-white/10 bg-black/30 text-sm"
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}

            {providerFeatures.negativePrompt ? (
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                  Negative prompt
                </Label>
                <textarea
                  value={modelParams.negativePrompt}
                  onChange={(event) =>
                    onModelParamsChange({ negativePrompt: event.target.value })
                  }
                  placeholder="Describe what to avoid"
                  className="min-h-[88px] w-full resize-y rounded-[18px] border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <SectionToggle
          title="API Keys"
          open={showApiKeys}
          onClick={() => setShowApiKeys((current) => !current)}
        />

        {showApiKeys ? (
          <ProviderApiKeyPanel
            providers={imageProviders.map((provider) => ({
              id: provider.id,
              name: provider.name,
            }))}
            currentProvider={imageProvider}
          />
        ) : null}
      </div>
    </PanelShell>
  );

  const renderHoverPanel = (panelId: HoverPanelId) => {
    if (activeHoverPanel !== panelId) {
      return null;
    }

    if (panelId === "style") return renderStylePanel();
    if (panelId === "ratio") return renderRatioPanel();
    if (panelId === "resolution") return renderResolutionPanel();
    if (panelId === "refs") return renderRefsPanel();
    return renderMorePanel();
  };

  return (
    <div className="bg-[#050506] px-6 pb-6 pt-3">
      <div ref={containerRef} className="mx-auto w-full max-w-[1040px]">
        <form
          className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(29,30,34,0.94),rgba(19,20,24,0.98))] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.42)]"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <textarea
            name="image-prompt"
            ref={textareaRef}
            value={promptValue}
            onChange={(event) => setPromptValue(event.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.shiftKey ||
                isComposing ||
                event.nativeEvent.isComposing
              ) {
                return;
              }
              event.preventDefault();
              submit();
            }}
            placeholder="Describe an image and click generate..."
            className="min-h-[108px] max-h-[220px] w-full resize-none overflow-y-auto border-none bg-transparent px-2 py-2 text-[22px] leading-tight text-zinc-50 outline-none placeholder:text-zinc-500 sm:text-[24px]"
          />

          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <PillButton
                  icon={<Sparkles className="h-4 w-4" />}
                  label={modelLabel}
                  active={modelMenuOpen}
                  expanded
                  onClick={toggleModelMenu}
                />

                <AnimatePresence>
                  {modelMenuOpen ? (
                    <PanelShell className="left-0 max-h-[420px] w-[340px] overflow-y-auto p-2">
                      <div className="space-y-3">
                        {imageProviders.map((provider) => (
                          <div key={provider.id}>
                            <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.26em] text-zinc-500">
                              {provider.name}
                            </p>
                            <div className="space-y-1">
                              {provider.models.map((model) => {
                                const active =
                                  provider.id === imageProvider && model.id === imageModel;
                                return (
                                  <button
                                    key={`${provider.id}-${model.id}`}
                                    type="button"
                                    className={cn(
                                      "flex w-full items-start gap-3 rounded-[18px] px-3 py-3 text-left transition",
                                      active
                                        ? "bg-white/[0.1] text-zinc-100"
                                        : "text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100"
                                    )}
                                    onClick={() => selectModel(provider.id, model.id)}
                                  >
                                    <span className="mt-1 h-2.5 w-2.5 rounded-full border border-white/20 bg-white/10" />
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-sm font-medium">{model.name}</span>
                                      {model.description ? (
                                        <span className="mt-1 block text-xs leading-5 text-zinc-500">
                                          {model.description}
                                        </span>
                                      ) : null}
                                    </span>
                                    {active ? (
                                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-100" />
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </PanelShell>
                  ) : null}
                </AnimatePresence>
              </div>

              {([
                { id: "style", label: styleLabel, icon: <Palette className="h-4 w-4" /> },
              ] as Array<{ id: HoverPanelId; label: string; icon: ReactNode }>).map((entry) => (
                <div
                  key={entry.id}
                  className="relative"
                  onMouseEnter={() => openHoverPanel(entry.id)}
                  onMouseLeave={() => scheduleHoverClose(entry.id)}
                  onFocusCapture={() => openHoverPanel(entry.id)}
                  onBlurCapture={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      scheduleHoverClose(entry.id);
                    }
                  }}
                >
                  <PillButton icon={entry.icon} label={entry.label} active={activeHoverPanel === entry.id} />
                  <AnimatePresence>{renderHoverPanel(entry.id)}</AnimatePresence>
                </div>
              ))}

              {providerFeatures.referenceImages.enabled ? (
                <div
                  className="relative"
                  onMouseEnter={() => openHoverPanel("refs")}
                  onMouseLeave={() => scheduleHoverClose("refs")}
                  onFocusCapture={() => openHoverPanel("refs")}
                  onBlurCapture={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      scheduleHoverClose("refs");
                    }
                  }}
                >
                  <PillButton
                    icon={<ImagePlus className="h-4 w-4" />}
                    label={refsLabel}
                    active={activeHoverPanel === "refs"}
                  />
                  <AnimatePresence>{renderHoverPanel("refs")}</AnimatePresence>
                </div>
              ) : null}

              {([
                { id: "ratio", label: commonParams.aspectRatio, icon: <Ratio className="h-4 w-4" /> },
                { id: "resolution", label: resolutionLabel, icon: <SwatchBook className="h-4 w-4" /> },
                { id: "more", label: "More", icon: <Settings2 className="h-4 w-4" /> },
              ] as Array<{ id: HoverPanelId; label: string; icon: ReactNode }>).map((entry) => (
                <div
                  key={entry.id}
                  className="relative"
                  onMouseEnter={() => openHoverPanel(entry.id)}
                  onMouseLeave={() => scheduleHoverClose(entry.id)}
                  onFocusCapture={() => openHoverPanel(entry.id)}
                  onBlurCapture={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      scheduleHoverClose(entry.id);
                    }
                  }}
                >
                  <PillButton icon={entry.icon} label={entry.label} active={activeHoverPanel === entry.id} />
                  <AnimatePresence>{renderHoverPanel(entry.id)}</AnimatePresence>
                </div>
              ))}
            </div>

            <button
              type="submit"
              className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#f5f1e6] text-zinc-950 shadow-[0_18px_40px_rgba(245,241,230,0.14)] transition hover:scale-[1.02] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!promptValue.trim() || isGeneratingImage}
              aria-label="Generate image"
            >
              {isGeneratingImage ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <SendHorizonal className="h-5 w-5" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
