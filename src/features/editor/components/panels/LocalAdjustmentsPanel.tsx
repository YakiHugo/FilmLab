import { memo } from "react";
import { Copy, MoveDown, MoveUp, Paintbrush, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditorSection } from "@/features/editor/EditorSection";
import { SliderControl } from "@/features/editor/components/controls/SliderControl";
import type { LocalAdjustment, LocalAdjustmentMask } from "@/types";

type MaskMode = LocalAdjustmentMask["mode"];

interface LocalAdjustmentsPanelProps {
  localAdjustments: LocalAdjustment[];
  selectedLocalAdjustment: LocalAdjustment | null;
  selectedLocalAdjustmentId: string | null;
  isOpen: boolean;
  onToggle: () => void;
  onAddLocalAdjustment: (mode: MaskMode) => void;
  onDuplicateLocalAdjustment: (localId: string) => void;
  onRemoveLocalAdjustment: (localId: string) => void;
  onSelectLocalAdjustment: (localId: string | null) => void;
  onReorderLocalAdjustment: (localId: string, direction: "up" | "down") => void;
  onSetLocalAdjustmentEnabled: (localId: string, enabled: boolean) => void;
  onSetLocalMaskMode: (localId: string, mode: MaskMode) => void;
  onPreviewLocalAdjustmentAmount: (localId: string, amount: number) => void;
  onCommitLocalAdjustmentAmount: (localId: string, amount: number) => void;
  onPreviewLocalAdjustmentDelta: (
    localId: string,
    patch: Partial<LocalAdjustment["adjustments"]>
  ) => void;
  onCommitLocalAdjustmentDelta: (
    localId: string,
    patch: Partial<LocalAdjustment["adjustments"]>
  ) => void;
  onUpdateLocalMask: (
    localId: string,
    updater: LocalAdjustmentMask | ((currentMask: LocalAdjustmentMask) => LocalAdjustmentMask),
    options?: { historyKey?: string; mode?: "preview" | "commit" }
  ) => void;
  onActivateMaskTool: () => void;
  hasChanges?: boolean;
  onResetChanges?: () => void;
}

const MASK_MODE_OPTIONS: Array<{ value: MaskMode; label: string }> = [
  { value: "radial", label: "Radial" },
  { value: "linear", label: "Linear" },
  { value: "brush", label: "Brush" },
] as const;

const DELTA_SLIDERS: Array<{
  key: keyof LocalAdjustment["adjustments"];
  label: string;
  min: number;
  max: number;
}> = [
  { key: "exposure", label: "Exposure", min: -100, max: 100 },
  { key: "contrast", label: "Contrast", min: -100, max: 100 },
  { key: "highlights", label: "Highlights", min: -100, max: 100 },
  { key: "shadows", label: "Shadows", min: -100, max: 100 },
  { key: "temperature", label: "Temperature", min: -100, max: 100 },
  { key: "tint", label: "Tint", min: -100, max: 100 },
  { key: "vibrance", label: "Vibrance", min: -100, max: 100 },
  { key: "saturation", label: "Saturation", min: -100, max: 100 },
  { key: "texture", label: "Texture", min: -100, max: 100 },
  { key: "clarity", label: "Clarity", min: -100, max: 100 },
  { key: "dehaze", label: "Dehaze", min: -100, max: 100 },
  { key: "sharpening", label: "Sharpening", min: 0, max: 100 },
  { key: "noiseReduction", label: "Noise Reduction", min: 0, max: 100 },
  { key: "colorNoiseReduction", label: "Color Noise Reduction", min: 0, max: 100 },
];

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const updateMaskPreview = (
  localId: string,
  onUpdateLocalMask: LocalAdjustmentsPanelProps["onUpdateLocalMask"],
  historyKey: string,
  updater: (currentMask: LocalAdjustmentMask) => LocalAdjustmentMask
) => {
  onUpdateLocalMask(localId, updater, { historyKey, mode: "preview" });
};

