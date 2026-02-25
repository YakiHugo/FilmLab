import { memo, useEffect, useState } from "react";
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
import type {
  EditingAdjustments,
  FilmModuleId,
  FilmNumericParamKey,
  LocalAdjustment,
  LocalAdjustmentDelta,
} from "@/types";
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
    { key: "whites", label: "白色色阶", min: -100, max: 100, step: 1 },
    { key: "blacks", label: "黑色色阶", min: -100, max: 100, step: 1 },
    { key: "curveLights", label: "曲线亮调", min: -100, max: 100, step: 1 },
    { key: "curveDarks", label: "曲线暗调", min: -100, max: 100, step: 1 },
    { key: "curveHighlights", label: "曲线高光", min: -100, max: 100, step: 1 },
    { key: "curveShadows", label: "曲线阴影", min: -100, max: 100, step: 1 },
  ],
  scan: [
    { key: "halationThreshold", label: "光晕阈值", min: 0.5, max: 1, step: 0.01 },
    { key: "halationAmount", label: "光晕强度", min: 0, max: 1, step: 0.01 },
    { key: "bloomThreshold", label: "泛光阈值", min: 0.4, max: 1, step: 0.01 },
    { key: "bloomAmount", label: "泛光强度", min: 0, max: 1, step: 0.01 },
    { key: "vignetteAmount", label: "暗角强度", min: -1, max: 1, step: 0.01 },
    { key: "scanWarmth", label: "扫描暖度", min: -100, max: 100, step: 1 },
  ],
  grain: [
    { key: "amount", label: "颗粒量", min: 0, max: 1, step: 0.01 },
    { key: "size", label: "颗粒大小", min: 0, max: 1, step: 0.01 },
    { key: "roughness", label: "粗糙度", min: 0, max: 1, step: 0.01 },
    { key: "color", label: "彩色颗粒", min: 0, max: 1, step: 0.01 },
    { key: "shadowBoost", label: "阴影增强", min: 0, max: 1, step: 0.01 },
  ],
  defects: [
    { key: "leakProbability", label: "漏光概率", min: 0, max: 1, step: 0.01 },
    { key: "leakStrength", label: "漏光强度", min: 0, max: 1, step: 0.01 },
    { key: "dustAmount", label: "灰尘量", min: 0, max: 1, step: 0.01 },
    { key: "scratchAmount", label: "划痕量", min: 0, max: 1, step: 0.01 },
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
const ABSOLUTE_WHITE_BALANCE_DEFAULT_KELVIN = 6500;
const ABSOLUTE_WHITE_BALANCE_DEFAULT_TINT_MG = 0;

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
  { value: "bottom-right", label: "右下角" },
  { value: "bottom-left", label: "左下角" },
  { value: "top-right", label: "右上角" },
  { value: "top-left", label: "左上角" },
];

type BwMixChannel = keyof NonNullable<EditingAdjustments["bwMix"]>;
type CalibrationKey = keyof NonNullable<EditingAdjustments["calibration"]>;
type LocalDeltaKey = keyof LocalAdjustmentDelta;

const BW_MIX_ROWS: Array<{ key: BwMixChannel; label: string }> = [
  { key: "red", label: "Red" },
  { key: "green", label: "Green" },
  { key: "blue", label: "Blue" },
];

const CALIBRATION_ROWS: Array<{ key: CalibrationKey; label: string }> = [
  { key: "redHue", label: "Red Hue" },
  { key: "redSaturation", label: "Red Saturation" },
  { key: "greenHue", label: "Green Hue" },
  { key: "greenSaturation", label: "Green Saturation" },
  { key: "blueHue", label: "Blue Hue" },
  { key: "blueSaturation", label: "Blue Saturation" },
];

const LOCAL_DELTA_ROWS: Array<{ key: LocalDeltaKey; label: string }> = [
  { key: "exposure", label: "Exposure" },
  { key: "contrast", label: "Contrast" },
  { key: "highlights", label: "Highlights" },
  { key: "shadows", label: "Shadows" },
  { key: "temperature", label: "Temperature" },
  { key: "tint", label: "Tint" },
  { key: "saturation", label: "Saturation" },
  { key: "clarity", label: "Clarity" },
  { key: "dehaze", label: "Dehaze" },
];

