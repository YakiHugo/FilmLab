import { useEffect, useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { presets } from "@/data/presets";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { useProjectStore } from "@/stores/projectStore";
import type { EditingAdjustments } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";

const defaultAdjustments = createDefaultAdjustments();
const presetMap = new Map(presets.map((preset) => [preset.id, preset.name]));

type ToolGroupId = "filter" | "adjust" | "color" | "effects" | "detail" | "crop";

type NumericAdjustmentKey =
  | "exposure"
  | "contrast"
  | "highlights"
  | "shadows"
  | "whites"
  | "blacks"
  | "temperature"
  | "tint"
  | "vibrance"
  | "saturation"
  | "clarity"
  | "dehaze"
  | "vignette"
  | "grain"
  | "sharpening"
  | "noiseReduction"
  | "colorNoiseReduction"
  | "rotate"
  | "horizontal"
  | "vertical"
  | "scale";

interface ToolDefinition {
  id: NumericAdjustmentKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

const TOOL_GROUPS: { id: ToolGroupId; label: string }[] = [
  { id: "filter", label: "滤镜" },
  { id: "adjust", label: "调整" },
  { id: "color", label: "颜色" },
  { id: "effects", label: "效果" },
  { id: "detail", label: "细节" },
  { id: "crop", label: "裁剪" },
];

const formatSigned = (value: number) => (value > 0 ? `+${value}` : `${value}`);

const TOOL_DEFINITIONS: Record<Exclude<ToolGroupId, "filter">, ToolDefinition[]> = {
  adjust: [
    { id: "exposure", label: "曝光", min: -100, max: 100, format: formatSigned },
    { id: "contrast", label: "对比度", min: -100, max: 100, format: formatSigned },
    { id: "highlights", label: "高光", min: -100, max: 100, format: formatSigned },
    { id: "shadows", label: "阴影", min: -100, max: 100, format: formatSigned },
    { id: "whites", label: "白色色阶", min: -100, max: 100, format: formatSigned },
    { id: "blacks", label: "黑色色阶", min: -100, max: 100, format: formatSigned },
  ],
  color: [
    { id: "temperature", label: "色温", min: -100, max: 100, format: formatSigned },
    { id: "tint", label: "色调", min: -100, max: 100, format: formatSigned },
    { id: "vibrance", label: "自然饱和度", min: -100, max: 100, format: formatSigned },
    { id: "saturation", label: "饱和度", min: -100, max: 100, format: formatSigned },
  ],
  effects: [
    { id: "clarity", label: "清晰度", min: -100, max: 100, format: formatSigned },
    { id: "dehaze", label: "去朦胧", min: -100, max: 100, format: formatSigned },
    { id: "vignette", label: "暗角", min: -100, max: 100, format: formatSigned },
    { id: "grain", label: "颗粒", min: 0, max: 100 },
  ],
  detail: [
    { id: "sharpening", label: "锐化", min: 0, max: 100 },
    { id: "noiseReduction", label: "降噪", min: 0, max: 100 },
    { id: "colorNoiseReduction", label: "色彩降噪", min: 0, max: 100 },
  ],
  crop: [
    {
      id: "rotate",
      label: "旋转",
      min: -45,
      max: 45,
      format: (value) => `${formatSigned(value)}°`,
    },
    { id: "horizontal", label: "水平", min: -100, max: 100, format: formatSigned },
    { id: "vertical", label: "垂直", min: -100, max: 100, format: formatSigned },
    { id: "scale", label: "缩放", min: 80, max: 120, format: (value) => `${value}%` },
  ],
};

const DEFAULT_TOOL_BY_GROUP: Record<Exclude<ToolGroupId, "filter">, NumericAdjustmentKey> = {
  adjust: "exposure",
  color: "temperature",
  effects: "vignette",
  detail: "sharpening",
  crop: "rotate",
};

const ASPECT_RATIOS: {
  value: EditingAdjustments["aspectRatio"];
  label: string;
  ratio: string;
}[] = [
  { value: "original", label: "原始", ratio: "4 / 3" },
  { value: "1:1", label: "1:1", ratio: "1 / 1" },
  { value: "3:2", label: "3:2", ratio: "3 / 2" },
  { value: "4:3", label: "4:3", ratio: "4 / 3" },
  { value: "16:9", label: "16:9", ratio: "16 / 9" },
];

const GRAIN_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="120" height="120" filter="url(#n)" opacity="0.4"/></svg>'
);
const GRAIN_DATA = `url("data:image/svg+xml;utf8,${GRAIN_SVG}")`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const cloneAdjustments = (value: EditingAdjustments) => {
  if (typeof structuredClone === "function") {
    return structuredClone(value) as EditingAdjustments;
  }
  return JSON.parse(JSON.stringify(value)) as EditingAdjustments;
};

const buildPreviewFilter = (adjustments: EditingAdjustments) => {
  const exposure = clamp(
    1 +
      adjustments.exposure / 100 +
      (adjustments.highlights + adjustments.whites) / 300 -
      (adjustments.shadows + adjustments.blacks) / 300,
    0.2,
    2.5
  );
  const contrast = clamp(
    1 + adjustments.contrast / 100 + adjustments.clarity / 200 + adjustments.dehaze / 250,
    0,
    2.5
  );
  const saturation = clamp(
    1 + (adjustments.saturation + adjustments.vibrance * 0.6) / 100,
    0,
    3
  );
  const hue = adjustments.temperature * 0.6 + adjustments.tint * 0.4;
  const sepia = clamp(Math.max(0, adjustments.temperature) / 200, 0, 0.35);
  const blur = adjustments.texture < 0 ? clamp(-adjustments.texture / 50, 0, 2) : 0;
  return `brightness(${exposure}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${hue}deg) sepia(${sepia}) blur(${blur}px)`;
};

const buildPreviewTransform = (adjustments: EditingAdjustments) => {
  const scale = clamp(adjustments.scale / 100, 0.7, 1.3);
  const translateX = clamp(adjustments.horizontal / 5, -20, 20);
  const translateY = clamp(adjustments.vertical / 5, -20, 20);
  return `translate(${translateX}%, ${translateY}%) rotate(${adjustments.rotate}deg) scale(${scale})`;
};

export function Editor() {
  const { assets, init, updateAsset } = useProjectStore();
  const { assetId } = useSearch({ from: "/editor" });
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [activeGroup, setActiveGroup] = useState<ToolGroupId>("adjust");
  const [toolSelection, setToolSelection] = useState<
    Record<ToolGroupId, NumericAdjustmentKey | null>
  >({
    filter: null,
    adjust: DEFAULT_TOOL_BY_GROUP.adjust,
    color: DEFAULT_TOOL_BY_GROUP.color,
    effects: DEFAULT_TOOL_BY_GROUP.effects,
    detail: DEFAULT_TOOL_BY_GROUP.detail,
    crop: DEFAULT_TOOL_BY_GROUP.crop,
  });
  const [copiedAdjustments, setCopiedAdjustments] =
    useState<EditingAdjustments | null>(null);
  const fallbackPresetId = presets[0]?.id ?? "";

  useEffect(() => {
    void init();
  }, [init]);

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

  const previewAspectRatio = useMemo(() => {
    if (!adjustments) {
      return "4 / 3";
    }
    return (
      ASPECT_RATIOS.find((ratio) => ratio.value === adjustments.aspectRatio)?.ratio ??
      "4 / 3"
    );
  }, [adjustments]);

  const previewStyle = useMemo(() => {
    if (!adjustments || showOriginal) {
      return undefined;
    }
    return {
      filter: buildPreviewFilter(adjustments),
      transform: buildPreviewTransform(adjustments),
    } as const;
  }, [adjustments, showOriginal]);

  const vignetteStyle = useMemo(() => {
    if (!adjustments) {
      return undefined;
    }
    const strength = adjustments.vignette / 100;
    const opacity = clamp(Math.abs(strength) * 0.65, 0, 0.65);
    if (opacity === 0) {
      return undefined;
    }
    const color = strength >= 0 ? "0,0,0" : "255,255,255";
    return {
      background: `radial-gradient(circle at center, rgba(${color},0) 45%, rgba(${color},${opacity}) 100%)`,
      mixBlendMode: strength >= 0 ? "multiply" : "screen",
      opacity,
    } as const;
  }, [adjustments]);

  const grainStyle = useMemo(() => {
    if (!adjustments) {
      return undefined;
    }
    const intensity = clamp(adjustments.grain / 100, 0, 1);
    const roughness = clamp(adjustments.grainRoughness / 100, 0, 1);
    const opacity = intensity * (0.2 + roughness * 0.25);
    if (opacity === 0) {
      return undefined;
    }
    const size = clamp(120 - adjustments.grainSize + roughness * 20, 20, 140);
    return {
      backgroundImage: GRAIN_DATA,
      backgroundSize: `${size}px ${size}px`,
      opacity,
      mixBlendMode: "soft-light",
    } as const;
  }, [adjustments]);

  const activeTool = useMemo(() => {
    if (activeGroup === "filter") {
      return null;
    }
    const tools = TOOL_DEFINITIONS[activeGroup];
    const current = toolSelection[activeGroup];
    return tools.find((tool) => tool.id === current) ?? tools[0];
  }, [activeGroup, toolSelection]);

  const activeToolValue = useMemo(() => {
    if (!adjustments || !activeTool) {
      return 0;
    }
    return adjustments[activeTool.id];
  }, [activeTool, adjustments]);

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

  const updateAdjustmentValue = (key: NumericAdjustmentKey, value: number) => {
    updateAdjustments({ [key]: value } as Partial<EditingAdjustments>);
  };

  const handleResetAll = () => {
    if (!selectedAsset) {
      return;
    }
    updateAsset(selectedAsset.id, { adjustments: createDefaultAdjustments() });
  };

  const handleResetTool = () => {
    if (!activeTool) {
      return;
    }
    updateAdjustments({
      [activeTool.id]: defaultAdjustments[activeTool.id],
    } as Partial<EditingAdjustments>);
  };

  const handleCopy = () => {
    if (!adjustments) {
      return;
    }
    setCopiedAdjustments(cloneAdjustments(adjustments));
  };

  const handlePaste = () => {
    if (!selectedAsset || !copiedAdjustments) {
      return;
    }
    updateAsset(selectedAsset.id, { adjustments: cloneAdjustments(copiedAdjustments) });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start">
      <div className="min-w-0 space-y-6">
        <Card className="min-w-0">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle>预览</CardTitle>
              {selectedAsset && (
                <p className="text-xs text-slate-400 line-clamp-1">
                  {selectedAsset.name}
                </p>
              )}
            </div>
            {selectedAsset && (
              <span className="text-xs text-slate-400">
                预设：{presetMap.get(selectedAsset.presetId ?? "") ?? "未设置"}
              </span>
            )}
          </CardHeader>
          <CardContent className="min-w-0">
            {selectedAsset ? (
              <div className="space-y-4">
                <div
                  className="relative w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
                  style={{ aspectRatio: previewAspectRatio }}
                >
                  <img
                    src={selectedAsset.objectUrl}
                    alt={selectedAsset.name}
                    className="h-full w-full object-cover transition duration-300 ease-out"
                    style={previewStyle}
                  />
                  {!showOriginal && vignetteStyle && (
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={vignetteStyle}
                    />
                  )}
                  {!showOriginal && grainStyle && (
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={grainStyle}
                    />
                  )}
                  {showOriginal && (
                    <span className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-3 py-1 text-xs text-slate-200">
                      原图
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={showOriginal ? "default" : "secondary"}
                    onClick={() => setShowOriginal((prev) => !prev)}
                  >
                    对比原图
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleResetAll}>
                    重置全部
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleCopy}>
                    复制设置
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handlePaste}
                    disabled={!copiedAdjustments}
                  >
                    粘贴设置
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">请选择一张照片进行编辑。</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 space-y-6">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>编辑工具</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 space-y-4">
            {selectedAsset && adjustments ? (
              <>
                <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-2 md:pb-1">
                  {TOOL_GROUPS.map((group) => (
                    <Button
                      key={group.id}
                      size="sm"
                      variant={activeGroup === group.id ? "default" : "secondary"}
                      className="shrink-0"
                      onClick={() => setActiveGroup(group.id)}
                    >
                      {group.label}
                    </Button>
                  ))}
                </div>

                {activeGroup === "filter" ? (
                  <div className="space-y-3">
                    <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-2 md:pb-1">
                      {presets.map((preset) => (
                        <Button
                          key={preset.id}
                          size="sm"
                          variant={
                            (selectedAsset.presetId ?? fallbackPresetId) === preset.id
                              ? "default"
                              : "secondary"
                          }
                          className="shrink-0"
                          onClick={() =>
                            updateAsset(selectedAsset.id, { presetId: preset.id })
                          }
                        >
                          {preset.name}
                        </Button>
                      ))}
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="text-slate-300">强度</span>
                        <span>{selectedAsset.intensity ?? 0}</span>
                      </div>
                      <Slider
                        value={[selectedAsset.intensity ?? 0]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={(value) =>
                          updateAsset(selectedAsset.id, { intensity: value[0] ?? 0 })
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-2 md:pb-1">
                      {TOOL_DEFINITIONS[activeGroup].map((tool) => (
                        <Button
                          key={tool.id}
                          size="sm"
                          variant={activeTool?.id === tool.id ? "default" : "secondary"}
                          className="shrink-0"
                          onClick={() =>
                            setToolSelection((prev) => ({
                              ...prev,
                              [activeGroup]: tool.id,
                            }))
                          }
                        >
                          {tool.label}
                        </Button>
                      ))}
                    </div>

                    {activeGroup === "crop" && (
                      <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-2 md:pb-1">
                        {ASPECT_RATIOS.map((ratio) => (
                          <Button
                            key={ratio.value}
                            size="sm"
                            variant={
                              adjustments.aspectRatio === ratio.value
                                ? "default"
                                : "secondary"
                            }
                            className="shrink-0"
                            onClick={() =>
                              updateAdjustments({ aspectRatio: ratio.value })
                            }
                          >
                            {ratio.label}
                          </Button>
                        ))}
                      </div>
                    )}

                    {activeTool && (
                      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span className="text-slate-300">{activeTool.label}</span>
                          <span>
                            {activeTool.format
                              ? activeTool.format(activeToolValue)
                              : activeToolValue}
                          </span>
                        </div>
                        <Slider
                          value={[activeToolValue]}
                          min={activeTool.min}
                          max={activeTool.max}
                          step={activeTool.step ?? 1}
                          onValueChange={(value) =>
                            updateAdjustmentValue(activeTool.id, value[0] ?? 0)
                          }
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleResetTool}
                        disabled={!activeTool}
                      >
                        重置当前
                      </Button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">请选择一张照片以查看参数。</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
