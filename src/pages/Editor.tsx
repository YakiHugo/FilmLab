
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { useShallow } from "zustand/react/shallow";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { presets as basePresets } from "@/data/presets";
import { applyPresetAdjustments, createDefaultAdjustments } from "@/lib/adjustments";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/stores/projectStore";
import type {
  EditingAdjustments,
  HslColorKey,
  Preset,
  PresetAdjustmentKey,
  PresetAdjustments,
} from "@/types";
import { EditorHistogram } from "./editor/EditorHistogram";
import { EditorPreviewCard } from "./editor/EditorPreviewCard";
import { ASPECT_RATIOS } from "./editor/constants";

const CUSTOM_PRESETS_KEY = "filmlab.customPresets";

type SectionId =
  | "basic"
  | "hsl"
  | "curve"
  | "effects"
  | "detail"
  | "crop"
  | "local"
  | "ai"
  | "export";

type CurveChannel = "rgb" | "red" | "green" | "blue";

const presetAdjustmentKeys: PresetAdjustmentKey[] = [
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "temperature",
  "tint",
  "vibrance",
  "saturation",
  "clarity",
  "dehaze",
  "vignette",
  "grain",
];

const HSL_COLORS: Array<{ id: HslColorKey; label: string; swatch: string }> = [
  { id: "red", label: "红", swatch: "bg-red-400" },
  { id: "orange", label: "橙", swatch: "bg-orange-400" },
  { id: "yellow", label: "黄", swatch: "bg-yellow-300" },
  { id: "green", label: "绿", swatch: "bg-emerald-400" },
  { id: "aqua", label: "青", swatch: "bg-cyan-400" },
  { id: "blue", label: "蓝", swatch: "bg-blue-400" },
  { id: "purple", label: "紫", swatch: "bg-purple-400" },
  { id: "magenta", label: "洋红", swatch: "bg-pink-400" },
];

const formatSigned = (value: number) => (value > 0 ? `+${value}` : `${value}`);

const loadCustomPresets = () => {
  if (typeof window === "undefined") {
    return [] as Preset[];
  }
  const stored = window.localStorage.getItem(CUSTOM_PRESETS_KEY);
  if (!stored) {
    return [] as Preset[];
  }
  try {
    const parsed = JSON.parse(stored) as Preset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as Preset[];
  }
};

const buildCustomAdjustments = (adjustments: EditingAdjustments) => {
  const base = createDefaultAdjustments();
  return presetAdjustmentKeys.reduce<PresetAdjustments>((result, key) => {
    const delta = adjustments[key] - base[key];
    if (Math.abs(delta) >= 1) {
      result[key] = delta;
    }
    return result;
  }, {});
};

const resolveAdjustments = (
  adjustments: EditingAdjustments | undefined,
  presetId: string | undefined,
  intensity: number | undefined,
  presets: Preset[]
) => {
  const base = adjustments ?? createDefaultAdjustments();
  if (!presetId) {
    return base;
  }
  const preset = presets.find((item) => item.id === presetId);
  if (!preset) {
    return base;
  }
  const resolvedIntensity =
    typeof intensity === "number" ? intensity : preset.intensity;
  return applyPresetAdjustments(base, preset.adjustments, resolvedIntensity);
};

