import { memo } from "react";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { EditingAdjustments } from "@/types";
import { DETAIL_SLIDERS, type SliderDefinition } from "@/features/editor/editorPanelConfig";
import type { NumericAdjustmentKey } from "@/features/editor/types";
import { EditorSection } from "@/features/editor/EditorSection";
import { SliderControl } from "@/features/editor/components/controls/SliderControl";

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();

interface DetailPanelProps {
  adjustments: EditingAdjustments;
  isOpen: boolean;
  onToggle: () => void;
  onPreviewAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void;
  onCommitAdjustmentValue: (key: NumericAdjustmentKey, value: number) => void;
  hasChanges?: boolean;
  changesVisible?: boolean;
  onToggleVisibility?: () => void;
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

export const DetailPanel = memo(function DetailPanel({
  adjustments,
  isOpen,
  onToggle,
  onPreviewAdjustmentValue,
  onCommitAdjustmentValue,
  hasChanges,
  changesVisible,
  onToggleVisibility,
  onResetChanges,
}: DetailPanelProps) {
  return (
    <EditorSection
      title="Detail"
      hint="Sharpening and noise reduction"
      isOpen={isOpen}
      onToggle={onToggle}
      hasChanges={hasChanges}
      changesVisible={changesVisible}
      onToggleVisibility={onToggleVisibility}
      onResetChanges={onResetChanges}
    >
      {renderSliderRows(adjustments, DETAIL_SLIDERS, onPreviewAdjustmentValue, onCommitAdjustmentValue)}
    </EditorSection>
  );
});

