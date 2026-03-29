import { Eye, EyeOff, GripVertical, Layers3, Lock, Trash2, Unlock } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import type { Asset, CanvasRenderableNode } from "@/types";
import {
  canvasDockActionChipClassName,
  canvasDockBadgeClassName,
  canvasDockBodyTextClassName,
  canvasDockEmptyStateClassName,
  canvasDockHeadingClassName,
  canvasDockIconBadgeClassName,
  canvasDockInteractiveListItemClassName,
  canvasDockListItemClassName,
  canvasDockOverlineClassName,
  canvasDockPanelContentClassName,
  canvasDockSelectedListItemClassName,
  canvasDockSectionClassName,
  canvasDockSectionMutedClassName,
} from "./editDockTheme";
import { useCanvasLayerPanelModel } from "./hooks/useCanvasLayerPanelModel";

interface LayerRowProps {
  asset: Asset | null;
  layer: CanvasRenderableNode;
  onDelete: (layerId: string) => void;
  onDrop: (layerId: string) => void;
  onDragStart: (layerId: string) => void;
  onSelect: (layerId: string, additive: boolean) => void;
  onToggleLock: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  selected: boolean;
}

const rowIconButtonClassName =
  "flex h-8 w-8 items-center justify-center rounded-[8px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-surface-strong)] text-[color:var(--canvas-edit-text-soft)] transition hover:text-[color:var(--canvas-edit-text)]";

const LayerRow = memo(function LayerRow({
  asset,
  layer,
  onDelete,
  onDrop,
  onDragStart,
  onSelect,
  onToggleLock,
  onToggleVisibility,
  selected,
}: LayerRowProps) {
  const previewText =
    layer.type === "text"
      ? layer.content
      : layer.type === "image"
        ? (asset?.name ?? "Image")
        : layer.type === "group"
          ? layer.name
          : `${layer.shapeType} shape`;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(layer.id)}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={() => {
        onDrop(layer.id);
      }}
      className={cn(
        canvasDockListItemClassName,
        "flex items-center gap-3 px-3 py-3",
        selected
          ? canvasDockSelectedListItemClassName
          : cn(
              canvasDockInteractiveListItemClassName,
              "text-[color:var(--canvas-edit-text-muted)]"
            )
      )}
      style={{
        paddingLeft: 12 + layer.depth * 18,
      }}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={(event) => {
          onSelect(layer.id, event.shiftKey);
        }}
      >
        <GripVertical className="h-4 w-4 shrink-0 text-[color:var(--canvas-edit-text-soft)]" />
        {layer.type === "image" ? (
          <img
            src={asset?.thumbnailUrl || asset?.objectUrl}
            alt={asset?.name ?? "Layer preview"}
            className="h-10 w-10 rounded-[8px] border border-[color:var(--canvas-edit-border)] object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-[color:var(--canvas-edit-text)]">
              {previewText}
            </p>
            <span className={cn(canvasDockBadgeClassName, "px-2 py-0.5 tracking-[0.18em]")}>
              {layer.type === "shape" ? layer.shapeType : layer.type}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-[color:var(--canvas-edit-text-muted)]">
            {Math.round(layer.width)} x {Math.round(layer.height)} at {Math.round(layer.x)},{" "}
            {Math.round(layer.y)}
          </p>
        </div>
      </button>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className={rowIconButtonClassName}
          onClick={() => {
            onToggleVisibility(layer.id);
          }}
          aria-label={layer.visible ? "Hide layer" : "Show layer"}
        >
          {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          className={rowIconButtonClassName}
          onClick={() => {
            onToggleLock(layer.id);
          }}
          aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
        >
          {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          className={cn(
            rowIconButtonClassName,
            "text-rose-300 hover:text-rose-200"
          )}
          onClick={() => {
            onDelete(layer.id);
          }}
          aria-label="Delete layer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
});

export function CanvasLayerPanel() {
  const {
    assetById,
    selectedElementIdSet,
    selectedElementIds,
    handleDelete,
    handleDragStart,
    handleDrop,
    handleGroup,
    handleSelect,
    handleToggleLock,
    handleToggleVisibility,
    handleUngroup,
    layers,
    primarySelectedElement,
  } = useCanvasLayerPanelModel();

  return (
    <div className={canvasDockPanelContentClassName}>
      <section className={canvasDockSectionClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={canvasDockOverlineClassName}>Layer Stack</p>
            <h3 className={canvasDockHeadingClassName}>Reorder the active composition.</h3>
            <p className={cn(canvasDockBodyTextClassName, "mt-2")}>
              Drag to change stacking order. Lock and visibility states stay attached to each layer
              while you organize alternates.
            </p>
          </div>
          <div className={canvasDockIconBadgeClassName}>
            <Layers3 className="h-4 w-4 text-[color:var(--canvas-edit-text-soft)]" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={canvasDockBadgeClassName}>
            {layers.length} layer{layers.length === 1 ? "" : "s"}
          </span>
          {selectedElementIds.length > 0 ? (
            <span className={canvasDockBadgeClassName}>
              {selectedElementIds.length} selected
            </span>
          ) : null}
          {selectedElementIds.length > 1 ? (
            <button type="button" className={canvasDockActionChipClassName} onClick={handleGroup}>
              Group
            </button>
          ) : null}
          {primarySelectedElement?.type === "group" ? (
            <button
              type="button"
              className={canvasDockActionChipClassName}
              onClick={handleUngroup}
            >
              Ungroup
            </button>
          ) : null}
        </div>
      </section>

      <section className={cn(canvasDockSectionMutedClassName, "min-h-0 flex flex-1 flex-col p-2")}>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {layers.map((layer) => (
            <LayerRow
              key={layer.id}
              asset={layer.type === "image" ? (assetById.get(layer.assetId) ?? null) : null}
              layer={layer}
              onDelete={handleDelete}
              onDrop={handleDrop}
              onDragStart={handleDragStart}
              onSelect={handleSelect}
              onToggleLock={handleToggleLock}
              onToggleVisibility={handleToggleVisibility}
              selected={selectedElementIdSet.has(layer.id)}
            />
          ))}

          {layers.length === 0 ? (
            <div className={cn(canvasDockEmptyStateClassName, "px-4 py-4 text-sm")}>
              <p className="font-medium text-[color:var(--canvas-edit-text)]">No layers yet.</p>
              <p className="mt-2 leading-6 text-[color:var(--canvas-edit-text-muted)]">
                Add an image, text, or shape to the canvas first, then organize the stack here.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