const commitMask = (
  localId: string,
  onUpdateLocalMask: LocalAdjustmentsPanelProps["onUpdateLocalMask"],
  historyKey: string,
  updater: (currentMask: LocalAdjustmentMask) => LocalAdjustmentMask
) => {
  onUpdateLocalMask(localId, updater, { historyKey });
};

export const LocalAdjustmentsPanel = memo(function LocalAdjustmentsPanel({
  localAdjustments,
  selectedLocalAdjustment,
  selectedLocalAdjustmentId,
  isOpen,
  onToggle,
  onAddLocalAdjustment,
  onDuplicateLocalAdjustment,
  onRemoveLocalAdjustment,
  onSelectLocalAdjustment,
  onReorderLocalAdjustment,
  onSetLocalAdjustmentEnabled,
  onSetLocalMaskMode,
  onPreviewLocalAdjustmentAmount,
  onCommitLocalAdjustmentAmount,
  onPreviewLocalAdjustmentDelta,
  onCommitLocalAdjustmentDelta,
  onUpdateLocalMask,
  onActivateMaskTool,
  hasChanges,
  onResetChanges,
}: LocalAdjustmentsPanelProps) {
  const selectedId = selectedLocalAdjustment?.id ?? null;

  return (
    <EditorSection
      title="Local Adjustments"
      isOpen={isOpen}
      onToggle={onToggle}
      hasChanges={hasChanges}
      canResetChanges={hasChanges}
      onResetChanges={onResetChanges}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {MASK_MODE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onAddLocalAdjustment(option.value)}
            >
              <Plus className="h-3.5 w-3.5" />
              {option.label}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          {localAdjustments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 bg-[#0f1114]/70 p-3 text-xs text-zinc-500">
              Add a radial, linear, or brush adjustment to begin a local edit.
            </div>
          ) : (
            localAdjustments.map((local, index) => (
              <button
                key={local.id}
                type="button"
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  selectedLocalAdjustmentId === local.id
                    ? "border-white/30 bg-white/10"
                    : "border-white/10 bg-[#0f1114]/70 hover:border-white/20"
                }`}
                onClick={() => onSelectLocalAdjustment(local.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-zinc-100">
                      {index + 1}. {local.mask.mode[0].toUpperCase() + local.mask.mode.slice(1)}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Amount {Math.round(local.amount)} · {local.enabled ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-white/20 bg-[#0f1114] accent-white"
                    checked={local.enabled}
                    onChange={(event) => {
                      event.stopPropagation();
                      onSetLocalAdjustmentEnabled(local.id, event.currentTarget.checked);
                    }}
                  />
                </div>
              </button>
            ))
          )}
        </div>

        {selectedLocalAdjustment && selectedId ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => onDuplicateLocalAdjustment(selectedId)}>
                <Copy className="h-3.5 w-3.5" />
                Duplicate
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => onReorderLocalAdjustment(selectedId, "up")}>
                <MoveUp className="h-3.5 w-3.5" />
                Up
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => onReorderLocalAdjustment(selectedId, "down")}>
                <MoveDown className="h-3.5 w-3.5" />
                Down
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="text-rose-200 hover:bg-rose-500/20 hover:text-rose-100"
                onClick={() => onRemoveLocalAdjustment(selectedId)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>

            <div className="space-y-2 rounded-xl border border-white/10 bg-[#0f1114]/70 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Mask Type</label>
                  <Select
                    value={selectedLocalAdjustment.mask.mode}
                    onValueChange={(value: MaskMode) => onSetLocalMaskMode(selectedId, value)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MASK_MODE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full justify-center"
                    disabled={selectedLocalAdjustment.mask.mode !== "brush"}
                    onClick={onActivateMaskTool}
                  >
                    <Paintbrush className="h-4 w-4" />
                    Paint in Preview
                  </Button>
                </div>
              </div>

              <SliderControl
                label="Amount"
                value={selectedLocalAdjustment.amount}
                defaultValue={100}
                min={0}
                max={100}
                step={1}
                onChange={(value) => onPreviewLocalAdjustmentAmount(selectedId, value)}
                onCommit={(value) => onCommitLocalAdjustmentAmount(selectedId, value)}
              />
            </div>

            <div className="space-y-2 rounded-xl border border-white/10 bg-[#0f1114]/70 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Mask Geometry</p>
              {selectedLocalAdjustment.mask.mode === "radial" && (
                <>
                  {(() => {
                    const radialMask = selectedLocalAdjustment.mask;
                    if (radialMask.mode !== "radial") {
                      return null;
                    }
                    return (
                      <>
                  {([
                    ["centerX", "Center X", 0.5],
                    ["centerY", "Center Y", 0.5],
                    ["radiusX", "Radius X", 0.3],
                    ["radiusY", "Radius Y", 0.3],
                    ["feather", "Feather", 0.45],
                  ] as const).map(([key, label, defaultValue]) => (
                    <SliderControl
                      key={key}
                      label={label}
                      value={radialMask[key]}
                      defaultValue={defaultValue}
                      min={0}
                      max={1}
                      step={0.01}
                      format={formatPercent}
                      onChange={(value) =>
                        updateMaskPreview(selectedId, onUpdateLocalMask, `${selectedId}:${key}`, (mask) =>
                          mask.mode === "radial" ? { ...mask, [key]: value } : mask
                        )
                      }
                      onCommit={(value) =>
                        commitMask(selectedId, onUpdateLocalMask, `${selectedId}:${key}`, (mask) =>
                          mask.mode === "radial" ? { ...mask, [key]: value } : mask
                        )
                      }
                    />
                  ))}
                      </>
                    );
                  })()}
                </>
              )}

              {selectedLocalAdjustment.mask.mode === "linear" && (
                <>
                  {(() => {
                    const linearMask = selectedLocalAdjustment.mask;
                    if (linearMask.mode !== "linear") {
                      return null;
                    }
                    return (
                      <>
                  {([
                    ["startX", "Start X", 0.5],
                    ["startY", "Start Y", 0.2],
                    ["endX", "End X", 0.5],
                    ["endY", "End Y", 0.8],
                    ["feather", "Feather", 0.4],
                  ] as const).map(([key, label, defaultValue]) => (
                    <SliderControl
                      key={key}
                      label={label}
                      value={linearMask[key]}
                      defaultValue={defaultValue}
                      min={0}
                      max={1}
                      step={0.01}
                      format={formatPercent}
                      onChange={(value) =>
                        updateMaskPreview(selectedId, onUpdateLocalMask, `${selectedId}:${key}`, (mask) =>
                          mask.mode === "linear" ? { ...mask, [key]: value } : mask
                        )
                      }
                      onCommit={(value) =>
                        commitMask(selectedId, onUpdateLocalMask, `${selectedId}:${key}`, (mask) =>
                          mask.mode === "linear" ? { ...mask, [key]: value } : mask
                        )
                      }
                    />
                  ))}
                      </>
                    );
                  })()}
                </>
              )}

              {selectedLocalAdjustment.mask.mode === "brush" && (
                <>
                  <SliderControl
                    label="Brush Size"
                    value={selectedLocalAdjustment.mask.brushSize}
                    defaultValue={0.08}
                    min={0.005}
                    max={0.25}
                    step={0.005}
                    format={formatPercent}
                    onChange={(value) =>
                      updateMaskPreview(selectedId, onUpdateLocalMask, `${selectedId}:brushSize`, (mask) =>
                        mask.mode === "brush" ? { ...mask, brushSize: value } : mask
                      )
                    }
                    onCommit={(value) =>
                      commitMask(selectedId, onUpdateLocalMask, `${selectedId}:brushSize`, (mask) =>
                        mask.mode === "brush" ? { ...mask, brushSize: value } : mask
                      )
                    }
                  />
                  <SliderControl
                    label="Feather"
                    value={selectedLocalAdjustment.mask.feather}
                    defaultValue={0.55}
                    min={0}
                    max={1}
                    step={0.01}
                    format={formatPercent}
                    onChange={(value) =>
                      updateMaskPreview(selectedId, onUpdateLocalMask, `${selectedId}:brushFeather`, (mask) =>
                        mask.mode === "brush" ? { ...mask, feather: value } : mask
                      )
                    }
                    onCommit={(value) =>
                      commitMask(selectedId, onUpdateLocalMask, `${selectedId}:brushFeather`, (mask) =>
                        mask.mode === "brush" ? { ...mask, feather: value } : mask
                      )
                    }
                  />
                  <SliderControl
                    label="Flow"
                    value={selectedLocalAdjustment.mask.flow}
                    defaultValue={0.85}
                    min={0.05}
                    max={1}
                    step={0.01}
                    format={formatPercent}
                    onChange={(value) =>
                      updateMaskPreview(selectedId, onUpdateLocalMask, `${selectedId}:brushFlow`, (mask) =>
                        mask.mode === "brush" ? { ...mask, flow: value } : mask
                      )
                    }
                    onCommit={(value) =>
                      commitMask(selectedId, onUpdateLocalMask, `${selectedId}:brushFlow`, (mask) =>
                        mask.mode === "brush" ? { ...mask, flow: value } : mask
                      )
                    }
                  />
                </>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-white/10 bg-[#0f1114]/70 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Mask Range</p>
              {([
                ["lumaMin", "Luma Min", 0, 0, 1, 0.01, formatPercent],
                ["lumaMax", "Luma Max", 1, 0, 1, 0.01, formatPercent],
                ["lumaFeather", "Luma Feather", 0, 0, 1, 0.01, formatPercent],
                ["hueCenter", "Hue Center", 0, 0, 360, 1, (value: number) => `${Math.round(value)}°`],
                ["hueRange", "Hue Range", 180, 0, 180, 1, (value: number) => `${Math.round(value)}°`],
                ["hueFeather", "Hue Feather", 0, 0, 180, 1, (value: number) => `${Math.round(value)}°`],
                ["satMin", "Saturation Threshold", 0, 0, 1, 0.01, formatPercent],
                ["satFeather", "Saturation Feather", 0, 0, 1, 0.01, formatPercent],
              ] as const).map(([key, label, defaultValue, min, max, step, format]) => (
                <SliderControl
                  key={key}
                  label={label}
                  value={selectedLocalAdjustment.mask[key] ?? defaultValue}
                  defaultValue={defaultValue}
                  min={min}
                  max={max}
                  step={step}
                  format={format}
                  onChange={(value) =>
                    updateMaskPreview(selectedId, onUpdateLocalMask, `${selectedId}:${key}`, (mask) => ({
                      ...mask,
                      [key]: value,
                    }))
                  }
                  onCommit={(value) =>
                    commitMask(selectedId, onUpdateLocalMask, `${selectedId}:${key}`, (mask) => ({
                      ...mask,
                      [key]: value,
                    }))
                  }
                />
              ))}
              <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0c0d10]/70 px-3 py-2 text-xs text-zinc-200">
                <span>Invert Mask</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/20 bg-[#0f1114] accent-white"
                  checked={selectedLocalAdjustment.mask.invert ?? false}
                  onChange={(event) =>
                    commitMask(selectedId, onUpdateLocalMask, `${selectedId}:invert`, (mask) => ({
                      ...mask,
                      invert: event.currentTarget.checked,
                    }))
                  }
                />
              </label>
            </div>

            <div className="space-y-2 rounded-xl border border-white/10 bg-[#0f1114]/70 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Adjustments</p>
              {DELTA_SLIDERS.map((slider) => (
                <SliderControl
                  key={slider.key}
                  label={slider.label}
                  value={selectedLocalAdjustment.adjustments[slider.key] ?? 0}
                  defaultValue={0}
                  min={slider.min}
                  max={slider.max}
                  step={1}
                  onChange={(value) =>
                    onPreviewLocalAdjustmentDelta(selectedId, { [slider.key]: value })
                  }
                  onCommit={(value) =>
                    onCommitLocalAdjustmentDelta(selectedId, { [slider.key]: value })
                  }
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </EditorSection>
  );
});
