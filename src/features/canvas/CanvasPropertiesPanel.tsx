import { memo, useMemo } from "react";
import { SlidersHorizontal } from "lucide-react";
import { filmProfiles } from "@/data/filmProfiles";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import type { CanvasElement } from "@/types";
import {
  canvasDockBodyTextClassName,
  canvasDockEmptyStateClassName,
  canvasDockFieldClassName,
  canvasDockFieldLabelClassName,
  canvasDockHeadingClassName,
  canvasDockIconBadgeClassName,
  canvasDockMetricCardClassName,
  canvasDockOverlineClassName,
  canvasDockSelectContentClassName,
  canvasDockSelectTriggerClassName,
  canvasDockSectionClassName,
  canvasDockSectionMutedClassName,
} from "./editDockTheme";
import { useCanvasSelectionModel } from "./hooks/useCanvasSelectionModel";
import {
  applyCanvasTextFontSizeTier,
  CANVAS_TEXT_COLOR_OPTIONS,
  CANVAS_TEXT_FONT_OPTIONS,
  CANVAS_TEXT_SIZE_TIER_OPTIONS,
  getCanvasTextColorOption,
  getCanvasTextFontOption,
} from "./textStyle";

interface CanvasPropertiesPanelProps {
  variant?: "embedded" | "standalone";
}

const NumberInput = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) => (
  <label className="space-y-2">
    <span className={canvasDockFieldLabelClassName}>{label}</span>
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      value={Math.round(value * 1000) / 1000}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
      className={canvasDockFieldClassName}
    />
  </label>
);

