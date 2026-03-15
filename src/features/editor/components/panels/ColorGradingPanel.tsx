import { memo } from "react";
import { EditorSection } from "@/features/editor/EditorSection";
import { SliderControl } from "@/features/editor/components/controls/SliderControl";
import type { EditingAdjustments } from "@/types";

interface ColorGradingPanelProps {
  adjustments: EditingAdjustments;
  isOpen: boolean;
  onToggle: () => void;
  onPreviewZone: (
    zone: "shadows" | "midtones" | "highlights",
    value: EditingAdjustments["colorGrading"]["shadows"]
  ) => void;
  onCommitZone: (
    zone: "shadows" | "midtones" | "highlights",
    value: EditingAdjustments["colorGrading"]["shadows"]
  ) => void;
  onPreviewValue: (key: "blend" | "balance", value: number) => void;
  onCommitValue: (key: "blend" | "balance", value: number) => void;
  hasChanges?: boolean;
  onResetChanges?: () => void;
}

const GRADING_ZONES = [
  { id: "shadows", label: "Shadows" },
  { id: "midtones", label: "Midtones" },
  { id: "highlights", label: "Highlights" },
] as const;

export const ColorGradingPanel = memo(function ColorGradingPanel({
  adjustments,
  isOpen,
  onToggle,
  onPreviewZone,
  onCommitZone,
  onPreviewValue,
  onCommitValue,
  hasChanges,
  onResetChanges,
}: ColorGradingPanelProps) {
  return (
    <EditorSection
      title="Color Grading"
      isOpen={isOpen}
      onToggle={onToggle}
      hasChanges={hasChanges}
      canResetChanges={hasChanges}
      onResetChanges={onResetChanges}
    >
      <div className="space-y-3">
        {GRADING_ZONES.map((zone) => {
          const value = adjustments.colorGrading[zone.id];
          return (
            <div
              key={zone.id}
              className="space-y-2 rounded-xl border border-white/10 bg-[#0f1114]/70 p-3"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">{zone.label}</p>
              <SliderControl
                label="Hue"
                value={value.hue}
                defaultValue={0}
                min={0}
                max={360}
                step={1}
                format={(next) => `${Math.round(next)}°`}
                onChange={(next) => onPreviewZone(zone.id, { ...value, hue: next })}
                onCommit={(next) => onCommitZone(zone.id, { ...value, hue: next })}
                onReset={() => onCommitZone(zone.id, { ...value, hue: 0 })}
              />
              <SliderControl
                label="Saturation"
                value={value.saturation}
                defaultValue={0}
                min={0}
                max={100}
                step={1}
                onChange={(next) => onPreviewZone(zone.id, { ...value, saturation: next })}
                onCommit={(next) => onCommitZone(zone.id, { ...value, saturation: next })}
                onReset={() => onCommitZone(zone.id, { ...value, saturation: 0 })}
              />
              <SliderControl
                label="Luminance"
                value={value.luminance}
                defaultValue={0}
                min={-100}
                max={100}
                step={1}
                onChange={(next) => onPreviewZone(zone.id, { ...value, luminance: next })}
                onCommit={(next) => onCommitZone(zone.id, { ...value, luminance: next })}
                onReset={() => onCommitZone(zone.id, { ...value, luminance: 0 })}
              />
            </div>
          );
        })}

        <SliderControl
          label="Blend"
          value={adjustments.colorGrading.blend}
          defaultValue={50}
          min={0}
          max={100}
          step={1}
          onChange={(value) => onPreviewValue("blend", value)}
          onCommit={(value) => onCommitValue("blend", value)}
          onReset={() => onCommitValue("blend", 50)}
        />
        <SliderControl
          label="Balance"
          value={adjustments.colorGrading.balance}
          defaultValue={0}
          min={-100}
          max={100}
          step={1}
          onChange={(value) => onPreviewValue("balance", value)}
          onCommit={(value) => onCommitValue("balance", value)}
          onReset={() => onCommitValue("balance", 0)}
        />
      </div>
    </EditorSection>
  );
});
