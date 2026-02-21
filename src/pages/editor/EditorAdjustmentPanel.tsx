import { memo } from "react";
import {
  FlipHorizontal2,
  FlipVertical2,
  Lock,
  RotateCcw,
  RotateCw,
  Unlock,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import type {
  EditingAdjustments,
  FilmModuleId,
  FilmNumericParamKey,
} from "@/types";
import { EditorColorGradingPanel } from "./EditorColorGradingPanel";
import { EditorPointCurve } from "./EditorPointCurve";
import { EditorPresetCard } from "./EditorPresetCard";
import { EditorSection } from "./EditorSection";
import { EditorSliderRow } from "./EditorSliderRow";
import {
  AI_FEATURES,
  BASIC_COLOR_SLIDERS,
  BASIC_LIGHT_SLIDERS,
  CROP_SLIDERS,
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
  colorScience: "Color Science",
  tone: "Tone",
  scan: "Scan",
  grain: "Grain",
  defects: "Defects",
};

const FILM_PARAM_DEFINITIONS: FilmParamDefinitions = {
  colorScience: [
    { key: "lutStrength", label: "LUT Strength", min: 0, max: 1, step: 0.01 },
    { key: "temperatureShift", label: "Temp Shift", min: -100, max: 100, step: 1 },
    { key: "tintShift", label: "Tint Shift", min: -100, max: 100, step: 1 },
  ],
  tone: [
    { key: "exposure", label: "Exposure", min: -100, max: 100, step: 1 },
    { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1 },
    { key: "highlights", label: "Highlights", min: -100, max: 100, step: 1 },
    { key: "shadows", label: "Shadows", min: -100, max: 100, step: 1 },
    { key: "whites", label: "Whites", min: -100, max: 100, step: 1 },
    { key: "blacks", label: "Blacks", min: -100, max: 100, step: 1 },
    { key: "curveLights", label: "Curve Lights", min: -100, max: 100, step: 1 },
    { key: "curveDarks", label: "Curve Darks", min: -100, max: 100, step: 1 },
    { key: "curveHighlights", label: "Curve Highlights", min: -100, max: 100, step: 1 },
    { key: "curveShadows", label: "Curve Shadows", min: -100, max: 100, step: 1 },
  ],
  scan: [
    { key: "halationThreshold", label: "Halation Threshold", min: 0.5, max: 1, step: 0.01 },
    { key: "halationAmount", label: "Halation Amount", min: 0, max: 1, step: 0.01 },
    { key: "bloomThreshold", label: "Bloom Threshold", min: 0.4, max: 1, step: 0.01 },
    { key: "bloomAmount", label: "Bloom Amount", min: 0, max: 1, step: 0.01 },
    { key: "vignetteAmount", label: "Scan Vignette", min: -1, max: 1, step: 0.01 },
    { key: "scanWarmth", label: "Scan Warmth", min: -100, max: 100, step: 1 },
  ],
  grain: [
    { key: "amount", label: "Amount", min: 0, max: 1, step: 0.01 },
    { key: "size", label: "Size", min: 0, max: 1, step: 0.01 },
    { key: "roughness", label: "Roughness", min: 0, max: 1, step: 0.01 },
    { key: "color", label: "Color", min: 0, max: 1, step: 0.01 },
    { key: "shadowBoost", label: "Shadow Boost", min: 0, max: 1, step: 0.01 },
  ],
  defects: [
    { key: "leakProbability", label: "Leak Probability", min: 0, max: 1, step: 0.01 },
    { key: "leakStrength", label: "Leak Strength", min: 0, max: 1, step: 0.01 },
    { key: "dustAmount", label: "Dust", min: 0, max: 1, step: 0.01 },
    { key: "scratchAmount", label: "Scratch", min: 0, max: 1, step: 0.01 },
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
      onReset={() =>
        onCommitAdjustmentValue(slider.key, DEFAULT_ADJUSTMENTS[slider.key] as number)
      }
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

interface CropRatioOption {
  id: string;
  label: string;
  aspectRatio?: EditingAdjustments["aspectRatio"];
  customRatio?: number;
}

const CROP_RATIO_OPTIONS: CropRatioOption[] = [
  { id: "original", label: "原始比例", aspectRatio: "original" },
  { id: "free", label: "自由比例", aspectRatio: "free" },
  { id: "1:1", label: "1:1", aspectRatio: "1:1", customRatio: 1 },
  { id: "2:1", label: "2:1", customRatio: 2 },
  { id: "3:2", label: "3:2", aspectRatio: "3:2", customRatio: 1.5 },
  { id: "4:3", label: "4:3", customRatio: 4 / 3 },
  { id: "5:4", label: "5:4", aspectRatio: "5:4", customRatio: 5 / 4 },
  { id: "7:5", label: "7:5", customRatio: 7 / 5 },
  { id: "11:8.5", label: "11:8.5", customRatio: 11 / 8.5 },
  { id: "16:9", label: "16:9", aspectRatio: "16:9", customRatio: 16 / 9 },
  { id: "16:10", label: "16:10", customRatio: 16 / 10 },
  { id: "4:5", label: "4:5", aspectRatio: "4:5", customRatio: 4 / 5 },
  { id: "9:16", label: "9:16", aspectRatio: "9:16", customRatio: 9 / 16 },
];

const TIMESTAMP_POSITION_OPTIONS: Array<{
  value: EditingAdjustments["timestampPosition"];
  label: string;
}> = [
  { value: "bottom-right", label: "Bottom Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "top-right", label: "Top Right" },
  { value: "top-left", label: "Top Left" },
];

const isCloseRatio = (left: number, right: number) => Math.abs(left - right) <= 0.02;
const clampCropRatio = (value: number) => Math.min(2.5, Math.max(0.5, value));
const normalizeRotateAngle = (value: number) => {
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
  if (Math.abs(wrapped) < 0.0001) {
    return 0;
  }
  return Number(wrapped.toFixed(2));
};

const resolveCropRatioOptionId = (adjustments: EditingAdjustments) => {
  if (adjustments.aspectRatio === "original") {
    return "original";
  }
  if (adjustments.aspectRatio === "free") {
    const match = CROP_RATIO_OPTIONS.find((item) => {
      if (typeof item.customRatio !== "number") {
        return false;
      }
      return (
        isCloseRatio(item.customRatio, adjustments.customAspectRatio) ||
        isCloseRatio(1 / item.customRatio, adjustments.customAspectRatio)
      );
    });
    return match?.id ?? "free";
  }
  const byAspect = CROP_RATIO_OPTIONS.find(
    (item) => item.aspectRatio === adjustments.aspectRatio
  );
  return byAspect?.id ?? "free";
};

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
  } = useEditorState();

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
        Select an image in Workspace first, then continue editing.
      </CardContent>
    </Card>
  );

  const renderFilmControls = () => {
    if (!filmProfile) {
      return <p className="text-xs text-slate-500">No film profile available.</p>;
    }

    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (
                window.confirm(
                  "Reset all film module overrides? This restores the preset defaults."
                )
              ) {
                handleResetFilmOverrides();
              }
            }}
          >
            Reset Film Overrides
          </Button>
        </div>
        {filmProfile.modules.map((module) => (
          <div
            key={module.id}
            className="rounded-2xl border border-white/10 bg-slate-950/60 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-slate-100">
                  {FILM_MODULE_LABELS[module.id]}
                </p>
                <Badge
                  size="control"
                  className="border-white/10 bg-white/5 text-xs text-slate-300"
                >
                  {module.enabled ? "On" : "Off"}
                </Badge>
              </div>
              <Button
                size="sm"
                variant={module.enabled ? "default" : "secondary"}
                onClick={() => handleToggleFilmModule(module.id)}
              >
                {module.enabled ? "Disable" : "Enable"}
              </Button>
            </div>

            <EditorSliderRow
              label="Module Amount"
              value={module.amount}
              min={0}
              max={100}
              step={1}
              disabled={!module.enabled}
              onChange={(value) => handleSetFilmModuleAmount(module.id, value, "live")}
              onCommit={(value) => handleSetFilmModuleAmount(module.id, value, "commit")}
            />

            {FILM_PARAM_DEFINITIONS[module.id].map((param) => {
              const rawValue = (module.params as unknown as Record<string, unknown>)[
                param.key
              ];
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
                    onChange={(value) =>
                      handleSetFilmModuleRgbMix(module.id, 0, value, "live")
                    }
                    onCommit={(value) =>
                      handleSetFilmModuleRgbMix(module.id, 0, value, "commit")
                    }
                  />
                  <EditorSliderRow
                    label="G Mix"
                    value={module.params.rgbMix[1]}
                    min={0.5}
                    max={1.5}
                    step={0.01}
                    disabled={!module.enabled}
                    format={(value) => value.toFixed(2)}
                    onChange={(value) =>
                      handleSetFilmModuleRgbMix(module.id, 1, value, "live")
                    }
                    onCommit={(value) =>
                      handleSetFilmModuleRgbMix(module.id, 1, value, "commit")
                    }
                  />
                  <EditorSliderRow
                    label="B Mix"
                    value={module.params.rgbMix[2]}
                    min={0.5}
                    max={1.5}
                    step={0.01}
                    disabled={!module.enabled}
                    format={(value) => value.toFixed(2)}
                    onChange={(value) =>
                      handleSetFilmModuleRgbMix(module.id, 2, value, "live")
                    }
                    onCommit={(value) =>
                      handleSetFilmModuleRgbMix(module.id, 2, value, "commit")
                    }
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
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Curve</p>
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
            values={{
              curveHighlights: adjustments.curveHighlights,
              curveLights: adjustments.curveLights,
              curveDarks: adjustments.curveDarks,
              curveShadows: adjustments.curveShadows,
            }}
            onPreview={(key, value) => previewAdjustmentValue(key, value)}
            onCommit={(key, value) => updateAdjustmentValue(key, value)}
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
                <p className="text-slate-200">Point Color</p>
                <p className="text-[11px] text-slate-500">
                  {pointColorPicking
                    ? "Click a color in preview"
                    : "Sample from photo and jump to nearest channel"}
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
                {pointColorPicking ? "Cancel" : "Pick Color"}
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
            label="Hue"
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
            label="Saturation"
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
            label="Luminance"
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
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Color Grading</p>
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
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Optics</p>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-950 accent-sky-400"
              checked={adjustments.opticsCA}
              onChange={(event) => updateAdjustments({ opticsCA: event.currentTarget.checked })}
            />
            <span className="space-y-0.5">
              <span className="block">Remove Chromatic Aberration</span>
              <span className="block text-[11px] text-slate-500">
                Reduce purple/green fringing around high-contrast edges.
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
              <span className="block">Enable Lens Profile</span>
              <span className="block text-[11px] text-slate-500">
                Persist lens correction intent for renderer/export alignment.
              </span>
            </span>
          </label>
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/55 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Film Modules</p>
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
            title="Mask"
            hint="Coming soon"
            isOpen={openSections.mask}
            onToggle={() => toggleSection("mask")}
          >
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-300">
              Masking tools are not available yet.
            </div>
          </EditorSection>
        );
      }
      if (sectionId === "remove") {
        return (
          <EditorSection
            title="Remove"
            hint="Coming soon"
            isOpen={openSections.remove}
            onToggle={() => toggleSection("remove")}
          >
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-300">
              Healing/removal tools are not available yet.
            </div>
          </EditorSection>
        );
      }
      if (sectionId === "ai") {
        return (
          <EditorSection
            title="AI"
            hint="Placeholder"
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
              <p className="text-xs text-slate-400">
                AI Agent image adjustments are coming soon.
              </p>
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
            title="Basic"
            hint="Light / WB / Tone"
            isOpen={openSections.basic}
            onToggle={() => toggleSection("basic")}
          >
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Light</p>
              {renderSliderRows(
                adjustments,
                BASIC_LIGHT_SLIDERS,
                previewAdjustmentValue,
                updateAdjustmentValue
              )}

              <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">
                White Balance
              </p>
              <div className="space-y-2">
                <p className="text-xs text-slate-300">Preset</p>
                <Select
                  value={whiteBalancePresetId}
                  onValueChange={handleWhiteBalancePresetChange}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select white balance" />
                  </SelectTrigger>
                  <SelectContent>
                    {WHITE_BALANCE_PRESETS.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label}
                      </SelectItem>
                    ))}
                    {whiteBalancePresetId === WHITE_BALANCE_CUSTOM_KEY && (
                      <SelectItem value={WHITE_BALANCE_CUSTOM_KEY}>Custom</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">Color</p>
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
            title="Effects"
            hint="Texture / Clarity / Grain"
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
            title="Detail"
            hint="Sharpen / Masking / Noise"
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
            title="Timestamp"
            hint="Film date imprint"
            isOpen={openSections.timestamp}
            onToggle={() => toggleSection("timestamp")}
          >
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
              <span>Enable Timestamp</span>
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
              <p className="text-xs text-slate-300">Position</p>
              <Select
                value={adjustments.timestampPosition}
                onValueChange={(value: EditingAdjustments["timestampPosition"]) =>
                  updateAdjustments({ timestampPosition: value })
                }
                disabled={!adjustments.timestampEnabled}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select position" />
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
              label="Text Size"
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
              label="Opacity"
              value={adjustments.timestampOpacity}
              defaultValue={DEFAULT_ADJUSTMENTS.timestampOpacity}
              min={0}
              max={100}
              step={1}
              disabled={!adjustments.timestampEnabled}
              onChange={(value) => previewAdjustmentValue("timestampOpacity", value)}
              onCommit={(value) => updateAdjustmentValue("timestampOpacity", value)}
              onReset={() =>
                updateAdjustmentValue(
                  "timestampOpacity",
                  DEFAULT_ADJUSTMENTS.timestampOpacity
                )
              }
            />
          </EditorSection>
        );

      case "advanced":
        return (
          <EditorSection
            title="Advanced"
            hint="Curve / HSL / Grading / Optics / Film"
            isOpen={openSections.advanced}
            onToggle={() => toggleSection("advanced")}
          >
            {renderAdvancedControls()}
          </EditorSection>
        );

      case "crop": {
        const ratioOptionId = resolveCropRatioOptionId(adjustments);
        const ratioLocked = adjustments.aspectRatio !== "free";
        const rotateSlider = CROP_SLIDERS.find((slider) => slider.key === "rotate");

        const applyCropRatioOption = (nextId: string) => {
          const option = CROP_RATIO_OPTIONS.find((item) => item.id === nextId);
          if (!option) {
            return;
          }
          if (option.aspectRatio) {
            updateAdjustments({
              aspectRatio: option.aspectRatio,
              customAspectRatio:
                typeof option.customRatio === "number"
                  ? option.customRatio
                  : adjustments.customAspectRatio,
            });
            return;
          }
          if (typeof option.customRatio === "number") {
            updateAdjustments({
              aspectRatio: "free",
              customAspectRatio: option.customRatio,
            });
          }
        };

        const swapCropRatioOrientation = () => {
          if (adjustments.aspectRatio === "original" || adjustments.aspectRatio === "1:1") {
            return;
          }
          if (adjustments.aspectRatio === "4:5") {
            updateAdjustments({ aspectRatio: "5:4" });
            return;
          }
          if (adjustments.aspectRatio === "5:4") {
            updateAdjustments({ aspectRatio: "4:5" });
            return;
          }
          if (adjustments.aspectRatio === "16:9") {
            updateAdjustments({ aspectRatio: "9:16" });
            return;
          }
          if (adjustments.aspectRatio === "9:16") {
            updateAdjustments({ aspectRatio: "16:9" });
            return;
          }
          updateAdjustments({
            aspectRatio: "free",
            customAspectRatio: clampCropRatio(1 / Math.max(adjustments.customAspectRatio, 0.01)),
          });
        };

        const toggleCropRatioLock = () => {
          if (ratioLocked) {
            updateAdjustments({ aspectRatio: "free" });
            return;
          }
          const selected = CROP_RATIO_OPTIONS.find((item) => item.id === ratioOptionId);
          if (!selected?.aspectRatio || selected.aspectRatio === "free") {
            updateAdjustments({ aspectRatio: "original" });
            return;
          }
          updateAdjustments({ aspectRatio: selected.aspectRatio });
        };

        const resetCropSection = () => {
          updateAdjustments({
            aspectRatio: DEFAULT_ADJUSTMENTS.aspectRatio,
            customAspectRatio: DEFAULT_ADJUSTMENTS.customAspectRatio,
            rotate: DEFAULT_ADJUSTMENTS.rotate,
            horizontal: DEFAULT_ADJUSTMENTS.horizontal,
            vertical: DEFAULT_ADJUSTMENTS.vertical,
            scale: DEFAULT_ADJUSTMENTS.scale,
            flipHorizontal: DEFAULT_ADJUSTMENTS.flipHorizontal,
            flipVertical: DEFAULT_ADJUSTMENTS.flipVertical,
          });
        };

        const rotateByRightAngle = (delta: number) => {
          updateAdjustmentValue("rotate", normalizeRotateAngle(adjustments.rotate + delta));
        };

        return (
          <EditorSection
            title="裁剪"
            hint="比例 / 拉直 / 旋转"
            isOpen={openSections.crop}
            onToggle={() => toggleSection("crop")}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-300">画幅比例</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={resetCropSection}
                >
                  重置
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Select value={ratioOptionId} onValueChange={applyCropRatioOption}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="选择比例" />
                  </SelectTrigger>
                  <SelectContent>
                    {CROP_RATIO_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 w-8 px-0"
                  onClick={swapCropRatioOrientation}
                  title="切换横竖方向"
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={ratioLocked ? "default" : "secondary"}
                  className="h-8 w-8 px-0"
                  onClick={toggleCropRatioLock}
                  title={ratioLocked ? "锁定比例" : "自由比例"}
                >
                  {ratioLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {rotateSlider && (
              <EditorSliderRow
                label={rotateSlider.label}
                value={adjustments.rotate}
                defaultValue={DEFAULT_ADJUSTMENTS.rotate}
                min={rotateSlider.min}
                max={rotateSlider.max}
                step={rotateSlider.step}
                format={(value) => value.toFixed(2)}
                onChange={(value) => previewAdjustmentValue("rotate", value)}
                onCommit={(value) => updateAdjustmentValue("rotate", value)}
                onReset={() => updateAdjustmentValue("rotate", DEFAULT_ADJUSTMENTS.rotate)}
              />
            )}

            <div className="space-y-2">
              <p className="text-xs text-slate-300">旋转与翻转</p>
              <div className="grid grid-cols-4 gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 w-full px-0"
                  onClick={() => rotateByRightAngle(-90)}
                  title="逆时针旋转 90°"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 w-full px-0"
                  onClick={() => rotateByRightAngle(90)}
                  title="顺时针旋转 90°"
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={adjustments.flipHorizontal ? "default" : "secondary"}
                  className="h-8 w-full px-0"
                  onClick={() => toggleFlip("flipHorizontal")}
                  aria-pressed={adjustments.flipHorizontal}
                  title="水平翻转"
                >
                  <FlipHorizontal2 className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={adjustments.flipVertical ? "default" : "secondary"}
                  className="h-8 w-full px-0"
                  onClick={() => toggleFlip("flipVertical")}
                  aria-pressed={adjustments.flipVertical}
                  title="垂直翻转"
                >
                  <FlipVertical2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </EditorSection>
        );
      }

      case "mask":
        return (
          <EditorSection
            title="Mask"
            hint="Coming soon"
            isOpen={openSections.mask}
            onToggle={() => toggleSection("mask")}
          >
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-300">
              Masking tools are not available yet.
            </div>
          </EditorSection>
        );

      case "remove":
        return (
          <EditorSection
            title="Remove"
            hint="Coming soon"
            isOpen={openSections.remove}
            onToggle={() => toggleSection("remove")}
          >
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-300">
              Healing/removal tools are not available yet.
            </div>
          </EditorSection>
        );

      case "ai":
        return (
          <EditorSection
            title="AI"
            hint="Placeholder"
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
              <p className="text-xs text-slate-400">
                AI Agent image adjustments are coming soon.
              </p>
            </div>
          </EditorSection>
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
    </div>
  );
});

export const EditorAdjustmentPanel = memo(function EditorAdjustmentPanel() {
  const { activeToolPanelId } = useEditorState();
  return <EditorInspectorContent panelId={activeToolPanelId} />;
});
