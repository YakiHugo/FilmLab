import { memo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { EditingAdjustments, FilmModuleId, FilmNumericParamKey } from "@/types";
import { EditorColorGradingPanel } from "./EditorColorGradingPanel";
import { EditorCropSection } from "./EditorCropSection";
import { EditorPointCurve } from "./EditorPointCurve";
import { EditorPresetCard } from "./EditorPresetCard";
import { EditorSection } from "./EditorSection";
import { EditorSliderRow } from "./EditorSliderRow";
import { AiEditPanel } from "./ai/AiEditPanel";
import {
  AI_FEATURES,
  BASIC_COLOR_SLIDERS,
  BASIC_LIGHT_SLIDERS,
  CURVE_CHANNELS,
  CURVE_SLIDERS,
  DETAIL_SLIDERS,
  EFFECTS_SLIDERS,
  HSL_COLORS,
  WHITE_BALANCE_PRESETS,
  EDITOR_PANEL_SECTION_MAP,
  type EditorToolPanelId,
  type SectionId,
  type SliderDefinition,
} from "./editorPanelConfig";
import type { NumericAdjustmentKey } from "./types";
import { useEditorState } from "./useEditorState";

interface FilmParamDefinition<TId extends FilmModuleId> {
  key: FilmNumericParamKey<TId>;
  label: string;
  min: number;
  max: number;
  step: number;
}

type FilmParamDefinitions = {
  [TId in FilmModuleId]: FilmParamDefinition<TId>[];
};

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();

const FILM_MODULE_LABELS: Record<FilmModuleId, string> = {
  colorScience: "色彩科学",
  tone: "影调",
  scan: "扫描",
  grain: "颗粒",
  defects: "瑕疵",
};

const FILM_PARAM_DEFINITIONS: FilmParamDefinitions = {
  colorScience: [
    { key: "lutStrength", label: "LUT 强度", min: 0, max: 1, step: 0.01 },
    { key: "temperatureShift", label: "色温偏移", min: -100, max: 100, step: 1 },
    { key: "tintShift", label: "色调偏移", min: -100, max: 100, step: 1 },
  ],
  tone: [
    { key: "exposure", label: "曝光", min: -100, max: 100, step: 1 },
    { key: "contrast", label: "对比度", min: -100, max: 100, step: 1 },
    { key: "highlights", label: "高光", min: -100, max: 100, step: 1 },
    { key: "shadows", label: "阴影", min: -100, max: 100, step: 1 },
    { key: "whites", label: "白色", min: -100, max: 100, step: 1 },
    { key: "blacks", label: "黑色", min: -100, max: 100, step: 1 },
    { key: "curveLights", label: "曲线亮部", min: -100, max: 100, step: 1 },
    { key: "curveDarks", label: "曲线暗部", min: -100, max: 100, step: 1 },
    { key: "curveHighlights", label: "曲线高光", min: -100, max: 100, step: 1 },
    { key: "curveShadows", label: "曲线阴影", min: -100, max: 100, step: 1 },
  ],
  scan: [
    { key: "halationThreshold", label: "光晕阈值", min: 0.5, max: 1, step: 0.01 },
    { key: "halationAmount", label: "光晕强度", min: 0, max: 1, step: 0.01 },
    { key: "bloomThreshold", label: "泛光阈值", min: 0.4, max: 1, step: 0.01 },
    { key: "bloomAmount", label: "泛光强度", min: 0, max: 1, step: 0.01 },
    { key: "vignetteAmount", label: "扫描暗角", min: -1, max: 1, step: 0.01 },
    { key: "scanWarmth", label: "扫描暖度", min: -100, max: 100, step: 1 },
  ],
  grain: [
    { key: "amount", label: "数量", min: 0, max: 1, step: 0.01 },
    { key: "size", label: "大小", min: 0, max: 1, step: 0.01 },
    { key: "roughness", label: "粗糙度", min: 0, max: 1, step: 0.01 },
    { key: "color", label: "色彩", min: 0, max: 1, step: 0.01 },
    { key: "shadowBoost", label: "阴影增强", min: 0, max: 1, step: 0.01 },
  ],
  defects: [
    { key: "leakProbability", label: "漏光概率", min: 0, max: 1, step: 0.01 },
    { key: "leakStrength", label: "漏光强度", min: 0, max: 1, step: 0.01 },
    { key: "dustAmount", label: "灰尘", min: 0, max: 1, step: 0.01 },
    { key: "scratchAmount", label: "划痕", min: 0, max: 1, step: 0.01 },
  ],
};

const renderSliderRows = (
  adjustments: EditingAdjustments,
  sliders: SliderDefinition[],
  onPreviewAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void,
  onCommitAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void
) =>
  sliders.map((slider) => (
    <EditorSliderRow
      key={slider.key}
      label={slider.label}
      value={adjustments[slider.key] as number}
      defaultValue={DEFAULT_ADJUSTMENTS[slider.key] as number}
      min={slider.min}
      max={slider.max}
      step={slider.step}
      format={slider.format}
      onChange={(value) => onPreviewAdjustmentValue(slider.key, value)}
      onCommit={(value) => onCommitAdjustmentValue(slider.key, value)}
      onReset={() => onCommitAdjustmentValue(slider.key, DEFAULT_ADJUSTMENTS[slider.key] as number)}
    />
  ));

const formatFilmValue = (value: number, step: number) => {
  if (step < 1) {
    return value.toFixed(2);
  }
  return `${Math.round(value)}`;
};

const WHITE_BALANCE_CUSTOM_KEY = "__custom__";

const resolveWhiteBalancePresetId = (temperature: number, tint: number) => {
  const preset = WHITE_BALANCE_PRESETS.find(
    (item) => item.temperature === temperature && item.tint === tint
  );
  return preset?.id ?? WHITE_BALANCE_CUSTOM_KEY;
};

const TIMESTAMP_POSITION_OPTIONS: Array<{
  value: EditingAdjustments["timestampPosition"];
  label: string;
}> = [
  { value: "bottom-right", label: "右下" },
  { value: "bottom-left", label: "左下" },
  { value: "top-right", label: "右上" },
  { value: "top-left", label: "左上" },
];

interface EditorInspectorContentProps {
  panelId: EditorToolPanelId;
}

export const EditorInspectorContent = memo(function EditorInspectorContent({
  panelId,
}: EditorInspectorContentProps) {
  const {
    adjustments,
    previewFilmProfile: filmProfile,
    activeHslColor,
    pointColorPicking,
    lastPointColorSample,
    curveChannel,
    openSections,
    setActiveHslColor,
    setCurveChannel,
    toggleSection,
    updateAdjustments,
    previewAdjustmentValue,
    updateAdjustmentValue,
    previewPointCurve,
    commitPointCurve,
    previewHslValue,
    updateHslValue,
    previewColorGradingZone,
    updateColorGradingZone,
    previewColorGradingValue,
    updateColorGradingValue,
    resetColorGrading,
    startPointColorPick,
    cancelPointColorPick,
    toggleFlip,
    handleSetFilmModuleAmount,
    handleToggleFilmModule,
    handleSetFilmModuleParam,
    handleSetFilmModuleRgbMix,
    handleResetFilmOverrides,
    selectedAsset,
    handleSelectFilmProfile,
  } = useEditorState();

  const [filmResetOpen, setFilmResetOpen] = useState(false);

  const whiteBalancePresetId = adjustments
    ? resolveWhiteBalancePresetId(adjustments.temperature, adjustments.tint)
    : WHITE_BALANCE_CUSTOM_KEY;

  const sections = EDITOR_PANEL_SECTION_MAP[panelId] ?? [];
  const shouldRenderPreset = sections.includes("preset");
  const requiresAdjustments = sections.some(
    (section) =>
      section !== "preset" &&
      section !== "ai" &&
      section !== "mask" &&
      section !== "remove" &&
      section !== "export" &&
      section !== "local"
  );

  const handleWhiteBalancePresetChange = (presetId: string) => {
    if (presetId === WHITE_BALANCE_CUSTOM_KEY) {
      return;
    }
    const preset = WHITE_BALANCE_PRESETS.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    updateAdjustments({
      temperature: preset.temperature,
      tint: preset.tint,
    });
  };

  const renderMissingAssetState = () => (
    <Card>
      <CardContent className="p-4 text-sm text-slate-400">
        请先在工作区中选择一张图片，然后继续编辑。
      </CardContent>
    </Card>
  );

  const renderFilmControls = () => {
    if (!filmProfile) {
      return <p className="text-xs text-slate-500">暂无胶片配置文件。</p>;
    }

    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setFilmResetOpen(true)}
          >
            重置胶片覆盖
          </Button>
        </div>
        {filmProfile.modules.map((module) => (
          <div key={module.id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-slate-100">
                  {FILM_MODULE_LABELS[module.id]}
                </p>
                <Badge size="control" className="border-white/10 bg-white/5 text-xs text-slate-300">
                  {module.enabled ? "开" : "关"}
                </Badge>
              </div>
              <Button
                size="sm"
                variant={module.enabled ? "default" : "secondary"}
                onClick={() => handleToggleFilmModule(module.id)}
              >
                {module.enabled ? "禁用" : "启用"}
              </Button>
            </div>

            <EditorSliderRow
              label="模块强度"
              value={module.amount}
              min={0}
              max={100}
              step={1}
              disabled={!module.enabled}
              onChange={(value) => handleSetFilmModuleAmount(module.id, value, "live")}
              onCommit={(value) => handleSetFilmModuleAmount(module.id, value, "commit")}
            />

            {FILM_PARAM_DEFINITIONS[module.id].map((param) => {
              const rawValue = (module.params as unknown as Record<string, unknown>)[param.key];
              if (typeof rawValue !== "number") {
                return null;
              }
              return (
                <EditorSliderRow
                  key={`${module.id}-${param.key}`}
                  label={param.label}
                  value={rawValue}
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  disabled={!module.enabled}
                  format={(value) => formatFilmValue(value, param.step)}
                  onChange={(value) =>
                    handleSetFilmModuleParam(module.id, param.key, value, "live")
                  }
                  onCommit={(value) =>
                    handleSetFilmModuleParam(module.id, param.key, value, "commit")
                  }
                />
              );
            })}

            {module.id === "colorScience" &&
              Array.isArray(module.params.rgbMix) &&
              module.params.rgbMix.length === 3 && (
                <>
                  <EditorSliderRow
                    label="R Mix"
                    value={module.params.rgbMix[0]}
                    min={0.5}
                    max={1.5}
                    step={0.01}
                    disabled={!module.enabled}
                    format={(value) => value.toFixed(2)}
                    onChange={(value) => handleSetFilmModuleRgbMix(module.id, 0, value, "live")}
                    onCommit={(value) => handleSetFilmModuleRgbMix(module.id, 0, value, "commit")}
                  />
                  <EditorSliderRow
                    label="G Mix"
                    value={module.params.rgbMix[1]}
                    min={0.5}
                    max={1.5}
                    step={0.01}
                    disabled={!module.enabled}
                    format={(value) => value.toFixed(2)}
                    onChange={(value) => handleSetFilmModuleRgbMix(module.id, 1, value, "live")}
                    onCommit={(value) => handleSetFilmModuleRgbMix(module.id, 1, value, "commit")}
                  />
                  <EditorSliderRow
                    label="B Mix"
                    value={module.params.rgbMix[2]}
                    min={0.5}
                    max={1.5}
                    step={0.01}
                    disabled={!module.enabled}
                    format={(value) => value.toFixed(2)}
                    onChange={(value) => handleSetFilmModuleRgbMix(module.id, 2, value, "live")}
                    onCommit={(value) => handleSetFilmModuleRgbMix(module.id, 2, value, "commit")}
                  />
                </>
              )}
          </div>
        ))}
      </div>
    );
  };

  const renderAdvancedControls = () => {
    if (!adjustments) {
      return null;
    }

    return (
      <div className="space-y-4">
        <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/55 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">曲线</p>
          <div className="flex flex-wrap gap-2">
            {CURVE_CHANNELS.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={curveChannel === item.id ? "default" : "secondary"}
                onClick={() => setCurveChannel(item.id)}
                disabled={!item.enabled}
                aria-pressed={curveChannel === item.id}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <EditorPointCurve
            points={adjustments.pointCurve.rgb}
            onPreview={previewPointCurve}
            onCommit={commitPointCurve}
          />
          {renderSliderRows(
            adjustments,
            CURVE_SLIDERS,
            previewAdjustmentValue,
            updateAdjustmentValue
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/55 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">HSL</p>
          <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-slate-200">点取色</p>
                <p className="text-[11px] text-slate-500">
                  {pointColorPicking ? "在预览中点击取色" : "从照片中取色并跳转到最近通道"}
                </p>
              </div>
              <Button
                size="sm"
                variant={pointColorPicking ? "default" : "secondary"}
                onClick={() => {
                  if (pointColorPicking) {
                    cancelPointColorPick();
                    return;
                  }
                  startPointColorPick();
                }}
              >
                {pointColorPicking ? "取消" : "取色"}
              </Button>
            </div>
            {lastPointColorSample && (
              <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                <span
                  className="h-4 w-4 rounded-full border border-white/20"
                  style={{ backgroundColor: lastPointColorSample.hex }}
                />
                <span>{lastPointColorSample.hex.toUpperCase()}</span>
                <span>-&gt; {lastPointColorSample.mappedColor}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {HSL_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                onClick={() => setActiveHslColor(color.id)}
                aria-pressed={activeHslColor === color.id}
                className={cn(
                  "flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs",
                  activeHslColor === color.id ? "bg-white/10 text-white" : "text-slate-300"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", color.swatch)} />
                {color.label}
              </button>
            ))}
          </div>

          <EditorSliderRow
            label="色相"
            value={adjustments.hsl[activeHslColor].hue}
            defaultValue={0}
            min={-100}
            max={100}
            format={(value) => (value > 0 ? `+${value}` : `${value}`)}
            onChange={(value) => previewHslValue(activeHslColor, "hue", value)}
            onCommit={(value) => updateHslValue(activeHslColor, "hue", value)}
            onReset={() => updateHslValue(activeHslColor, "hue", 0)}
          />
          <EditorSliderRow
            label="饱和度"
            value={adjustments.hsl[activeHslColor].saturation}
            defaultValue={0}
            min={-100}
            max={100}
            format={(value) => (value > 0 ? `+${value}` : `${value}`)}
            onChange={(value) => previewHslValue(activeHslColor, "saturation", value)}
            onCommit={(value) => updateHslValue(activeHslColor, "saturation", value)}
            onReset={() => updateHslValue(activeHslColor, "saturation", 0)}
          />
          <EditorSliderRow
            label="明度"
            value={adjustments.hsl[activeHslColor].luminance}
            defaultValue={0}
            min={-100}
            max={100}
            format={(value) => (value > 0 ? `+${value}` : `${value}`)}
            onChange={(value) => previewHslValue(activeHslColor, "luminance", value)}
            onCommit={(value) => updateHslValue(activeHslColor, "luminance", value)}
            onReset={() => updateHslValue(activeHslColor, "luminance", 0)}
          />
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/55 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">调色</p>
          <EditorColorGradingPanel
            colorGrading={adjustments.colorGrading}
            onPreviewZone={previewColorGradingZone}
            onCommitZone={updateColorGradingZone}
            onPreviewValue={previewColorGradingValue}
            onCommitValue={updateColorGradingValue}
            onReset={resetColorGrading}
          />
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/55 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">光学</p>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-950 accent-sky-400"
              checked={adjustments.opticsCA}
              onChange={(event) => updateAdjustments({ opticsCA: event.currentTarget.checked })}
            />
            <span className="space-y-0.5">
              <span className="block">去色差</span>
              <span className="block text-[11px] text-slate-500">
                减少高对比度边缘的紫/绿色边。
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-950 accent-sky-400"
              checked={adjustments.opticsProfile}
              onChange={(event) =>
                updateAdjustments({ opticsProfile: event.currentTarget.checked })
              }
            />
            <span className="space-y-0.5">
              <span className="block">启用镜头配置</span>
              <span className="block text-[11px] text-slate-500">
                保留镜头校正意图，用于渲染器/导出对齐。
              </span>
            </span>
          </label>
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/55 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">胶片模块</p>
          {renderFilmControls()}
        </div>
      </div>
    );
  };

  const renderSection = (sectionId: SectionId) => {
    if (!adjustments) {
      if (sectionId === "mask") {
        return (
          <EditorSection
            title="蒙版"
            hint="即将推出"
            isOpen={openSections.mask}
            onToggle={() => toggleSection("mask")}
          >
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-300">
              蒙版工具尚未开放。
            </div>
          </EditorSection>
        );
      }
      if (sectionId === "remove") {
        return (
          <EditorSection
            title="移除"
            hint="即将推出"
            isOpen={openSections.remove}
            onToggle={() => toggleSection("remove")}
          >
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-300">
              修复/移除工具尚未开放。
            </div>
          </EditorSection>
        );
      }
      if (sectionId === "ai") {
        return (
          <EditorSection
            title="AI"
            hint="占位"
            isOpen={openSections.ai}
            onToggle={() => toggleSection("ai")}
          >
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {AI_FEATURES.map((label) => (
                  <Badge key={label} className="border-white/10 bg-white/5 text-slate-200">
                    {label}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-slate-400">AI 智能调整即将推出。</p>
            </div>
          </EditorSection>
        );
      }
      return null;
    }

    switch (sectionId) {
      case "basic":
        return (
          <EditorSection
            title="基础"
            hint="光影 / 白平衡 / 色调"
            isOpen={openSections.basic}
            onToggle={() => toggleSection("basic")}
          >
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">光影</p>
              {renderSliderRows(
                adjustments,
                BASIC_LIGHT_SLIDERS,
                previewAdjustmentValue,
                updateAdjustmentValue
              )}

              <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">白平衡</p>
              <div className="space-y-2">
                <p className="text-xs text-slate-300">预设</p>
                <Select value={whiteBalancePresetId} onValueChange={handleWhiteBalancePresetChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="选择白平衡" />
                  </SelectTrigger>
                  <SelectContent>
                    {WHITE_BALANCE_PRESETS.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label}
                      </SelectItem>
                    ))}
                    {whiteBalancePresetId === WHITE_BALANCE_CUSTOM_KEY && (
                      <SelectItem value={WHITE_BALANCE_CUSTOM_KEY}>自定义</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">色彩</p>
              {renderSliderRows(
                adjustments,
                BASIC_COLOR_SLIDERS,
                previewAdjustmentValue,
                updateAdjustmentValue
              )}
            </div>
          </EditorSection>
        );

      case "effects":
        return (
          <EditorSection
            title="效果"
            hint="纹理 / 清晰度 / 颗粒"
            isOpen={openSections.effects}
            onToggle={() => toggleSection("effects")}
          >
            {renderSliderRows(
              adjustments,
              EFFECTS_SLIDERS,
              previewAdjustmentValue,
              updateAdjustmentValue
            )}
          </EditorSection>
        );

      case "detail":
        return (
          <EditorSection
            title="细节"
            hint="锐化 / 蒙版 / 降噪"
            isOpen={openSections.detail}
            onToggle={() => toggleSection("detail")}
          >
            {renderSliderRows(
              adjustments,
              DETAIL_SLIDERS,
              previewAdjustmentValue,
              updateAdjustmentValue
            )}
          </EditorSection>
        );

      case "timestamp":
        return (
          <EditorSection
            title="时间戳"
            hint="胶片日期印记"
            isOpen={openSections.timestamp}
            onToggle={() => toggleSection("timestamp")}
          >
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
              <span>启用时间戳</span>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/20 bg-slate-950 accent-sky-400"
                checked={adjustments.timestampEnabled}
                onChange={(event) =>
                  updateAdjustments({ timestampEnabled: event.currentTarget.checked })
                }
              />
            </label>

            <div className="space-y-2">
              <p className="text-xs text-slate-300">位置</p>
              <Select
                value={adjustments.timestampPosition}
                onValueChange={(value: EditingAdjustments["timestampPosition"]) =>
                  updateAdjustments({ timestampPosition: value })
                }
                disabled={!adjustments.timestampEnabled}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="选择位置" />
                </SelectTrigger>
                <SelectContent>
                  {TIMESTAMP_POSITION_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <EditorSliderRow
              label="文字大小"
              value={adjustments.timestampSize}
              defaultValue={DEFAULT_ADJUSTMENTS.timestampSize}
              min={12}
              max={48}
              step={1}
              disabled={!adjustments.timestampEnabled}
              onChange={(value) => previewAdjustmentValue("timestampSize", value)}
              onCommit={(value) => updateAdjustmentValue("timestampSize", value)}
              onReset={() =>
                updateAdjustmentValue("timestampSize", DEFAULT_ADJUSTMENTS.timestampSize)
              }
            />

            <EditorSliderRow
              label="不透明度"
              value={adjustments.timestampOpacity}
              defaultValue={DEFAULT_ADJUSTMENTS.timestampOpacity}
              min={0}
              max={100}
              step={1}
              disabled={!adjustments.timestampEnabled}
              onChange={(value) => previewAdjustmentValue("timestampOpacity", value)}
              onCommit={(value) => updateAdjustmentValue("timestampOpacity", value)}
              onReset={() =>
                updateAdjustmentValue("timestampOpacity", DEFAULT_ADJUSTMENTS.timestampOpacity)
              }
            />
          </EditorSection>
        );

      case "advanced":
        return (
          <EditorSection
            title="高级"
            hint="曲线 / HSL / 调色 / 光学 / 胶片"
            isOpen={openSections.advanced}
            onToggle={() => toggleSection("advanced")}
          >
            {renderAdvancedControls()}
          </EditorSection>
        );

      case "crop":
        return (
          <EditorCropSection
            adjustments={adjustments}
            isOpen={openSections.crop}
            onToggle={() => toggleSection("crop")}
            onUpdateAdjustments={updateAdjustments}
            onPreviewAdjustmentValue={previewAdjustmentValue}
            onCommitAdjustmentValue={updateAdjustmentValue}
            onToggleFlip={toggleFlip}
          />
        );

      case "mask":
        return (
          <EditorSection
            title="蒙版"
            hint="即将推出"
            isOpen={openSections.mask}
            onToggle={() => toggleSection("mask")}
          >
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-300">
              蒙版工具尚未开放。
            </div>
          </EditorSection>
        );

      case "remove":
        return (
          <EditorSection
            title="移除"
            hint="即将推出"
            isOpen={openSections.remove}
            onToggle={() => toggleSection("remove")}
          >
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-300">
              修复/移除工具尚未开放。
            </div>
          </EditorSection>
        );

      case "ai":
        return (
          <AiEditPanel
            selectedAsset={selectedAsset ?? null}
            adjustments={adjustments ?? null}
            onUpdateAdjustments={updateAdjustments}
            onSelectFilmProfile={handleSelectFilmProfile}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      {!adjustments && requiresAdjustments && (
        <>
          {shouldRenderPreset && <EditorPresetCard />}
          {renderMissingAssetState()}
        </>
      )}
      {adjustments || !requiresAdjustments ? (
        <>
          {shouldRenderPreset && <EditorPresetCard />}
          {sections
            .filter((section) => section !== "preset")
            .map((section) => (
              <div key={section}>{renderSection(section)}</div>
            ))}
        </>
      ) : null}

      <ConfirmDialog
        open={filmResetOpen}
        onOpenChange={setFilmResetOpen}
        title="重置胶片覆盖"
        description="确定重置所有胶片模块覆盖？这将恢复预设默认值。"
        onConfirm={handleResetFilmOverrides}
      />
    </div>
  );
});

export const EditorAdjustmentPanel = memo(function EditorAdjustmentPanel() {
  const { activeToolPanelId } = useEditorState();
  return <EditorInspectorContent panelId={activeToolPanelId} />;
});
