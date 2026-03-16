import { memo } from "react";
import { Pipette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HSL_COLOR_OPTIONS } from "@/features/editor/editorPanelConfig";
import { EditorSection } from "@/features/editor/EditorSection";
import { SliderControl } from "@/features/editor/components/controls/SliderControl";
import type { EditingAdjustments, HslColorKey } from "@/types";

interface HslPanelProps {
  adjustments: EditingAdjustments;
  activeColor: HslColorKey;
  pointColorPicking: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onSetActiveColor: (color: HslColorKey) => void;
  onStartPointColorPick: () => void;
  onPreviewValue: (
    color: HslColorKey,
    channel: "hue" | "saturation" | "luminance",
    value: number
  ) => void;
  onCommitValue: (
    color: HslColorKey,
    channel: "hue" | "saturation" | "luminance",
    value: number
  ) => void;
  hasChanges?: boolean;
  onResetChanges?: () => void;
}

export const HslPanel = memo(function HslPanel({
  adjustments,
  activeColor,
  pointColorPicking,
  isOpen,
  onToggle,
  onSetActiveColor,
  onStartPointColorPick,
  onPreviewValue,
  onCommitValue,
  hasChanges,
  onResetChanges,
}: HslPanelProps) {
  const channel = adjustments.hsl[activeColor];

  return (
    <EditorSection
      title="HSL"
      isOpen={isOpen}
      onToggle={onToggle}
      hasChanges={hasChanges}
      canResetChanges={hasChanges}
      onResetChanges={onResetChanges}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {HSL_COLOR_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                activeColor === option.id
                  ? "border-white/35 bg-white/10 text-white"
                  : "border-white/10 bg-[#0f1114]/80 text-zinc-300 hover:border-white/20"
              }`}
              onClick={() => onSetActiveColor(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <Button
          type="button"
          size="sm"
          variant={pointColorPicking ? "default" : "secondary"}
          className="w-full justify-center"
          onClick={onStartPointColorPick}
        >
          <Pipette className="h-4 w-4" />
          {pointColorPicking ? "Sampling from Preview" : "Pick Color from Preview"}
        </Button>

        <SliderControl
          label="Hue"
          value={channel.hue}
          defaultValue={0}
          min={-100}
          max={100}
          step={1}
          onChange={(value) => onPreviewValue(activeColor, "hue", value)}
          onCommit={(value) => onCommitValue(activeColor, "hue", value)}
          onReset={() => onCommitValue(activeColor, "hue", 0)}
        />
        <SliderControl
          label="Saturation"
          value={channel.saturation}
          defaultValue={0}
          min={-100}
          max={100}
          step={1}
          onChange={(value) => onPreviewValue(activeColor, "saturation", value)}
          onCommit={(value) => onCommitValue(activeColor, "saturation", value)}
          onReset={() => onCommitValue(activeColor, "saturation", 0)}
        />
        <SliderControl
          label="Luminance"
          value={channel.luminance}
          defaultValue={0}
          min={-100}
          max={100}
          step={1}
          onChange={(value) => onPreviewValue(activeColor, "luminance", value)}
          onCommit={(value) => onCommitValue(activeColor, "luminance", value)}
          onReset={() => onCommitValue(activeColor, "luminance", 0)}
        />
      </div>
    </EditorSection>
  );
});
