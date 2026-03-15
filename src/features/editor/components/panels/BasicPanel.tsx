import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { EditingAdjustments } from "@/types";
import {
  BASIC_COLOR_SLIDERS,
  BASIC_LIGHT_SLIDERS,
  WHITE_BALANCE_PRESETS,
  type SliderDefinition,
} from "@/features/editor/editorPanelConfig";
import type { NumericAdjustmentKey } from "@/features/editor/types";
import { EditorSection } from "@/features/editor/EditorSection";
import { SliderControl } from "@/features/editor/components/controls/SliderControl";

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();
const WHITE_BALANCE_CUSTOM_KEY = "__custom__";
const ABSOLUTE_WHITE_BALANCE_DEFAULT_KELVIN = 6500;
const ABSOLUTE_WHITE_BALANCE_DEFAULT_TINT_MG = 0;

interface BasicPanelProps {
  adjustments: EditingAdjustments;
  isOpen: boolean;
  onToggle: () => void;
  onUpdateAdjustments: (patch: Partial<EditingAdjustments>) => void;
  onPreviewAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void;
  onCommitAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void;
  hasChanges?: boolean;
  changesVisible?: boolean;
  canToggleVisibility?: boolean;
  canResetChanges?: boolean;
  onToggleVisibility?: () => void;
  onResetChanges?: () => void;
}

const resolveWhiteBalancePresetId = (temperature: number, tint: number) => {
  const preset = WHITE_BALANCE_PRESETS.find(
    (item) => item.temperature === temperature && item.tint === tint
  );
  return preset?.id ?? WHITE_BALANCE_CUSTOM_KEY;
};

const renderSliderRows = (
  adjustments: EditingAdjustments,
  sliders: SliderDefinition[],
  onPreviewAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void,
  onCommitAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void
) =>
  sliders.map((slider) => (
    <SliderControl
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

export const BasicPanel = memo(function BasicPanel({
  adjustments,
  isOpen,
  onToggle,
  onUpdateAdjustments,
  onPreviewAdjustmentValue,
  onCommitAdjustmentValue,
  hasChanges,
  changesVisible,
  canToggleVisibility,
  canResetChanges,
  onToggleVisibility,
  onResetChanges,
}: BasicPanelProps) {
  const hasAbsoluteWhiteBalance =
    Number.isFinite(adjustments.temperatureKelvin ?? NaN) || Number.isFinite(adjustments.tintMG ?? NaN);
  const whiteBalanceMode: "relative" | "absolute" = hasAbsoluteWhiteBalance ? "absolute" : "relative";
  const basicColorSliders =
    whiteBalanceMode === "absolute"
      ? BASIC_COLOR_SLIDERS.filter((slider) => slider.key !== "temperature" && slider.key !== "tint")
      : BASIC_COLOR_SLIDERS;
  const absoluteTemperatureKelvin = Number.isFinite(adjustments.temperatureKelvin ?? NaN)
    ? (adjustments.temperatureKelvin as number)
    : ABSOLUTE_WHITE_BALANCE_DEFAULT_KELVIN;
  const absoluteTintMG = Number.isFinite(adjustments.tintMG ?? NaN)
    ? (adjustments.tintMG as number)
    : ABSOLUTE_WHITE_BALANCE_DEFAULT_TINT_MG;
  const whiteBalancePresetId = resolveWhiteBalancePresetId(adjustments.temperature, adjustments.tint);

  const handleWhiteBalancePresetChange = (presetId: string) => {
    if (presetId === WHITE_BALANCE_CUSTOM_KEY) {
      return;
    }
    const preset = WHITE_BALANCE_PRESETS.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    onUpdateAdjustments({
      temperature: preset.temperature,
      tint: preset.tint,
      temperatureKelvin: undefined,
      tintMG: undefined,
    });
  };

  const handleWhiteBalanceModeChange = (nextMode: "relative" | "absolute") => {
    if (nextMode === "absolute") {
      onUpdateAdjustments({
        temperature: 0,
        tint: 0,
        temperatureKelvin: absoluteTemperatureKelvin,
        tintMG: absoluteTintMG,
      });
      return;
    }
    onUpdateAdjustments({
      temperatureKelvin: undefined,
      tintMG: undefined,
    });
  };

  return (
    <EditorSection
      title="Basic"
      hint="Light, white balance, and color"
      isOpen={isOpen}
      onToggle={onToggle}
      hasChanges={hasChanges}
      changesVisible={changesVisible}
      canToggleVisibility={canToggleVisibility}
      canResetChanges={canResetChanges}
      onToggleVisibility={onToggleVisibility}
      onResetChanges={onResetChanges}
    >
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Light</p>
        {renderSliderRows(
          adjustments,
          BASIC_LIGHT_SLIDERS,
          onPreviewAdjustmentValue,
          onCommitAdjustmentValue
        )}

        <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">White Balance</p>
        <div className="space-y-2">
          <p className="text-xs text-slate-300">{whiteBalanceMode === "relative" ? "Preset mode" : "Mode"}</p>
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
              <SliderControl
                label="Kelvin"
                value={absoluteTemperatureKelvin}
                defaultValue={ABSOLUTE_WHITE_BALANCE_DEFAULT_KELVIN}
                min={1800}
                max={50000}
                step={50}
                format={(value) => `${Math.round(value)}K`}
                onChange={(value) => onPreviewAdjustmentValue("temperatureKelvin", Math.round(value))}
                onCommit={(value) => onCommitAdjustmentValue("temperatureKelvin", Math.round(value))}
                onReset={() =>
                  onCommitAdjustmentValue("temperatureKelvin", ABSOLUTE_WHITE_BALANCE_DEFAULT_KELVIN)
                }
              />
              <SliderControl
                label="Tint (M/G)"
                value={absoluteTintMG}
                defaultValue={ABSOLUTE_WHITE_BALANCE_DEFAULT_TINT_MG}
                min={-100}
                max={100}
                step={1}
                format={(value) => (value > 0 ? `+${Math.round(value)}` : `${Math.round(value)}`)}
                onChange={(value) => onPreviewAdjustmentValue("tintMG", Math.round(value))}
                onCommit={(value) => onCommitAdjustmentValue("tintMG", Math.round(value))}
                onReset={() =>
                  onCommitAdjustmentValue("tintMG", ABSOLUTE_WHITE_BALANCE_DEFAULT_TINT_MG)
                }
              />
            </>
          )}
        </div>

        <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-500">Color</p>
        {renderSliderRows(
          adjustments,
          basicColorSliders,
          onPreviewAdjustmentValue,
          onCommitAdjustmentValue
        )}
      </div>
    </EditorSection>
  );
});