const createLocalAdjustmentId = () =>
  `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
    pointColorPickTarget,
    lastPointColorSample,
    selectedLocalAdjustmentId,
    curveChannel,
    openSections,
    setActiveHslColor,
    setCurveChannel,
    setSelectedLocalAdjustmentId,
    toggleSection,
    updateAdjustments,
    previewAdjustmentValue,
    updateAdjustmentValue,
    previewAdjustmentPatch,
    commitAdjustmentPatch,
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
    requestAutoPerspective,
    handleSetFilmModuleAmount,
    handleToggleFilmModule,
    handleSetFilmModuleParam,
    handleSetFilmModuleRgbMix,
    handleResetFilmOverrides,
    selectedAsset,
    handleSelectFilmProfile,
  } = useEditorState();

  const [filmResetOpen, setFilmResetOpen] = useState(false);
  const hasAbsoluteWhiteBalance = adjustments
    ? Number.isFinite(adjustments.temperatureKelvin ?? NaN) ||
      Number.isFinite(adjustments.tintMG ?? NaN)
    : false;
  const whiteBalanceMode: "relative" | "absolute" = hasAbsoluteWhiteBalance
    ? "absolute"
    : "relative";
  const basicColorSliders =
    whiteBalanceMode === "absolute"
      ? BASIC_COLOR_SLIDERS.filter((slider) => slider.key !== "temperature" && slider.key !== "tint")
      : BASIC_COLOR_SLIDERS;
  const absoluteTemperatureKelvin = Number.isFinite(adjustments?.temperatureKelvin ?? NaN)
    ? (adjustments?.temperatureKelvin as number)
    : ABSOLUTE_WHITE_BALANCE_DEFAULT_KELVIN;
  const absoluteTintMG = Number.isFinite(adjustments?.tintMG ?? NaN)
    ? (adjustments?.tintMG as number)
    : ABSOLUTE_WHITE_BALANCE_DEFAULT_TINT_MG;

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
      temperatureKelvin: undefined,
      tintMG: undefined,
    });
  };

  const handleWhiteBalanceModeChange = (nextMode: "relative" | "absolute") => {
    if (!adjustments) {
      return;
    }
    if (nextMode === "absolute") {
      updateAdjustments({
        temperature: 0,
        tint: 0,
        temperatureKelvin: absoluteTemperatureKelvin,
        tintMG: absoluteTintMG,
      });
      return;
    }
    updateAdjustments({
      temperatureKelvin: undefined,
      tintMG: undefined,
    });
  };

  const previewBwMixValue = (channel: BwMixChannel, value: number) => {
    if (!adjustments) {
      return;
    }
    const current = adjustments.bwMix ?? DEFAULT_ADJUSTMENTS.bwMix ?? { red: 0, green: 0, blue: 0 };
    previewAdjustmentPatch(`bwMix:${channel}`, {
      bwEnabled: true,
      bwMix: {
        ...current,
        [channel]: value,
      },
    });
  };

  const commitBwMixValue = (channel: BwMixChannel, value: number) => {
    if (!adjustments) {
      return false;
    }
    const current = adjustments.bwMix ?? DEFAULT_ADJUSTMENTS.bwMix ?? { red: 0, green: 0, blue: 0 };
    return commitAdjustmentPatch(`bwMix:${channel}`, {
      bwEnabled: true,
      bwMix: {
        ...current,
        [channel]: value,
      },
    });
  };

  const previewCalibrationValue = (key: CalibrationKey, value: number) => {
    if (!adjustments) {
      return;
    }
    const current =
      adjustments.calibration ??
      DEFAULT_ADJUSTMENTS.calibration ?? {
        redHue: 0,
        redSaturation: 0,
        greenHue: 0,
        greenSaturation: 0,
        blueHue: 0,
        blueSaturation: 0,
      };
    previewAdjustmentPatch(`calibration:${key}`, {
      calibration: {
        ...current,
        [key]: value,
      },
    });
  };

  const commitCalibrationValue = (key: CalibrationKey, value: number) => {
    if (!adjustments) {
      return false;
    }
    const current =
      adjustments.calibration ??
      DEFAULT_ADJUSTMENTS.calibration ?? {
        redHue: 0,
        redSaturation: 0,
        greenHue: 0,
        greenSaturation: 0,
        blueHue: 0,
        blueSaturation: 0,
      };
    return commitAdjustmentPatch(`calibration:${key}`, {
      calibration: {
        ...current,
        [key]: value,
      },
    });
  };

  const localAdjustments = adjustments?.localAdjustments ?? [];
  const selectedLocalAdjustment =
    localAdjustments.find((item) => item.id === selectedLocalAdjustmentId) ?? localAdjustments[0];
  const isHslPointPickActive = pointColorPicking && pointColorPickTarget === "hsl";
  const isLocalMaskPointPickActive =
    pointColorPicking && pointColorPickTarget === "localMask";

  useEffect(() => {
    if (localAdjustments.length === 0) {
      if (selectedLocalAdjustmentId !== null) {
        setSelectedLocalAdjustmentId(null);
      }
      return;
    }
    const hasSelected =
      typeof selectedLocalAdjustmentId === "string" &&
      localAdjustments.some((item) => item.id === selectedLocalAdjustmentId);
    if (!hasSelected) {
      setSelectedLocalAdjustmentId(localAdjustments[0]!.id);
    }
  }, [localAdjustments, selectedLocalAdjustmentId, setSelectedLocalAdjustmentId]);

  const previewLocalAdjustments = (next: LocalAdjustment[], historyKey: string) => {
    previewAdjustmentPatch(`local:${historyKey}`, {
      localAdjustments: next,
    });
  };

  const commitLocalAdjustments = (next: LocalAdjustment[], historyKey: string) =>
    commitAdjustmentPatch(`local:${historyKey}`, {
      localAdjustments: next,
    });

  const addLocalAdjustment = (mode: "radial" | "linear" | "brush") => {
    if (!adjustments) {
      return;
    }
    const id = createLocalAdjustmentId();
    let created: LocalAdjustment;
    if (mode === "radial") {
      created = {
        id,
        enabled: true,
        amount: 100,
        mask: {
          mode: "radial",
          centerX: 0.5,
          centerY: 0.5,
          radiusX: 0.3,
          radiusY: 0.3,
          feather: 0.45,
          lumaMin: 0,
          lumaMax: 1,
          lumaFeather: 0,
          hueCenter: 0,
          hueRange: 180,
          hueFeather: 0,
          satMin: 0,
          satFeather: 0,
          invert: false,
        },
        adjustments: {},
      };
    } else if (mode === "linear") {
      created = {
        id,
        enabled: true,
        amount: 100,
        mask: {
          mode: "linear",
          startX: 0.5,
          startY: 0.2,
          endX: 0.5,
          endY: 0.8,
          feather: 0.4,
          lumaMin: 0,
          lumaMax: 1,
          lumaFeather: 0,
          hueCenter: 0,
          hueRange: 180,
          hueFeather: 0,
          satMin: 0,
          satFeather: 0,
          invert: false,
        },
        adjustments: {},
      };
    } else {
      created = {
        id,
        enabled: true,
        amount: 100,
        mask: {
          mode: "brush",
          points: [],
          brushSize: 0.08,
          feather: 0.55,
          flow: 0.85,
          lumaMin: 0,
          lumaMax: 1,
          lumaFeather: 0,
          hueCenter: 0,
          hueRange: 180,
          hueFeather: 0,
          satMin: 0,
          satFeather: 0,
          invert: false,
        },
        adjustments: {},
      };
    }
    const next = [...localAdjustments, created];
    setSelectedLocalAdjustmentId(id);
    commitLocalAdjustments(next, `${id}:create`);
  };

  const removeSelectedLocalAdjustment = () => {
    if (!selectedLocalAdjustment) {
      return;
    }
    const next = localAdjustments.filter((item) => item.id !== selectedLocalAdjustment.id);
    setSelectedLocalAdjustmentId(next[0]?.id ?? null);
    commitLocalAdjustments(next, `${selectedLocalAdjustment.id}:remove`);
  };

  const patchSelectedLocalAdjustment = (
    historyKey: string,
    updater: (value: LocalAdjustment) => LocalAdjustment,
    phase: "preview" | "commit"
  ) => {
    if (!selectedLocalAdjustment) {
      return;
    }
    const next = localAdjustments.map((item) =>
      item.id === selectedLocalAdjustment.id ? updater(item) : item
    );
    if (phase === "preview") {
      previewLocalAdjustments(next, historyKey);
      return;
    }
    commitLocalAdjustments(next, historyKey);
  };

  const patchSelectedLocalLumaRange = (
    historyKey: string,
    nextRange: Partial<{ lumaMin: number; lumaMax: number; lumaFeather: number }>,
    phase: "preview" | "commit"
  ) => {
    patchSelectedLocalAdjustment(
      historyKey,
      (item) => {
        const currentMin = item.mask.lumaMin ?? 0;
        const currentMax = item.mask.lumaMax ?? 1;
        const currentFeather = item.mask.lumaFeather ?? 0;
        const rawMin = nextRange.lumaMin ?? currentMin;
        const rawMax = nextRange.lumaMax ?? currentMax;
        const min = Math.min(rawMin, rawMax);
        const max = Math.max(rawMin, rawMax);
        return {
          ...item,
          mask: {
            ...item.mask,
            lumaMin: min,
            lumaMax: max,
            lumaFeather: Math.max(0, Math.min(1, nextRange.lumaFeather ?? currentFeather)),
          },
        };
      },
      phase
    );
  };

  const patchSelectedLocalColorRange = (
    historyKey: string,
    nextRange: Partial<{
      hueCenter: number;
      hueRange: number;
      hueFeather: number;
      satMin: number;
      satFeather: number;
    }>,
    phase: "preview" | "commit"
  ) => {
    patchSelectedLocalAdjustment(
      historyKey,
      (item) => {
        const currentHueCenter = item.mask.hueCenter ?? 0;
        const currentHueRange = item.mask.hueRange ?? 180;
        const currentHueFeather = item.mask.hueFeather ?? 0;
        const currentSatMin = item.mask.satMin ?? 0;
        const currentSatFeather = item.mask.satFeather ?? 0;
        const hueCenterRaw = nextRange.hueCenter ?? currentHueCenter;
        return {
          ...item,
          mask: {
            ...item.mask,
            hueCenter: ((hueCenterRaw % 360) + 360) % 360,
            hueRange: Math.max(0, Math.min(180, nextRange.hueRange ?? currentHueRange)),
            hueFeather: Math.max(0, Math.min(180, nextRange.hueFeather ?? currentHueFeather)),
            satMin: Math.max(0, Math.min(1, nextRange.satMin ?? currentSatMin)),
            satFeather: Math.max(0, Math.min(1, nextRange.satFeather ?? currentSatFeather)),
          },
        };
      },
      phase
    );
  };

  const renderMissingAssetState = () => (
    <Card>
      <CardContent className="p-4 text-sm text-slate-400">
        选择一张图片并加载胶片档案后，可在这里覆盖各模块参数。
      </CardContent>
    </Card>
  );

  const renderFilmControls = () => {
    if (!filmProfile) {
      return <p className="text-xs text-slate-500">No film profile loaded.</p>;
    }
    if (filmProfile.id.startsWith("stock-")) {
      return (
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300">
          This stock profile uses a dedicated LUT in <code>/public/luts/stocks</code>.
          Module-level legacy overrides are disabled for stock LUT profiles.
        </div>
      );
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
                  {module.enabled ? "On" : "Off"}
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

  const renderLocalAdjustmentsPanel = () => (
    <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/55 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Local Adjustments</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs"
            onClick={() => addLocalAdjustment("radial")}
          >
            + Radial
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs"
            onClick={() => addLocalAdjustment("linear")}
          >
            + Linear
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs"
            onClick={() => addLocalAdjustment("brush")}
          >
            + Brush
          </Button>
        </div>
      </div>
      {localAdjustments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
          No local mask yet. Add one mask to start local corrections.
        </p>
      ) : (
        <>
          <div className="grid gap-2">
            {localAdjustments.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedLocalAdjustmentId(item.id)}
                className={cn(
                  "flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs",
                  selectedLocalAdjustment?.id === item.id
                    ? "border-sky-400/60 bg-sky-400/10 text-slate-100"
                    : "border-white/10 bg-slate-950/60 text-slate-300"
                )}
              >
                <span>
                  Mask {index + 1} ({item.mask.mode})
                </span>
                <span>{item.enabled ? "On" : "Off"}</span>
              </button>
            ))}
          </div>

          {selectedLocalAdjustment && (
            <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-white/20 bg-slate-950 accent-sky-400"
                    checked={selectedLocalAdjustment.enabled}
                    onChange={(event) =>
                      patchSelectedLocalAdjustment(
                        `${selectedLocalAdjustment.id}:enabled`,
                        (item) => ({ ...item, enabled: event.currentTarget.checked }),
                        "commit"
                      )
                    }
                  />
                  Enable
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-white/20 bg-slate-950 accent-sky-400"
                    checked={Boolean(selectedLocalAdjustment.mask.invert)}
                    onChange={(event) =>
                      patchSelectedLocalAdjustment(
                        `${selectedLocalAdjustment.id}:invert`,
                        (item) => ({
                          ...item,
                          mask: { ...item.mask, invert: event.currentTarget.checked },
                        }),
                        "commit"
                      )
                    }
                  />
                  Invert
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-red-300 hover:text-red-200"
                  onClick={removeSelectedLocalAdjustment}
                >
                  Remove
                </Button>
              </div>

              <Button
                size="sm"
                variant={isLocalMaskPointPickActive ? "default" : "secondary"}
                className="h-7 w-full text-xs"
                onClick={() => {
                  if (isLocalMaskPointPickActive) {
                    cancelPointColorPick();
                    return;
                  }
                  startPointColorPick("localMask");
                }}
              >
                {isLocalMaskPointPickActive ? "Cancel Pick" : "Pick Hue From Preview"}
              </Button>

              <EditorSliderRow
                label="Amount"
                value={selectedLocalAdjustment.amount}
                defaultValue={100}
                min={0}
                max={100}
                step={1}
                onChange={(value) =>
                  patchSelectedLocalAdjustment(
                    `${selectedLocalAdjustment.id}:amount`,
                    (item) => ({ ...item, amount: Math.round(value) }),
                    "preview"
                  )
                }
                onCommit={(value) =>
                  patchSelectedLocalAdjustment(
                    `${selectedLocalAdjustment.id}:amount`,
                    (item) => ({ ...item, amount: Math.round(value) }),
                    "commit"
                  )
                }
                onReset={() =>
                  patchSelectedLocalAdjustment(
                    `${selectedLocalAdjustment.id}:amount`,
                    (item) => ({ ...item, amount: 100 }),
                    "commit"
                  )
                }
              />

              {selectedLocalAdjustment.mask.mode === "brush" && (
                <>
                  <p className="text-[11px] text-slate-400">
                    Brush mask: paint directly on preview in Mask panel.
                  </p>
                  <EditorSliderRow
                    label="Brush Size"
                    value={Math.round(selectedLocalAdjustment.mask.brushSize * 100)}
                    defaultValue={8}
                    min={1}
                    max={25}
                    step={1}
                    format={(value) => `${Math.round(value)}%`}
                    onChange={(value) =>
                      patchSelectedLocalAdjustment(
                        `${selectedLocalAdjustment.id}:brushSize`,
                        (item) =>
                          item.mask.mode === "brush"
                            ? {
                                ...item,
                                mask: {
                                  ...item.mask,
                                  brushSize: Math.max(0.005, Math.min(0.25, Math.round(value) / 100)),
                                },
                              }
                            : item,
                        "preview"
                      )
                    }
                    onCommit={(value) =>
                      patchSelectedLocalAdjustment(
                        `${selectedLocalAdjustment.id}:brushSize`,
                        (item) =>
                          item.mask.mode === "brush"
                            ? {
                                ...item,
                                mask: {
                                  ...item.mask,
                                  brushSize: Math.max(0.005, Math.min(0.25, Math.round(value) / 100)),
                                },
                              }
                            : item,
                        "commit"
                      )
                    }
                    onReset={() =>
                      patchSelectedLocalAdjustment(
                        `${selectedLocalAdjustment.id}:brushSize`,
                        (item) =>
                          item.mask.mode === "brush"
                            ? {
                                ...item,
                                mask: {
                                  ...item.mask,
                                  brushSize: 0.08,
                                },
                              }
                            : item,
                        "commit"
                      )
                    }
                  />
                  <EditorSliderRow
                    label="Brush Feather"
                    value={Math.round(selectedLocalAdjustment.mask.feather * 100)}
                    defaultValue={55}
                    min={0}
                    max={100}
                    step={1}
                    format={(value) => `${Math.round(value)}%`}
                    onChange={(value) =>
                      patchSelectedLocalAdjustment(
                        `${selectedLocalAdjustment.id}:brushFeather`,
                        (item) =>
                          item.mask.mode === "brush"
                            ? {
                                ...item,
                                mask: {
                                  ...item.mask,
                                  feather: Math.max(0, Math.min(1, Math.round(value) / 100)),
                                },
                              }
                            : item,
                        "preview"
                      )
                    }
                    onCommit={(value) =>
                      patchSelectedLocalAdjustment(
                        `${selectedLocalAdjustment.id}:brushFeather`,
                        (item) =>
                          item.mask.mode === "brush"
                            ? {
                                ...item,
                                mask: {
                                  ...item.mask,
                                  feather: Math.max(0, Math.min(1, Math.round(value) / 100)),
                                },
                              }
                            : item,
                        "commit"
                      )
                    }
                    onReset={() =>
                      patchSelectedLocalAdjustment(
                        `${selectedLocalAdjustment.id}:brushFeather`,
                        (item) =>
                          item.mask.mode === "brush"
                            ? {
                                ...item,
                                mask: {
                                  ...item.mask,
                                  feather: 0.55,
                                },
                              }
                            : item,
                        "commit"
                      )
                    }
                  />
                  <EditorSliderRow
                    label="Brush Flow"
                    value={Math.round(selectedLocalAdjustment.mask.flow * 100)}
                    defaultValue={85}
                    min={5}
                    max={100}
                    step={1}
                    format={(value) => `${Math.round(value)}%`}
                    onChange={(value) =>
                      patchSelectedLocalAdjustment(
                        `${selectedLocalAdjustment.id}:brushFlow`,
                        (item) =>
                          item.mask.mode === "brush"
                            ? {
                                ...item,
                                mask: {
                                  ...item.mask,
                                  flow: Math.max(0.05, Math.min(1, Math.round(value) / 100)),
                                },
                              }
                            : item,
                        "preview"
                      )
                    }
                    onCommit={(value) =>
                      patchSelectedLocalAdjustment(
                        `${selectedLocalAdjustment.id}:brushFlow`,
                        (item) =>
                          item.mask.mode === "brush"
                            ? {
                                ...item,
                                mask: {
                                  ...item.mask,
                                  flow: Math.max(0.05, Math.min(1, Math.round(value) / 100)),
                                },
                              }
                            : item,
                        "commit"
                      )
                    }
                    onReset={() =>
                      patchSelectedLocalAdjustment(
                        `${selectedLocalAdjustment.id}:brushFlow`,
                        (item) =>
                          item.mask.mode === "brush"
                            ? {
                                ...item,
                                mask: {
                                  ...item.mask,
                                  flow: 0.85,
                                },
                              }
                            : item,
                        "commit"
                      )
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      patchSelectedLocalAdjustment(
                        `${selectedLocalAdjustment.id}:brushClear`,
                        (item) =>
                          item.mask.mode === "brush"
                            ? {
                                ...item,
                                mask: {
                                  ...item.mask,
                                  points: [],
                                },
                              }
                            : item,
                        "commit"
                      )
                    }
                  >
                    Clear Brush Strokes
                  </Button>
                </>
              )}

              <EditorSliderRow
                label="Luma Min"
                value={Math.round((selectedLocalAdjustment.mask.lumaMin ?? 0) * 100)}
                defaultValue={0}
                min={0}
                max={100}
                step={1}
                format={(value) => `${Math.round(value)}%`}
                onChange={(value) =>
                  patchSelectedLocalLumaRange(
                    `${selectedLocalAdjustment.id}:lumaMin`,
                    { lumaMin: Math.round(value) / 100 },
                    "preview"
                  )
                }
                onCommit={(value) =>
                  patchSelectedLocalLumaRange(
                    `${selectedLocalAdjustment.id}:lumaMin`,
                    { lumaMin: Math.round(value) / 100 },
                    "commit"
                  )
                }
                onReset={() =>
                  patchSelectedLocalLumaRange(
                    `${selectedLocalAdjustment.id}:lumaMin`,
                    { lumaMin: 0 },
                    "commit"
                  )
                }
              />

              <EditorSliderRow
                label="Luma Max"
                value={Math.round((selectedLocalAdjustment.mask.lumaMax ?? 1) * 100)}
                defaultValue={100}
                min={0}
                max={100}
                step={1}
                format={(value) => `${Math.round(value)}%`}
                onChange={(value) =>
                  patchSelectedLocalLumaRange(
                    `${selectedLocalAdjustment.id}:lumaMax`,
                    { lumaMax: Math.round(value) / 100 },
                    "preview"
                  )
                }
                onCommit={(value) =>
                  patchSelectedLocalLumaRange(
                    `${selectedLocalAdjustment.id}:lumaMax`,
                    { lumaMax: Math.round(value) / 100 },
                    "commit"
                  )
                }
                onReset={() =>
                  patchSelectedLocalLumaRange(
                    `${selectedLocalAdjustment.id}:lumaMax`,
                    { lumaMax: 1 },
                    "commit"
                  )
                }
              />

              <EditorSliderRow
                label="Luma Feather"
                value={Math.round((selectedLocalAdjustment.mask.lumaFeather ?? 0) * 100)}
                defaultValue={0}
                min={0}
                max={100}
                step={1}
                format={(value) => `${Math.round(value)}%`}
                onChange={(value) =>
                  patchSelectedLocalLumaRange(
                    `${selectedLocalAdjustment.id}:lumaFeather`,
                    { lumaFeather: Math.round(value) / 100 },
                    "preview"
                  )
                }
                onCommit={(value) =>
                  patchSelectedLocalLumaRange(
                    `${selectedLocalAdjustment.id}:lumaFeather`,
                    { lumaFeather: Math.round(value) / 100 },
                    "commit"
                  )
                }
                onReset={() =>
                  patchSelectedLocalLumaRange(
                    `${selectedLocalAdjustment.id}:lumaFeather`,
                    { lumaFeather: 0 },
                    "commit"
                  )
                }
              />

              <EditorSliderRow
                label="Hue Center"
                value={Math.round(selectedLocalAdjustment.mask.hueCenter ?? 0)}
                defaultValue={0}
                min={0}
                max={360}
                step={1}
                format={(value) => `${Math.round(value)}掳`}
                onChange={(value) =>
                  patchSelectedLocalColorRange(
                    `${selectedLocalAdjustment.id}:hueCenter`,
                    { hueCenter: Math.round(value) },
                    "preview"
                  )
                }
                onCommit={(value) =>
                  patchSelectedLocalColorRange(
                    `${selectedLocalAdjustment.id}:hueCenter`,
                    { hueCenter: Math.round(value) },
                    "commit"
                  )
                }
                onReset={() =>
                  patchSelectedLocalColorRange(
                    `${selectedLocalAdjustment.id}:hueCenter`,
                    { hueCenter: 0 },
                    "commit"
                  )
                }
              />

              <EditorSliderRow
                label="Hue Range"
                value={Math.round(selectedLocalAdjustment.mask.hueRange ?? 180)}
                defaultValue={180}
                min={0}
                max={180}
                step={1}
                format={(value) => `${Math.round(value)}掳`}
                onChange={(value) =>
                  patchSelectedLocalColorRange(
                    `${selectedLocalAdjustment.id}:hueRange`,
                    { hueRange: Math.round(value) },
                    "preview"
                  )
                }
                onCommit={(value) =>
                  patchSelectedLocalColorRange(
                    `${selectedLocalAdjustment.id}:hueRange`,
                    { hueRange: Math.round(value) },
                    "commit"
                  )
                }
                onReset={() =>
                  patchSelectedLocalColorRange(
                    `${selectedLocalAdjustment.id}:hueRange`,
                    { hueRange: 180 },
                    "commit"
                  )
                }
              />

              <EditorSliderRow
                label="Hue Feather"
                value={Math.round(selectedLocalAdjustment.mask.hueFeather ?? 0)}
                defaultValue={0}
                min={0}
                max={180}
                step={1}
                format={(value) => `${Math.round(value)}掳`}
                onChange={(value) =>
                  patchSelectedLocalColorRange(
                    `${selectedLocalAdjustment.id}:hueFeather`,
                    { hueFeather: Math.round(value) },
                    "preview"
                  )
                }
                onCommit={(value) =>
                  patchSelectedLocalColorRange(
                    `${selectedLocalAdjustment.id}:hueFeather`,
                    { hueFeather: Math.round(value) },
                    "commit"
                  )
                }
                onReset={() =>
                  patchSelectedLocalColorRange(
                    `${selectedLocalAdjustment.id}:hueFeather`,
                    { hueFeather: 0 },
                    "commit"
                  )
                }
              />

              <EditorSliderRow
                label="Sat Min"
                value={Math.round((selectedLocalAdjustment.mask.satMin ?? 0) * 100)}
                defaultValue={0}
                min={0}
                max={100}
                step={1}
                format={(value) => `${Math.round(value)}%`}
                onChange={(value) =>
                  patchSelectedLocalColorRange(
                    `${selectedLocalAdjustment.id}:satMin`,
                    { satMin: Math.round(value) / 100 },
                    "preview"
                  )
                }
                onCommit={(value) =>
                  patchSelectedLocalColorRange(
                    `${selectedLocalAdjustment.id}:satMin`,
                    { satMin: Math.round(value) / 100 },
                    "commit"
                  )
                }
                onReset={() =>
                  patchSelectedLocalColorRange(
                    `${selectedLocalAdjustment.id}:satMin`,
                    { satMin: 0 },
                    "commit"
                  )
                }
              />

              <EditorSliderRow
                label="Sat Feather"
                value={Math.round((selectedLocalAdjustment.mask.satFeather ?? 0) * 100)}
                defaultValue={0}
                min={0}
                max={100}
                step={1}
                format={(value) => `${Math.round(value)}%`}
                onChange={(value) =>
                  patchSelectedLocalColorRange(
                    `${selectedLocalAdjustment.id}:satFeather`,
                    { satFeather: Math.round(value) / 100 },
                    "preview"
                  )
                }
                onCommit={(value) =>
                  patchSelectedLocalColorRange(
                    `${selectedLocalAdjustment.id}:satFeather`,
                    { satFeather: Math.round(value) / 100 },
                    "commit"
                  )
                }
                onReset={() =>
                  patchSelectedLocalColorRange(
                    `${selectedLocalAdjustment.id}:satFeather`,
                    { satFeather: 0 },
                    "commit"
                  )
                }
              />

              {LOCAL_DELTA_ROWS.map((delta) => (
                <EditorSliderRow
                  key={`${selectedLocalAdjustment.id}-${delta.key}`}
                  label={delta.label}
                  value={selectedLocalAdjustment.adjustments[delta.key] ?? 0}
                  defaultValue={0}
                  min={-100}
                  max={100}
                  step={1}
                  format={(value) => (value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`)}
                  onChange={(value) =>
                    patchSelectedLocalAdjustment(
                      `${selectedLocalAdjustment.id}:${delta.key}`,
                      (item) => ({
                        ...item,
                        adjustments: {
                          ...item.adjustments,
                          [delta.key]: Math.round(value),
                        },
                      }),
                      "preview"
                    )
                  }
                  onCommit={(value) =>
                    patchSelectedLocalAdjustment(
                      `${selectedLocalAdjustment.id}:${delta.key}`,
                      (item) => ({
                        ...item,
                        adjustments: {
                          ...item.adjustments,
                          [delta.key]: Math.round(value),
                        },
                      }),
                      "commit"
                    )
                  }
                  onReset={() =>
                    patchSelectedLocalAdjustment(
                      `${selectedLocalAdjustment.id}:${delta.key}`,
                      (item) => ({
                        ...item,
                        adjustments: {
                          ...item.adjustments,
                          [delta.key]: 0,
                        },
                      }),
                      "commit"
                    )
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderAdvancedControls = () => {
    if (!adjustments) {
      return null;
    }

    const bwMix = adjustments.bwMix ?? DEFAULT_ADJUSTMENTS.bwMix ?? { red: 0, green: 0, blue: 0 };
    const calibration =
      adjustments.calibration ??
      DEFAULT_ADJUSTMENTS.calibration ?? {
        redHue: 0,
        redSaturation: 0,
        greenHue: 0,
        greenSaturation: 0,
        blueHue: 0,
        blueSaturation: 0,
      };

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
                <p className="text-slate-200">Point Color Pick</p>
                <p className="text-[11px] text-slate-500">
                  {isHslPointPickActive
                    ? "点击预览取消取色模式。"
                    : "点击按钮后在预览上取色，自动映射到最接近的 HSL 颜色通道。"}
                </p>
              </div>
              <Button
                size="sm"
                variant={isHslPointPickActive ? "default" : "secondary"}
                onClick={() => {
                  if (isHslPointPickActive) {
                    cancelPointColorPick();
                    return;
                  }
                  startPointColorPick("hsl");
                }}
              >
                {isHslPointPickActive ? "取消取色" : "开始取色"}
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
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">B&W Mix</p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() =>
                commitAdjustmentPatch("bwMix:reset", {
                  bwEnabled: false,
                  bwMix: { red: 0, green: 0, blue: 0 },
                })
              }
            >
              Reset
            </Button>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
            <span>Enable B&W</span>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-white/20 bg-slate-950 accent-sky-400"
              checked={Boolean(adjustments.bwEnabled)}
              onChange={(event) => updateAdjustments({ bwEnabled: event.currentTarget.checked })}
            />
          </label>
          {BW_MIX_ROWS.map((item) => (
            <EditorSliderRow
              key={`bw-${item.key}`}
              label={item.label}
              value={bwMix[item.key]}
              defaultValue={0}
              min={-100}
              max={100}
              step={1}
              disabled={!adjustments.bwEnabled}
              format={(value) => (value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`)}
              onChange={(value) => previewBwMixValue(item.key, Math.round(value))}
              onCommit={(value) => commitBwMixValue(item.key, Math.round(value))}
              onReset={() => commitBwMixValue(item.key, 0)}
            />
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/55 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Calibration</p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() =>
                commitAdjustmentPatch("calibration:reset", {
                  calibration: {
                    redHue: 0,
                    redSaturation: 0,
                    greenHue: 0,
                    greenSaturation: 0,
                    blueHue: 0,
                    blueSaturation: 0,
                  },
                })
              }
            >
              Reset
            </Button>
          </div>
          {CALIBRATION_ROWS.map((item) => (
            <EditorSliderRow
              key={`calibration-${item.key}`}
              label={item.label}
              value={calibration[item.key]}
              defaultValue={0}
              min={-100}
              max={100}
              step={1}
              format={(value) => (value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`)}
              onChange={(value) => previewCalibrationValue(item.key, Math.round(value))}
              onCommit={(value) => commitCalibrationValue(item.key, Math.round(value))}
              onReset={() => commitCalibrationValue(item.key, 0)}
            />
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/55 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">色彩分级</p>
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
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">光学校正</p>
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
                校正边缘色差并减少高反差区域的彩边伪影。
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
              <span className="block">启用镜头配置文件校正</span>
              <span className="block text-[11px] text-slate-500">
                修正桶形/枕形畸变并提升边缘暗角亮度。
              </span>
            </span>
          </label>
          <EditorSliderRow
            label="Lens Vignette Correction"
            value={adjustments.opticsVignette}
            defaultValue={DEFAULT_ADJUSTMENTS.opticsVignette}
            min={0}
            max={100}
            step={1}
            disabled={!adjustments.opticsProfile}
            onChange={(value) => previewAdjustmentValue("opticsVignette", Math.round(value))}
            onCommit={(value) => updateAdjustmentValue("opticsVignette", Math.round(value))}
            onReset={() =>
              updateAdjustmentValue("opticsVignette", DEFAULT_ADJUSTMENTS.opticsVignette)
            }
          />
        </div>

        <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950/55 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">胶片模块覆盖</p>
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
            hint="Local adjustments"
            isOpen={openSections.mask}
            onToggle={() => toggleSection("mask")}
          >
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-300">
              Select an image to start creating local masks.
            </div>
          </EditorSection>
        );
      }
      if (sectionId === "remove") {
        return (
          <EditorSection
            title="移除"
            hint="内容感知修复"
            isOpen={openSections.remove}
            onToggle={() => toggleSection("remove")}
          >
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-300">
              后续将提供污点移除、修补和对象擦除能力。
            </div>
          </EditorSection>
        );
      }
      if (sectionId === "ai") {
        return (
          <EditorSection
            title="AI"
            hint="智能建议"
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
              <p className="text-xs text-slate-400">AI adjustments are coming soon.</p>
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
            hint="光线 / 白平衡 / 色彩"
            isOpen={openSections.basic}
            onToggle={() => toggleSection("basic")}
          >
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">光线</p>
              {renderSliderRows(
                adjustments,
                BASIC_LIGHT_SLIDERS,
                previewAdjustmentValue,
                updateAdjustmentValue
              )}

              <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">White Balance</p>
              <div className="space-y-2">
                <p className="text-xs text-slate-300">
                  {whiteBalanceMode === "relative" ? "预设模式" : "模式"}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant={whiteBalanceMode === "relative" ? "default" : "secondary"}
                    onClick={() => handleWhiteBalanceModeChange("relative")}
                  >
                    Relative
                  </Button>
                  <Button
                    size="sm"
                    variant={whiteBalanceMode === "absolute" ? "default" : "secondary"}
                    onClick={() => handleWhiteBalanceModeChange("absolute")}
                  >
                    Absolute
                  </Button>
                </div>
                {whiteBalanceMode === "relative" ? (
                  <Select value={whiteBalancePresetId} onValueChange={handleWhiteBalancePresetChange}>
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
                ) : (
                  <>
                    <EditorSliderRow
                      label="Kelvin"
                      value={absoluteTemperatureKelvin}
                      defaultValue={ABSOLUTE_WHITE_BALANCE_DEFAULT_KELVIN}
                      min={1800}
                      max={50000}
                      step={50}
                      format={(value) => `${Math.round(value)}K`}
                      onChange={(value) =>
                        previewAdjustmentValue("temperatureKelvin", Math.round(value))
                      }
                      onCommit={(value) =>
                        updateAdjustmentValue("temperatureKelvin", Math.round(value))
                      }
                      onReset={() =>
                        updateAdjustmentValue(
                          "temperatureKelvin",
                          ABSOLUTE_WHITE_BALANCE_DEFAULT_KELVIN
                        )
                      }
                    />
                    <EditorSliderRow
                      label="Tint (M/G)"
                      value={absoluteTintMG}
                      defaultValue={ABSOLUTE_WHITE_BALANCE_DEFAULT_TINT_MG}
                      min={-100}
                      max={100}
                      step={1}
                      format={(value) =>
                        value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`
                      }
                      onChange={(value) => previewAdjustmentValue("tintMG", Math.round(value))}
                      onCommit={(value) => updateAdjustmentValue("tintMG", Math.round(value))}
                      onReset={() =>
                        updateAdjustmentValue("tintMG", ABSOLUTE_WHITE_BALANCE_DEFAULT_TINT_MG)
                      }
                    />
                  </>
                )}
              </div>

              <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">色彩</p>
              {renderSliderRows(
                adjustments,
                basicColorSliders,
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
            hint="纹理 / 清晰度 / 去朦胧 / 颗粒"
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
            hint="锐化 / 降噪 / 蒙版"
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
            hint="时间戳文字覆盖"
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
              label="字体大小"
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
                updateAdjustmentValue("timestampOpacity", DEFAULT_ADJUSTMENTS.timestampOpacity)
              }
            />
          </EditorSection>
        );

      case "advanced":
        return (
          <EditorSection
            title="高级"
            hint="曲线 / HSL / 色彩分级 / 光学校正 / 胶片模块"
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
            onRequestAutoPerspective={requestAutoPerspective}
          />
        );

      case "mask":
        return (
          <EditorSection
            title="Mask"
            hint="Local adjustments"
            isOpen={openSections.mask}
            onToggle={() => toggleSection("mask")}
          >
            {renderLocalAdjustmentsPanel()}
          </EditorSection>
        );

      case "remove":
        return (
          <EditorSection
            title="移除"
            hint="内容感知修复"
            isOpen={openSections.remove}
            onToggle={() => toggleSection("remove")}
          >
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-300">
              后续将提供污点移除、修补和对象擦除能力。
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
        title="重置胶片模块覆盖"
        description="Reset all film module overrides and restore defaults?"
        onConfirm={handleResetFilmOverrides}
      />
    </div>
  );
});

export const EditorAdjustmentPanel = memo(function EditorAdjustmentPanel() {
  const { activeToolPanelId } = useEditorState();
  return <EditorInspectorContent panelId={activeToolPanelId} />;
});