export const CanvasPropertiesPanel = memo(function CanvasPropertiesPanel({
  variant = "standalone",
}: CanvasPropertiesPanelProps) {
  const upsertElement = useCanvasStore((state) => state.upsertElement);
  const assets = useAssetStore((state) => state.assets);
  const { activeWorkbench, primarySelectedElement: selected } = useCanvasSelectionModel();

  const update = (patch: Partial<CanvasElement>) => {
    if (!selected) {
      return;
    }
    void upsertElement({
      ...selected,
      ...patch,
    } as CanvasElement);
  };

  const selectedAsset = useMemo(() => {
    if (!selected || selected.type !== "image") {
      return null;
    }
    return assets.find((asset) => asset.id === selected.assetId) ?? null;
  }, [assets, selected]);

  const textFontOptions = useMemo(() => {
    if (!selected || selected.type !== "text") {
      return CANVAS_TEXT_FONT_OPTIONS;
    }
    const current = getCanvasTextFontOption(selected.fontFamily);
    return CANVAS_TEXT_FONT_OPTIONS.some((option) => option.value === current.value)
      ? CANVAS_TEXT_FONT_OPTIONS
      : [...CANVAS_TEXT_FONT_OPTIONS, current];
  }, [selected]);

  const textColorOptions = useMemo(() => {
    if (!selected || selected.type !== "text") {
      return CANVAS_TEXT_COLOR_OPTIONS;
    }
    const current = getCanvasTextColorOption(selected.color);
    return CANVAS_TEXT_COLOR_OPTIONS.some((option) => option.value === current.value)
      ? CANVAS_TEXT_COLOR_OPTIONS
      : [...CANVAS_TEXT_COLOR_OPTIONS, current];
  }, [selected]);
  const isEmbedded = variant === "embedded";

  return (
    <div
      className={cn(
        "space-y-5 text-[color:var(--canvas-edit-text)]",
        isEmbedded ? "" : "min-h-0 flex-1 overflow-y-auto pr-1"
      )}
    >
      {isEmbedded ? (
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={canvasDockOverlineClassName}>Inspector</p>
            <h3 className={canvasDockHeadingClassName}>Selected layer controls</h3>
          </div>
          <div className={canvasDockIconBadgeClassName}>
            <SlidersHorizontal className="h-4 w-4 text-[color:var(--canvas-edit-text-soft)]" />
          </div>
        </div>
      ) : null}

      {!selected ? (
        <div className={cn(canvasDockEmptyStateClassName, "p-4")}>
          <p className="text-sm font-medium text-[color:var(--canvas-edit-text)]">
            Nothing selected yet.
          </p>
          <p className={cn(canvasDockBodyTextClassName, "mt-2")}>
            Click any image, text, shape, or group layer on the canvas to edit it here.
          </p>
          {activeWorkbench ? (
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[color:var(--canvas-edit-pill-text)]">
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
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className={cn(canvasDockSectionMutedClassName, "px-4 py-3")}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={canvasDockFieldLabelClassName}>Selected Layer</p>
                <p className="mt-1 text-sm font-medium text-[color:var(--canvas-edit-text)]">
                  {selected.type === "image"
                    ? (selectedAsset?.name ?? "Image layer")
                    : selected.type === "text"
                      ? "Text layer"
                      : selected.type === "shape"
                        ? `${selected.shapeType} shape`
                        : (selected.name || "Group")}
                </p>
              </div>
              <span className="rounded-full border border-[color:var(--canvas-edit-border)] px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-[color:var(--canvas-edit-text-muted)]">
                {selected.type}
              </span>
            </div>
          </div>

          <div className={canvasDockSectionClassName}>
            <p className={canvasDockFieldLabelClassName}>Transform</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <NumberInput label="X" value={selected.x} onChange={(value) => update({ x: value })} />
              <NumberInput label="Y" value={selected.y} onChange={(value) => update({ y: value })} />
              <NumberInput
                label="Width"
                value={selected.width}
                min={1}
                onChange={(value) => update({ width: Math.max(1, value) })}
              />
              <NumberInput
                label="Height"
                value={selected.height}
                min={1}
                onChange={(value) => update({ height: Math.max(1, value) })}
              />
              <NumberInput
                label="Rotation"
                value={selected.rotation}
                step={0.5}
                onChange={(value) => update({ rotation: value })}
              />
              <NumberInput
                label="Opacity"
                value={selected.opacity}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => update({ opacity: Math.max(0, Math.min(1, value)) })}
              />
            </div>
          </div>

          {selected.type === "image" ? (
            <div className={cn(canvasDockSectionClassName, "space-y-3")}>
              <div>
                <p className={canvasDockFieldLabelClassName}>Image</p>
                <p className="mt-1 truncate text-sm text-[color:var(--canvas-edit-text)]">
                  {selectedAsset?.name ?? selected.assetId}
                </p>
                <p className="mt-2 text-xs leading-5 text-[color:var(--canvas-edit-text-muted)]">
                  Apply film profiles without leaving the edit dock.
                </p>
              </div>

              <Select
                value={selected.filmProfileId ?? "none"}
                onValueChange={(value) =>
                  update({ filmProfileId: value === "none" ? undefined : value })
                }
              >
                <SelectTrigger className={canvasDockSelectTriggerClassName}>
                  <SelectValue placeholder="Film profile" />
                </SelectTrigger>
                <SelectContent className={canvasDockSelectContentClassName}>
                  <SelectItem value="none">No profile</SelectItem>
                  {filmProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {selected.type === "text" ? (
            <div className={cn(canvasDockSectionClassName, "space-y-3")}>
              <p className={canvasDockFieldLabelClassName}>Text</p>
              <Input
                value={selected.content}
                onChange={(event) => update({ content: event.target.value })}
                className={canvasDockFieldClassName}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select
                  value={selected.fontFamily}
                  onValueChange={(value) => update({ fontFamily: value })}
                >
                  <SelectTrigger className={canvasDockSelectTriggerClassName}>
                    <SelectValue placeholder="Font" />
                  </SelectTrigger>
                  <SelectContent className={canvasDockSelectContentClassName}>
                    {textFontOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selected.fontSizeTier}
                  onValueChange={(value) =>
                    update(
                      applyCanvasTextFontSizeTier(selected, value as typeof selected.fontSizeTier)
                    )
                  }
                >
                  <SelectTrigger className={canvasDockSelectTriggerClassName}>
                    <SelectValue placeholder="Size tier" />
                  </SelectTrigger>
                  <SelectContent className={canvasDockSelectContentClassName}>
                    {CANVAS_TEXT_SIZE_TIER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selected.color} onValueChange={(value) => update({ color: value })}>
                  <SelectTrigger className={canvasDockSelectTriggerClassName}>
                    <SelectValue placeholder="Color" />
                  </SelectTrigger>
                  <SelectContent className={canvasDockSelectContentClassName}>
                    {textColorOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selected.textAlign}
                  onValueChange={(value) =>
                    update({ textAlign: value as "left" | "center" | "right" })
                  }
                >
                  <SelectTrigger className={canvasDockSelectTriggerClassName}>
                    <SelectValue placeholder="Align" />
                  </SelectTrigger>
                  <SelectContent className={canvasDockSelectContentClassName}>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {selected.type === "shape" ? (
            <div className={cn(canvasDockSectionClassName, "space-y-3")}>
              <p className={canvasDockFieldLabelClassName}>Shape</p>
              <label className="space-y-2">
                <span className={canvasDockFieldLabelClassName}>Fill</span>
                <Input
                  type="text"
                  value={selected.fill}
                  onChange={(event) => update({ fill: event.target.value } as Partial<CanvasElement>)}
                  className={canvasDockFieldClassName}
                />
              </label>
              <label className="space-y-2">
                <span className={canvasDockFieldLabelClassName}>Stroke</span>
                <Input
                  type="text"
                  value={selected.stroke}
                  onChange={(event) =>
                    update({ stroke: event.target.value } as Partial<CanvasElement>)
                  }
                  className={canvasDockFieldClassName}
                />
              </label>
              <NumberInput
                label="Stroke Width"
                value={selected.strokeWidth}
                min={0}
                step={0.5}
                onChange={(value) =>
                  update({ strokeWidth: Math.max(0, value) } as Partial<CanvasElement>)
                }
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
});
