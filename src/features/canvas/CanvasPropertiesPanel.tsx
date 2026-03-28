import { memo } from "react";
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
import type { CanvasTextFontSizeTier } from "@/types";
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
import {
  CANVAS_TEXT_SIZE_TIER_OPTIONS,
} from "./textStyle";
import { useCanvasPropertiesPanelModel } from "./hooks/useCanvasPropertiesPanelModel";

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
  const {
    activeWorkbench,
    selectedImageRenderState,
    selected,
    selectedAsset,
    setFilmProfileId,
    setFill,
    setFontFamily,
    setFontSizeTier,
    setHeight,
    setOpacity,
    setRotation,
    setStroke,
    setStrokeWidth,
    setTextAlign,
    setTextColor,
    setTextContent,
    setWidth,
    setX,
    setY,
    textColorOptions,
    textFontOptions,
  } = useCanvasPropertiesPanelModel();
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
              <NumberInput label="X" value={selected.x} onChange={setX} />
              <NumberInput label="Y" value={selected.y} onChange={setY} />
              <NumberInput label="Width" value={selected.width} min={1} onChange={setWidth} />
              <NumberInput label="Height" value={selected.height} min={1} onChange={setHeight} />
              <NumberInput label="Rotation" value={selected.rotation} step={0.5} onChange={setRotation} />
              <NumberInput
                label="Opacity"
                value={selected.opacity}
                min={0}
                max={1}
                step={0.01}
                onChange={setOpacity}
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
                value={selectedImageRenderState?.film.profileId ?? "none"}
                onValueChange={setFilmProfileId}
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
                onChange={(event) => setTextContent(event.target.value)}
                className={canvasDockFieldClassName}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select value={selected.fontFamily} onValueChange={setFontFamily}>
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
                  onValueChange={(value) => setFontSizeTier(value as CanvasTextFontSizeTier)}
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
                <Select value={selected.color} onValueChange={setTextColor}>
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
                  onValueChange={(value) => setTextAlign(value as "left" | "center" | "right")}
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
                  onChange={(event) => setFill(event.target.value)}
                  className={canvasDockFieldClassName}
                />
              </label>
              <label className="space-y-2">
                <span className={canvasDockFieldLabelClassName}>Stroke</span>
                <Input
                  type="text"
                  value={selected.stroke}
                  onChange={(event) => setStroke(event.target.value)}
                  className={canvasDockFieldClassName}
                />
              </label>
              <NumberInput
                label="Stroke Width"
                value={selected.strokeWidth}
                min={0}
                step={0.5}
                onChange={setStrokeWidth}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
});
