import { memo } from "react";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { OPTICS_SLIDERS, type SliderDefinition } from "@/features/editor/editorPanelConfig";
import type { NumericAdjustmentKey } from "@/features/editor/types";
import { EditorSection } from "@/features/editor/EditorSection";
import { SliderControl } from "@/features/editor/components/controls/SliderControl";
import type { EditingAdjustments } from "@/types";

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();

interface OpticsPanelProps {
  adjustments: EditingAdjustments;
  isOpen: boolean;
  onToggle: () => void;
  onUpdateAdjustments: (patch: Partial<EditingAdjustments>) => void;
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

export const OpticsPanel = memo(function OpticsPanel({
  adjustments,
  isOpen,
  onToggle,
  onUpdateAdjustments,
  onPreviewAdjustmentValue,
  onCommitAdjustmentValue,
  hasChanges,
  onResetChanges,
}: OpticsPanelProps) {
  return (
    <EditorSection
      title="Optics"
      isOpen={isOpen}
      onToggle={onToggle}
      hasChanges={hasChanges}
      canResetChanges={hasChanges}
      onResetChanges={onResetChanges}
    >
      <div className="space-y-3">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0f1114]/70 px-3 py-2 text-xs text-zinc-200">
          <span>Lens Profile</span>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-white/20 bg-[#0f1114] accent-white"
            checked={adjustments.opticsProfile}
            onChange={(event) =>
              onUpdateAdjustments({
                opticsProfile: event.currentTarget.checked,
              })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0f1114]/70 px-3 py-2 text-xs text-zinc-200">
          <span>Chromatic Aberration Correction</span>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-white/20 bg-[#0f1114] accent-white"
            checked={adjustments.opticsCA}
            onChange={(event) =>
              onUpdateAdjustments({
                opticsCA: event.currentTarget.checked,
              })
            }
          />
        </label>

        {renderSliderRows(
          adjustments,
          OPTICS_SLIDERS,
          onPreviewAdjustmentValue,
          onCommitAdjustmentValue
        )}
      </div>
    </EditorSection>
  );
});