const isPresetLike = (value: unknown): value is Preset => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Preset;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.adjustments === "object"
  );
};
export function Editor() {
  const { assets, updateAsset } = useProjectStore(
    useShallow((state) => ({
      assets: state.assets,
      updateAsset: state.updateAsset,
    }))
  );
  const { assetId } = useSearch({ from: "/editor" });
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [copiedAdjustments, setCopiedAdjustments] =
    useState<EditingAdjustments | null>(null);
  const [customPresetName, setCustomPresetName] = useState("");
  const [customPresets, setCustomPresets] = useState<Preset[]>(loadCustomPresets);
  const [activeHslColor, setActiveHslColor] = useState<HslColorKey>("red");
  const [curveChannel, setCurveChannel] = useState<CurveChannel>("rgb");
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    basic: true,
    hsl: false,
    curve: false,
    effects: true,
    detail: false,
    crop: true,
    local: false,
    ai: false,
    export: false,
  });
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets));
  }, [customPresets]);

  useEffect(() => {
    if (assetId && assets.some((asset) => asset.id === assetId)) {
      setSelectedAssetId(assetId);
    }
  }, [assetId, assets]);

  useEffect(() => {
    if (!selectedAssetId && assets.length > 0) {
      const fallbackId = assets.some((asset) => asset.id === assetId)
        ? assetId
        : assets[0].id;
      setSelectedAssetId(fallbackId ?? null);
    }
  }, [assets, assetId, selectedAssetId]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId]
  );

  const adjustments = useMemo(() => {
    if (!selectedAsset) {
      return null;
    }
    return selectedAsset.adjustments ?? createDefaultAdjustments();
  }, [selectedAsset]);

  const allPresets = useMemo(() => [...basePresets, ...customPresets], [customPresets]);

  const previewAdjustments = useMemo(() => {
    if (!selectedAsset || !adjustments) {
      return null;
    }
    return resolveAdjustments(
      adjustments,
      selectedAsset.presetId,
      selectedAsset.intensity,
      allPresets
    );
  }, [adjustments, allPresets, selectedAsset]);

  const presetLabel = useMemo(() => {
    if (!selectedAsset?.presetId) return "未设置";
    return (
      allPresets.find((preset) => preset.id === selectedAsset.presetId)?.name ??
      "未设置"
    );
  }, [allPresets, selectedAsset?.presetId]);

  const updateAdjustments = (partial: Partial<EditingAdjustments>) => {
    if (!selectedAsset || !adjustments) {
      return;
    }
    updateAsset(selectedAsset.id, {
      adjustments: {
        ...adjustments,
        ...partial,
      },
    });
  };

  const updateAdjustmentValue = (key: keyof EditingAdjustments, value: number) => {
    updateAdjustments({ [key]: value } as Partial<EditingAdjustments>);
  };

  const updateHslValue = (
    color: HslColorKey,
    channel: "hue" | "saturation" | "luminance",
    value: number
  ) => {
    if (!adjustments) {
      return;
    }
    updateAdjustments({
      hsl: {
        ...adjustments.hsl,
        [color]: {
          ...adjustments.hsl[color],
          [channel]: value,
        },
      },
    });
  };

  const toggleFlip = (axis: "flipHorizontal" | "flipVertical") => {
    if (!adjustments) {
      return;
    }
    updateAdjustments({ [axis]: !adjustments[axis] } as Partial<EditingAdjustments>);
  };

  const handleResetAll = () => {
    if (!selectedAsset) {
      return;
    }
    updateAsset(selectedAsset.id, { adjustments: createDefaultAdjustments() });
  };

  const handleCopy = () => {
    if (!adjustments) {
      return;
    }
    if (typeof structuredClone === "function") {
      setCopiedAdjustments(structuredClone(adjustments));
    } else {
      setCopiedAdjustments(JSON.parse(JSON.stringify(adjustments)) as EditingAdjustments);
    }
  };

  const handlePaste = () => {
    if (!selectedAsset || !copiedAdjustments) {
      return;
    }
    const payload =
      typeof structuredClone === "function"
        ? structuredClone(copiedAdjustments)
        : (JSON.parse(JSON.stringify(copiedAdjustments)) as EditingAdjustments);
    updateAsset(selectedAsset.id, { adjustments: payload });
  };

  const handleSelectPreset = (presetId: string) => {
    if (!selectedAsset) {
      return;
    }
    updateAsset(selectedAsset.id, { presetId });
  };

  const handleSetIntensity = (value: number) => {
    if (!selectedAsset) {
      return;
    }
    updateAsset(selectedAsset.id, { intensity: value });
  };

  const handleSaveCustomPreset = () => {
    if (!previewAdjustments) {
      return;
    }
    const name = customPresetName.trim();
    if (!name) {
      return;
    }
    const custom: Preset = {
      id: `custom-${Date.now()}`,
      name,
      tags: ["人像"],
      intensity: 100,
      description: "自定义风格",
      adjustments: buildCustomAdjustments(previewAdjustments),
    };
    setCustomPresets((prev) => [custom, ...prev]);
    setCustomPresetName("");
    if (selectedAsset) {
      updateAsset(selectedAsset.id, { presetId: custom.id, intensity: 100 });
    }
  };

  const handleExportPresets = () => {
    if (customPresets.length === 0) {
      return;
    }
    const blob = new Blob([JSON.stringify(customPresets, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "filmlab-presets.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportPresets = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const incoming = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as any).presets)
          ? (parsed as any).presets
          : [];
      const normalized = incoming
        .filter(isPresetLike)
        .map((preset, index) => ({
          id: preset.id || `imported-${Date.now()}-${index}`,
          name: preset.name || `导入预设 ${index + 1}`,
          tags: Array.isArray(preset.tags) ? preset.tags : ["自定义"],
          intensity: typeof preset.intensity === "number" ? preset.intensity : 100,
          description: typeof preset.description === "string" ? preset.description : "导入预设",
          adjustments: preset.adjustments ?? {},
        }));
      if (normalized.length > 0) {
        setCustomPresets((prev) => {
          const existing = new Map(prev.map((preset) => [preset.id, preset]));
          normalized.forEach((preset) => {
            existing.set(preset.id, preset);
          });
          return Array.from(existing.values());
        });
      }
    } catch {
      return;
    } finally {
      if (importRef.current) {
        importRef.current.value = "";
      }
    }
  };

  const toggleSection = (id: SectionId) => {
    setOpenSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const Section = ({
    id,
    title,
    hint,
    children,
  }: {
    id: SectionId;
    title: string;
    hint?: string;
    children: ReactNode;
  }) => (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
        onClick={() => toggleSection(id)}
      >
        <div>
          <p className="text-sm font-medium text-slate-100">{title}</p>
          {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-slate-400 transition",
            openSections[id] && "rotate-180"
          )}
        />
      </button>
      {openSections[id] && <div className="space-y-4 px-3 pb-4">{children}</div>}
    </div>
  );

  const SliderRow = ({
    label,
    value,
    min,
    max,
    step = 1,
    format,
    onChange,
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    format?: (value: number) => string;
    onChange: (value: number) => void;
  }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="text-slate-300">{label}</span>
        <span>{format ? format(value) : value}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(next[0] ?? 0)}
      />
    </div>
  );
  return (
    <div className="app-bg h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="flex h-full flex-col">
        {assets.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <Card className="w-full max-w-lg animate-fade-up">
              <CardContent className="p-6 text-center text-sm text-slate-400">
                还没有素材，请先在工作台导入照片。
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
                <EditorPreviewCard
                  selectedAsset={selectedAsset}
                  adjustments={previewAdjustments}
                  presetLabel={presetLabel}
                  showOriginal={showOriginal}
                  onToggleOriginal={() => setShowOriginal((prev) => !prev)}
                  onResetAll={handleResetAll}
                  onCopy={handleCopy}
                  onPaste={handlePaste}
                  canPaste={Boolean(copiedAdjustments)}
                />
              </div>
              <div className="shrink-0 border-t border-white/10 bg-slate-950/80 px-6 py-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>素材胶片</span>
                  <span>共 {assets.length} 张</span>
                </div>
                <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                  {assets.map((asset) => {
                    const isActive = asset.id === selectedAssetId;
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        className={cn(
                          "flex min-w-[160px] items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-left transition",
                          isActive && "border-sky-200/40 bg-sky-300/10"
                        )}
                        onClick={() => setSelectedAssetId(asset.id)}
                      >
                        <img
                          src={asset.thumbnailUrl ?? asset.objectUrl}
                          alt={asset.name}
                          className="h-12 w-12 rounded-xl object-cover"
                        />
                        <div className="text-xs text-slate-300">
                          <p className="font-medium text-slate-100 line-clamp-1">
                            {asset.name}
                          </p>
                          <p>分组：{asset.group ?? "未分组"}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <aside className="flex min-h-0 w-full flex-col border-t border-white/10 bg-slate-950/90 lg:w-[360px] lg:border-l lg:border-t-0">
              <div className="shrink-0 border-b border-white/10 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="uppercase tracking-[0.24em] text-slate-500">
                    直方图
                  </span>
                  {selectedAsset ? (
                    <span className="text-slate-300 line-clamp-1">
                      {selectedAsset.name}
                    </span>
                  ) : (
                    <span className="text-slate-500">未选择</span>
                  )}
                </div>
                <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                  <EditorHistogram asset={selectedAsset} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="secondary">自动</Badge>
                  <Badge variant="secondary">黑白</Badge>
                  <Badge variant="secondary">HDR</Badge>
                  <Badge variant="outline">Luma</Badge>
                </div>
                {selectedAsset && (
                  <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300">
                    <div className="flex items-center justify-between">
                      <span>当前预设</span>
                      <span className="text-slate-100">{presetLabel}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>强度</span>
                      <span>{selectedAsset.intensity ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>分组</span>
                      <span>{selectedAsset.group ?? "未分组"}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                <Card>
                  <CardHeader>
                    <CardTitle>预设系统</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                        内置预设
                      </p>
                      <div className="grid gap-2">
                        {basePresets.map((preset) => (
                          <Button
                            key={preset.id}
                            size="sm"
                            variant={
                              (selectedAsset?.presetId ?? basePresets[0]?.id) === preset.id
                                ? "default"
                                : "secondary"
                            }
                            onClick={() => handleSelectPreset(preset.id)}
                            disabled={!selectedAsset}
                            className="justify-start"
                          >
                            {preset.name}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {customPresets.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                          自定义预设
                        </p>
                        <div className="grid gap-2">
                          {customPresets.map((preset) => (
                            <Button
                              key={preset.id}
                              size="sm"
                              variant={
                                (selectedAsset?.presetId ?? "") === preset.id
                                  ? "default"
                                  : "secondary"
                              }
                              onClick={() => handleSelectPreset(preset.id)}
                              disabled={!selectedAsset}
                              className="justify-start"
                            >
                              {preset.name}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="text-slate-300">预设强度</span>
                        <span>{selectedAsset?.intensity ?? 0}</span>
                      </div>
                      <Slider
                        value={[selectedAsset?.intensity ?? 0]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={(value) => handleSetIntensity(value[0] ?? 0)}
                        disabled={!selectedAsset}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-slate-400">保存为自定义预设</Label>
                      <Input
                        value={customPresetName}
                        onChange={(event) => setCustomPresetName(event.target.value)}
                        placeholder="输入预设名称"
                      />
                      <Button
                        className="w-full"
                        onClick={handleSaveCustomPreset}
                        disabled={!customPresetName.trim() || !previewAdjustments}
                      >
                        保存预设
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleExportPresets}
                        disabled={customPresets.length === 0}
                      >
                        导出 JSON
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => importRef.current?.click()}
                      >
                        导入 JSON
                      </Button>
                      <input
                        ref={importRef}
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={handleImportPresets}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>操作体验</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-slate-300">
                    <p>实时预览：滑杆即刻生效。</p>
                    <p>原图/编辑对比：支持一键切换。</p>
                    <p>批量处理：回到工作台可同步参数。</p>
                    <p className="text-slate-500">双指缩放、Undo/Redo、历史记录规划中。</p>
                  </CardContent>
                </Card>

                {!adjustments ? (
                  <Card>
                    <CardContent className="p-4 text-sm text-slate-400">
                      请选择一张照片以查看精修工具。
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    <Section id="basic" title="基础调整" hint="光线 / 曝光 / 颜色">
                      <div className="space-y-3">
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                          光线
                        </p>
                        <SliderRow
                          label="曝光"
                          value={adjustments.exposure}
                          min={-100}
                          max={100}
                          format={formatSigned}
                          onChange={(value) => updateAdjustmentValue("exposure", value)}
                        />
                        <SliderRow
                          label="对比度"
                          value={adjustments.contrast}
                          min={-100}
                          max={100}
                          format={formatSigned}
                          onChange={(value) => updateAdjustmentValue("contrast", value)}
                        />
                        <SliderRow
                          label="高光"
                          value={adjustments.highlights}
                          min={-100}
                          max={100}
                          format={formatSigned}
                          onChange={(value) => updateAdjustmentValue("highlights", value)}
                        />
                        <SliderRow
                          label="阴影"
                          value={adjustments.shadows}
                          min={-100}
                          max={100}
                          format={formatSigned}
                          onChange={(value) => updateAdjustmentValue("shadows", value)}
                        />
                        <SliderRow
                          label="白色色阶"
                          value={adjustments.whites}
                          min={-100}
                          max={100}
                          format={formatSigned}
                          onChange={(value) => updateAdjustmentValue("whites", value)}
                        />
                        <SliderRow
                          label="黑色色阶"
                          value={adjustments.blacks}
                          min={-100}
                          max={100}
                          format={formatSigned}
                          onChange={(value) => updateAdjustmentValue("blacks", value)}
                        />
                        <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">
                          颜色
                        </p>
                        <SliderRow
                          label="色温"
                          value={adjustments.temperature}
                          min={-100}
                          max={100}
                          format={formatSigned}
                          onChange={(value) => updateAdjustmentValue("temperature", value)}
                        />
                        <SliderRow
                          label="色调"
                          value={adjustments.tint}
                          min={-100}
                          max={100}
                          format={formatSigned}
                          onChange={(value) => updateAdjustmentValue("tint", value)}
                        />
                        <SliderRow
                          label="饱和度"
                          value={adjustments.saturation}
                          min={-100}
                          max={100}
                          format={formatSigned}
                          onChange={(value) => updateAdjustmentValue("saturation", value)}
                        />
                        <SliderRow
                          label="自然饱和度"
                          value={adjustments.vibrance}
                          min={-100}
                          max={100}
                          format={formatSigned}
                          onChange={(value) => updateAdjustmentValue("vibrance", value)}
                        />
                      </div>
                    </Section>

                    <Section
                      id="hsl"
                      title="HSL 颜色精细控制"
                      hint="Hue / Saturation / Luminance"
                    >
                      <div className="flex flex-wrap gap-2">
                        {HSL_COLORS.map((color) => (
                          <button
                            key={color.id}
                            type="button"
                            onClick={() => setActiveHslColor(color.id)}
                            className={cn(
                              "flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs",
                              activeHslColor === color.id
                                ? "bg-white/10 text-white"
                                : "text-slate-300"
                            )}
                          >
                            <span className={cn("h-2 w-2 rounded-full", color.swatch)} />
                            {color.label}
                          </button>
                        ))}
                      </div>
                      <SliderRow
                        label="色相 (H)"
                        value={adjustments.hsl[activeHslColor].hue}
                        min={-100}
                        max={100}
                        format={formatSigned}
                        onChange={(value) => updateHslValue(activeHslColor, "hue", value)}
                      />
                      <SliderRow
                        label="饱和度 (S)"
                        value={adjustments.hsl[activeHslColor].saturation}
                        min={-100}
                        max={100}
                        format={formatSigned}
                        onChange={(value) => updateHslValue(activeHslColor, "saturation", value)}
                      />
                      <SliderRow
                        label="明亮度 (L)"
                        value={adjustments.hsl[activeHslColor].luminance}
                        min={-100}
                        max={100}
                        format={formatSigned}
                        onChange={(value) => updateHslValue(activeHslColor, "luminance", value)}
                      />
                      <p className="text-[11px] text-slate-500">
                        已覆盖红/橙/黄/绿/青/蓝/紫/洋红（渲染适配中）。
                      </p>
                    </Section>

                    <Section id="curve" title="曲线" hint="RGB 总曲线 / 单通道">
                      <div className="flex flex-wrap gap-2">
                        {([
                          { id: "rgb", label: "RGB" },
                          { id: "red", label: "R" },
                          { id: "green", label: "G" },
                          { id: "blue", label: "B" },
                        ] as const).map((item) => (
                          <Button
                            key={item.id}
                            size="sm"
                            variant={curveChannel === item.id ? "default" : "secondary"}
                            onClick={() => setCurveChannel(item.id)}
                            disabled={item.id !== "rgb"}
                          >
                            {item.label}
                          </Button>
                        ))}
                      </div>
                      <SliderRow
                        label="高光"
                        value={adjustments.curveHighlights}
                        min={-100}
                        max={100}
                        format={formatSigned}
                        onChange={(value) => updateAdjustmentValue("curveHighlights", value)}
                      />
                      <SliderRow
                        label="亮部"
                        value={adjustments.curveLights}
                        min={-100}
                        max={100}
                        format={formatSigned}
                        onChange={(value) => updateAdjustmentValue("curveLights", value)}
                      />
                      <SliderRow
                        label="暗部"
                        value={adjustments.curveDarks}
                        min={-100}
                        max={100}
                        format={formatSigned}
                        onChange={(value) => updateAdjustmentValue("curveDarks", value)}
                      />
                      <SliderRow
                        label="阴影"
                        value={adjustments.curveShadows}
                        min={-100}
                        max={100}
                        format={formatSigned}
                        onChange={(value) => updateAdjustmentValue("curveShadows", value)}
                      />
                      <p className="text-[11px] text-slate-500">
                        点曲线与单通道曲线编辑规划中。
                      </p>
                    </Section>

                    <Section id="effects" title="清晰度与质感" hint="Clarity / Texture / Dehaze">
                      <SliderRow
                        label="清晰度"
                        value={adjustments.clarity}
                        min={-100}
                        max={100}
                        format={formatSigned}
                        onChange={(value) => updateAdjustmentValue("clarity", value)}
                      />
                      <SliderRow
                        label="纹理"
                        value={adjustments.texture}
                        min={-100}
                        max={100}
                        format={formatSigned}
                        onChange={(value) => updateAdjustmentValue("texture", value)}
                      />
                      <SliderRow
                        label="去雾"
                        value={adjustments.dehaze}
                        min={-100}
                        max={100}
                        format={formatSigned}
                        onChange={(value) => updateAdjustmentValue("dehaze", value)}
                      />
                      <SliderRow
                        label="暗角"
                        value={adjustments.vignette}
                        min={-100}
                        max={100}
                        format={formatSigned}
                        onChange={(value) => updateAdjustmentValue("vignette", value)}
                      />
                      <SliderRow
                        label="颗粒"
                        value={adjustments.grain}
                        min={0}
                        max={100}
                        onChange={(value) => updateAdjustmentValue("grain", value)}
                      />
                      <SliderRow
                        label="颗粒大小"
                        value={adjustments.grainSize}
                        min={0}
                        max={100}
                        onChange={(value) => updateAdjustmentValue("grainSize", value)}
                      />
                      <SliderRow
                        label="颗粒粗糙度"
                        value={adjustments.grainRoughness}
                        min={0}
                        max={100}
                        onChange={(value) => updateAdjustmentValue("grainRoughness", value)}
                      />
                    </Section>

                    <Section id="detail" title="细节与降噪" hint="锐化 / 降噪">
                      <SliderRow
                        label="锐化"
                        value={adjustments.sharpening}
                        min={0}
                        max={100}
                        onChange={(value) => updateAdjustmentValue("sharpening", value)}
                      />
                      <SliderRow
                        label="遮罩"
                        value={adjustments.masking}
                        min={0}
                        max={100}
                        onChange={(value) => updateAdjustmentValue("masking", value)}
                      />
                      <SliderRow
                        label="亮度降噪"
                        value={adjustments.noiseReduction}
                        min={0}
                        max={100}
                        onChange={(value) => updateAdjustmentValue("noiseReduction", value)}
                      />
                      <SliderRow
                        label="色彩降噪"
                        value={adjustments.colorNoiseReduction}
                        min={0}
                        max={100}
                        onChange={(value) =>
                          updateAdjustmentValue("colorNoiseReduction", value)
                        }
                      />
                      <p className="text-[11px] text-slate-500">
                        细节算法将逐步接入渲染管线。
                      </p>
                    </Section>

                    <Section id="crop" title="裁切与构图" hint="比例 / 旋转 / 翻转">
                      <div className="flex flex-wrap gap-2">
                        {ASPECT_RATIOS.map((ratio) => (
                          <Button
                            key={ratio.value}
                            size="sm"
                            variant={
                              adjustments.aspectRatio === ratio.value
                                ? "default"
                                : "secondary"
                            }
                            onClick={() => updateAdjustments({ aspectRatio: ratio.value })}
                          >
                            {ratio.label}
                          </Button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={adjustments.flipHorizontal ? "default" : "secondary"}
                          onClick={() => toggleFlip("flipHorizontal")}
                        >
                          水平翻转
                        </Button>
                        <Button
                          size="sm"
                          variant={adjustments.flipVertical ? "default" : "secondary"}
                          onClick={() => toggleFlip("flipVertical")}
                        >
                          垂直翻转
                        </Button>
                      </div>
                      <SliderRow
                        label="旋转 / 拉直"
                        value={adjustments.rotate}
                        min={-45}
                        max={45}
                        format={(value) => `${formatSigned(value)}°`}
                        onChange={(value) => updateAdjustmentValue("rotate", value)}
                      />
                      <SliderRow
                        label="水平"
                        value={adjustments.horizontal}
                        min={-100}
                        max={100}
                        format={formatSigned}
                        onChange={(value) => updateAdjustmentValue("horizontal", value)}
                      />
                      <SliderRow
                        label="垂直"
                        value={adjustments.vertical}
                        min={-100}
                        max={100}
                        format={formatSigned}
                        onChange={(value) => updateAdjustmentValue("vertical", value)}
                      />
                      <SliderRow
                        label="缩放"
                        value={adjustments.scale}
                        min={80}
                        max={120}
                        format={(value) => `${value}%`}
                        onChange={(value) => updateAdjustmentValue("scale", value)}
                      />
                    </Section>

                    <Section id="local" title="局部调整" hint="渐变 / 径向 / 画笔">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-300">
                        渐变滤镜、径向滤镜、画笔、局部曝光/对比/色温（规划中）。
                      </div>
                    </Section>

                    <Section id="ai" title="AI / 智能功能" hint="Web 端亮点">
                      <div className="flex flex-wrap gap-2">
                        {[
                          "自动曝光/自动白平衡",
                          "智能抠主体",
                          "智能天空增强",
                          "人像肤色保护",
                        ].map((label) => (
                          <Badge
                            key={label}
                            className="border-white/10 bg-white/5 text-slate-200"
                          >
                            {label}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        AI 功能作为 Web 端优势，逐步开放。
                      </p>
                    </Section>

                    <Section id="export" title="导出与格式" hint="尺寸 / 质量 / 色彩">
                      <div className="space-y-2 text-xs text-slate-300">
                        <p>导出尺寸：原图 / 指定长边。</p>
                        <p>导出质量：JPEG 质量可调。</p>
                        <p>格式：PNG / JPEG / WebP。</p>
                        <p>色彩空间：默认 sRGB。</p>
                        <p>EXIF：可保留或移除。</p>
                      </div>
                      <Button size="sm" variant="secondary" asChild>
                        <Link to="/" search={{ step: "export" }}>
                          前往导出设置
                        </Link>
                      </Button>
                    </Section>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
