import { memo } from "react";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { CURVE_TONE_SLIDERS, type SliderDefinition } from "@/features/editor/editorPanelConfig";
import type { NumericAdjustmentKey } from "@/features/editor/types";
import { EditorSection } from "@/features/editor/EditorSection";
import { SliderControl } from "@/features/editor/components/controls/SliderControl";
import type { EditingAdjustments } from "@/types";

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();

interface CurvePanelProps {
  adjustments: EditingAdjustments;
  isOpen: boolean;
  onToggle: () => void;
  onPreviewAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void;
  onCommitAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void;
  hasChanges?: boolean;
  onResetChanges?: () => void;
}

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

export const CurvePanel = memo(function CurvePanel({
  adjustments,
  isOpen,
  onToggle,
  onPreviewAdjustmentValue,
  onCommitAdjustmentValue,
  hasChanges,
  onResetChanges,
}: CurvePanelProps) {
  return (
    <EditorSection
      title="Curve"
      isOpen={isOpen}
      onToggle={onToggle}
      hasChanges={hasChanges}
      canResetChanges={hasChanges}
      onResetChanges={onResetChanges}
    >
      <div className="space-y-2">
        <p className="text-xs text-zinc-400">
          Tone curve control is exposed here as highlight, light, dark, and shadow shaping.
        </p>
        {renderSliderRows(
          adjustments,
          CURVE_TONE_SLIDERS,
          onPreviewAdjustmentValue,
          onCommitAdjustmentValue
        )}
      </div>
    </EditorSection>
  );
});
