import { Frame, LayoutTemplate, ScissorsLineDashed, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { STUDIO_CANVAS_PRESETS } from "./studioPresets";
import {
  canvasDockActionChipClassName,
  canvasDockBadgeClassName,
  canvasDockBodyTextClassName,
  canvasDockEmptyStateClassName,
  canvasDockFieldClassName,
  canvasDockFieldLabelClassName,
  canvasDockHeadingClassName,
  canvasDockIconBadgeClassName,
  canvasDockInteractiveListItemClassName,
  canvasDockListItemClassName,
  canvasDockMetricCardClassName,
  canvasDockOverlineClassName,
  canvasDockPanelContentClassName,
  canvasDockSelectedListItemClassName,
  canvasDockSectionClassName,
  canvasDockSectionMutedClassName,
} from "./editDockTheme";
import { useCanvasStoryPanelModel } from "./hooks/useCanvasStoryPanelModel";

interface CanvasStoryPanelProps {
  selectedSliceId: string | null;
  onSelectSlice: (sliceId: string | null) => void;
}

export function CanvasStoryPanel({ selectedSliceId, onSelectSlice }: CanvasStoryPanelProps) {
  const {
    activeWorkbench,
    appendSlice,
    applyPreset,
    buildStripSlices,
    clearSlices,
    currentPreset,
    deleteSelectedSlice,
    orderedSlices,
    selectSlice,
    selectedSlice,
    updateGuide,
    updateSafeArea,
    updateSelectedSliceName,
    updateSelectedSliceNumberField,
  } = useCanvasStoryPanelModel({
    selectedSliceId,
    onSelectSlice,
  });

  if (!activeWorkbench) {
    return null;
  }

  return (
    <div className={cn(canvasDockPanelContentClassName, "overflow-y-auto pr-1")}>
      <section className={canvasDockSectionClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={canvasDockOverlineClassName}>Canvas Format</p>
            <h3 className={canvasDockHeadingClassName}>Lock the frame before sequencing.</h3>
            <p className={cn(canvasDockBodyTextClassName, "mt-2")}>
              Set the social ratio first so slices, exports, and safe areas all line up against the
              same crop boundary.
            </p>
          </div>
          <div className={canvasDockIconBadgeClassName}>
            <Frame className="h-4 w-4 text-[color:var(--canvas-edit-text-soft)]" />
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {STUDIO_CANVAS_PRESETS.map((preset) => {
            const active = activeWorkbench.presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={cn(
                  canvasDockListItemClassName,
                  canvasDockInteractiveListItemClassName,
                  "px-3 py-3 text-left",
                  active
                    ? canvasDockSelectedListItemClassName
                    : "text-[color:var(--canvas-edit-text-muted)]"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[color:var(--canvas-edit-text)]">
                      {preset.label}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--canvas-edit-text-muted)]">
                      {preset.description}
                    </p>
                  </div>
                  <span className={canvasDockBadgeClassName}>{preset.shortLabel}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-[color:var(--canvas-edit-pill-text)]">
          <div className={canvasDockMetricCardClassName}>
            <p className={canvasDockFieldLabelClassName}>Canvas</p>
            <p className="mt-2 font-medium text-[color:var(--canvas-edit-text)]">
              {activeWorkbench.width} x {activeWorkbench.height}
            </p>
          </div>
          <div className={canvasDockMetricCardClassName}>
            <p className={canvasDockFieldLabelClassName}>Layers</p>
            <p className="mt-2 font-medium text-[color:var(--canvas-edit-text)]">
              {activeWorkbench.elements.length}
            </p>
          </div>
          <div className={canvasDockMetricCardClassName}>
            <p className={canvasDockFieldLabelClassName}>Current</p>
            <p className="mt-2 font-medium text-[color:var(--canvas-edit-text)]">
              {currentPreset.shortLabel}
            </p>
          </div>
        </div>
      </section>

      <section className={canvasDockSectionClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={canvasDockOverlineClassName}>Export Sequence</p>
            <h3 className={canvasDockHeadingClassName}>Split one canvas into deliverables.</h3>
            <p className={cn(canvasDockBodyTextClassName, "mt-2")}>
              Keep the full frame as a single post, or cut it into ordered slices for carousels and
              strip-based exports.
            </p>
          </div>
          <div className={canvasDockIconBadgeClassName}>
            <ScissorsLineDashed className="h-4 w-4 text-[color:var(--canvas-edit-text-soft)]" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            className={canvasDockActionChipClassName}
            onClick={() => {
              clearSlices();
            }}
          >
            Single Frame
          </Button>
          {[2, 3, 4].map((count) => (
            <Button
              key={count}
              size="sm"
              variant="secondary"
              className={canvasDockActionChipClassName}
              onClick={() => {
                buildStripSlices(count);
              }}
            >
              {count} Frames
            </Button>
          ))}
          <Button
            size="sm"
            variant="secondary"
            className={canvasDockActionChipClassName}
            onClick={() => {
              appendSlice();
            }}
          >
            Add Frame
          </Button>
        </div>

        {orderedSlices.length > 0 ? (
          <div className="mt-4 space-y-2">
            {orderedSlices.map((slice) => {
              const active = slice.id === selectedSlice?.id;
              return (
                <button
                  key={slice.id}
                  type="button"
                  onClick={() => selectSlice(slice.id)}
                  className={cn(
                    canvasDockListItemClassName,
                    canvasDockInteractiveListItemClassName,
                    "flex w-full items-center justify-between px-3 py-3 text-left",
                    active
                      ? canvasDockSelectedListItemClassName
                      : "text-[color:var(--canvas-edit-text-muted)]"
                  )}
                >
                  <div>
                    <p className="text-sm font-medium text-[color:var(--canvas-edit-text)]">
                      {slice.name}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--canvas-edit-text-muted)]">
                      {slice.width} x {slice.height} at {slice.x}, {slice.y}
                    </p>
                  </div>
                  <span className={canvasDockBadgeClassName}>
                    {String(slice.order).padStart(2, "0")}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className={cn(canvasDockEmptyStateClassName, "mt-4 px-4 py-4 text-sm")}>
            <p className="font-medium text-[color:var(--canvas-edit-text)]">Single-frame export.</p>
            <p className="mt-2 leading-6 text-[color:var(--canvas-edit-text-muted)]">
              Leave the canvas as one frame, or split it here when you need a carousel or sequence.
            </p>
          </div>
        )}

        {selectedSlice ? (
          <div className={cn(canvasDockSectionMutedClassName, "mt-4 space-y-3")}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={canvasDockFieldLabelClassName}>Selected Frame</p>
                <p className="mt-1 text-sm font-medium text-[color:var(--canvas-edit-text)]">
                  {selectedSlice.name}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-[8px] px-2 text-xs text-rose-300 hover:bg-transparent hover:text-rose-200"
                onClick={deleteSelectedSlice}
              >
                Remove
              </Button>
            </div>

            <Input
              value={selectedSlice.name}
              onChange={(event) => updateSelectedSliceName(event.target.value)}
              className={canvasDockFieldClassName}
            />

            <div className="grid grid-cols-2 gap-3">
              {([
                ["x", selectedSlice.x],
                ["y", selectedSlice.y],
                ["width", selectedSlice.width],
                ["height", selectedSlice.height],
              ] as const).map(([key, value]) => (
                <label key={key} className="space-y-2">
                  <span className={canvasDockFieldLabelClassName}>{key}</span>
                  <Input
                    type="number"
                    min={0}
                    value={Math.round(value)}
                    onChange={(event) =>
                      updateSelectedSliceNumberField(key, event.target.value)
                    }
                    className={canvasDockFieldClassName}
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className={canvasDockSectionClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={canvasDockOverlineClassName}>Guides & Safe Area</p>
            <h3 className={canvasDockHeadingClassName}>Guard the final crop.</h3>
            <p className={cn(canvasDockBodyTextClassName, "mt-2")}>
              Keep type and focal subjects inside the safe area so the same composition survives
              feed crop differences.
            </p>
          </div>
          <div className={canvasDockIconBadgeClassName}>
            <LayoutTemplate className="h-4 w-4 text-[color:var(--canvas-edit-text-soft)]" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            className={cn(
              canvasDockActionChipClassName,
              activeWorkbench.guides.showThirds && canvasDockSelectedListItemClassName
            )}
            onClick={() => updateGuide("showThirds", !activeWorkbench.guides.showThirds)}
          >
            Thirds
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className={cn(
              canvasDockActionChipClassName,
              activeWorkbench.guides.showCenter && canvasDockSelectedListItemClassName
            )}
            onClick={() => updateGuide("showCenter", !activeWorkbench.guides.showCenter)}
          >
            Center
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className={cn(
              canvasDockActionChipClassName,
              activeWorkbench.guides.showSafeArea && canvasDockSelectedListItemClassName
            )}
            onClick={() => updateGuide("showSafeArea", !activeWorkbench.guides.showSafeArea)}
          >
            Safe Area
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {(["top", "right", "bottom", "left"] as const).map((key) => (
            <label key={key} className="space-y-2">
              <span className={canvasDockFieldLabelClassName}>{key}</span>
              <Input
                type="number"
                min={0}
                value={activeWorkbench.safeArea[key]}
                onChange={(event) => updateSafeArea(key, event.target.value)}
                className={canvasDockFieldClassName}
              />
            </label>
          ))}
        </div>

        <div className={cn(canvasDockSectionMutedClassName, "mt-4 flex items-start gap-3")}>
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--canvas-edit-text-soft)]" />
          <p className="text-sm leading-6 text-[color:var(--canvas-edit-text-muted)]">
            Safe-area guides are especially useful when one layout has to survive both single-post
            and multi-frame export.
          </p>
        </div>
      </section>
    </div>
  );
}
