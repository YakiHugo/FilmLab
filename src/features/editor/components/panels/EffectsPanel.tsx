import { memo } from "react";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { EditingAdjustments } from "@/types";
import {
  EFFECTS_SLIDERS,
  GLOW_SLIDERS,
  type SliderDefinition,
} from "@/features/editor/editorPanelConfig";
import type { NumericAdjustmentKey } from "@/features/editor/types";
import { EditorSection } from "@/features/editor/EditorSection";
import { SliderControl } from "@/features/editor/components/controls/SliderControl";

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();

interface EffectsPanelProps {
  adjustments: EditingAdjustments;
  isOpen: boolean;
  onToggle: () => void;
  onUpdateAdjustments: (patch: Partial<EditingAdjustments>) => void;
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

export const EffectsPanel = memo(function EffectsPanel({
  adjustments,
  isOpen,
  onToggle,
  onUpdateAdjustments,
  onPreviewAdjustmentValue,
  onCommitAdjustmentValue,
  hasChanges,
  changesVisible,
  onToggleVisibility,
  onResetChanges,
}: EffectsPanelProps) {
  const customLut = adjustments.customLut ?? {
    enabled: false,
    path: "",
    size: 8 as const,
    intensity: 0,
  };

  return (
    <EditorSection
      title="Effects"
      hint="Texture, clarity, dehaze, grain, and glow"
      isOpen={isOpen}
      onToggle={onToggle}
      hasChanges={hasChanges}
      changesVisible={changesVisible}
      onToggleVisibility={onToggleVisibility}
      onResetChanges={onResetChanges}
    >
      <div className="space-y-3">
        {renderSliderRows(
          adjustments,
          EFFECTS_SLIDERS,
          onPreviewAdjustmentValue,
          onCommitAdjustmentValue
        )}

        <div className="space-y-2 rounded-xl border border-white/10 bg-[#0f1114]/70 p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Glow</p>
          {renderSliderRows(adjustments, GLOW_SLIDERS, onPreviewAdjustmentValue, onCommitAdjustmentValue)}
        </div>

        <div className="space-y-2 rounded-xl border border-white/10 bg-[#0f1114]/70 p-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-zinc-200">
            <span>Enable Custom LUT</span>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-white/20 bg-[#0f1114] accent-white"
              checked={customLut.enabled}
              onChange={(event) =>
                onUpdateAdjustments({
                  customLut: {
                    ...customLut,
                    enabled: event.currentTarget.checked,
                  },
                })
              }
            />
          </label>
          <input
            value={customLut.path}
            onChange={(event) =>
              onUpdateAdjustments({
                customLut: {
                  ...customLut,
                  path: event.currentTarget.value,
                },
              })
            }
            placeholder="/luts/my-look.cube or /luts/my-look.png"
            className="h-8 w-full rounded-md border border-white/10 bg-[#0f1114]/80 px-2 text-xs text-zinc-100 placeholder:text-zinc-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`h-8 rounded-md border px-2 text-xs transition ${
                customLut.size === 8
                  ? "border-white/35 bg-white/10 text-white"
                  : "border-white/10 bg-[#0f1114]/80 text-zinc-200 hover:border-white/20"
              }`}
              onClick={() =>
                onUpdateAdjustments({
                  customLut: {
                    ...customLut,
                    size: 8,
                  },
                })
              }
            >
              LUT 8
            </button>
            <button
              type="button"
              className={`h-8 rounded-md border px-2 text-xs transition ${
                customLut.size === 16
                  ? "border-white/35 bg-white/10 text-white"
                  : "border-white/10 bg-[#0f1114]/80 text-zinc-200 hover:border-white/20"
              }`}
              onClick={() =>
                onUpdateAdjustments({
                  customLut: {
                    ...customLut,
                    size: 16,
                  },
                })
              }
            >
              LUT 16
            </button>
          </div>
          <SliderControl
            label="Custom LUT Intensity"
            value={Math.round(customLut.intensity * 100)}
            defaultValue={0}
            min={0}
            max={100}
            step={1}
            disabled={!customLut.enabled}
            onChange={(value) =>
              onUpdateAdjustments({
                customLut: {
                  ...customLut,
                  intensity: Math.max(0, Math.min(1, value / 100)),
                },
              })
            }
            onCommit={(value) =>
              onUpdateAdjustments({
                customLut: {
                  ...customLut,
                  intensity: Math.max(0, Math.min(1, value / 100)),
                },
              })
            }
            onReset={() =>
              onUpdateAdjustments({
                customLut: {
                  ...customLut,
                  intensity: 0,
                },
              })
            }
          />
        </div>
      </div>
    </EditorSection>
  );
});


