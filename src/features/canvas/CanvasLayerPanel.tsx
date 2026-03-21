import { Eye, EyeOff, GripVertical, Layers3, Lock, Trash2, Unlock } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import type { Asset, CanvasRenderableNode } from "@/types";
import { getCanvasDescendantIds } from "./documentGraph";
import { useCanvasSelectionModel } from "./hooks/useCanvasSelectionModel";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";
import { useCanvasLayers } from "./hooks/useCanvasLayers";

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
        "flex items-center gap-3 rounded-[22px] border px-3 py-3 transition",
        selected
          ? "border-amber-300/30 bg-amber-200/10 text-zinc-100"
          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.05]"
      )}
      style={{
        paddingLeft: 12 + layer.depth * 18,
      }}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={(event) => {
          onSelect(layer.id, event.shiftKey);
        }}
      >
        <GripVertical className="h-4 w-4 shrink-0 text-zinc-500" />
        {layer.type === "image" ? (
          <img
            src={asset?.thumbnailUrl || asset?.objectUrl}
            alt={asset?.name ?? "layer"}
            className="h-10 w-10 rounded-xl border border-white/10 object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-zinc-100">{previewText}</p>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              {layer.type === "shape" ? layer.shapeType : layer.type}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500">
            {Math.round(layer.width)} x {Math.round(layer.height)} - x {Math.round(layer.x)}, y{" "}
            {Math.round(layer.y)}
          </p>
        </div>
      </button>

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 rounded-xl p-0"
          onClick={() => {
            onToggleVisibility(layer.id);
          }}
        >
          {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 rounded-xl p-0"
          onClick={() => {
            onToggleLock(layer.id);
          }}
        >
          {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 rounded-xl p-0 text-rose-300 hover:text-rose-200"
          onClick={() => {
            onDelete(layer.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
});

export function CanvasLayerPanel() {
  const {
    activeWorkbench,
    layers,
    assetById,
    activeWorkbenchId,
    reparentNodes,
    reorderElements,
    toggleElementVisibility,
    toggleElementLock,
    deleteElements,
  } = useCanvasLayers();
  const groupElements = useCanvasStore((state) => state.groupElements);
  const ungroupElement = useCanvasStore((state) => state.ungroupElement);
  const { displaySelectedElementIdSet, displaySelectedElementIds, primarySelectedElement } =
    useCanvasSelectionModel();
  const { selectElement } = useCanvasInteraction();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const reorder = useCallback(
    (fromId: string, toId: string) => {
      if (!activeWorkbenchId || fromId === toId) {
        return;
      }
      const fromLayer = layers.find((layer) => layer.id === fromId);
      const toLayer = layers.find((layer) => layer.id === toId);
      if (!fromLayer || !toLayer) {
        return;
      }

      const targetParentId = toLayer.type === "group" ? toLayer.id : (toLayer.parentId ?? null);
      if (targetParentId === fromId) {
        return;
      }
      if (
        fromLayer.type === "group" &&
        activeWorkbench &&
        targetParentId &&
        getCanvasDescendantIds(activeWorkbench, fromLayer.id).includes(targetParentId)
      ) {
        return;
      }

      if (fromLayer.parentId !== targetParentId) {
        const targetSiblingIds = layers
          .filter((layer) => layer.parentId === targetParentId)
          .map((layer) => layer.id);
        const targetIndex =
          toLayer.type === "group" ? targetSiblingIds.length : targetSiblingIds.indexOf(toLayer.id);
        void reparentNodes(
          [fromId],
          targetParentId,
          targetIndex < 0 ? undefined : targetIndex
        );
        return;
      }

      const siblingIds = layers
        .filter((layer) => layer.parentId === targetParentId)
        .map((layer) => layer.id);
      const fromIndex = siblingIds.indexOf(fromId);
      const toIndex = siblingIds.indexOf(toId);
      if (fromIndex < 0 || toIndex < 0) {
        return;
      }
      const ordered = siblingIds.slice();
      const [moved] = ordered.splice(fromIndex, 1);
      ordered.splice(toIndex, 0, moved);
      void reorderElements(ordered.reverse(), targetParentId);
    },
    [activeWorkbench, activeWorkbenchId, layers, reorderElements, reparentNodes]
  );

  const handleSelect = useCallback(
    (layerId: string, additive: boolean) => {
      selectElement(layerId, { additive });
    },
    [selectElement]
  );

  const handleDelete = useCallback(
    (layerId: string) => {
      if (!activeWorkbenchId) {
        return;
      }
      void deleteElements([layerId]);
    },
    [activeWorkbenchId, deleteElements]
  );

  const handleToggleVisibility = useCallback(
    (layerId: string) => {
      if (!activeWorkbenchId) {
        return;
      }
      void toggleElementVisibility(layerId);
    },
    [activeWorkbenchId, toggleElementVisibility]
  );

  const handleToggleLock = useCallback(
    (layerId: string) => {
      if (!activeWorkbenchId) {
        return;
      }
      void toggleElementLock(layerId);
    },
    [activeWorkbenchId, toggleElementLock]
  );

  const handleDragStart = useCallback((layerId: string) => {
    setDraggingId(layerId);
  }, []);

  const handleDrop = useCallback(
    (layerId: string) => {
      if (draggingId) {
        reorder(draggingId, layerId);
      }
      setDraggingId(null);
    },
    [draggingId, reorder]
  );

  const handleGroup = useCallback(() => {
    if (!activeWorkbenchId || displaySelectedElementIds.length < 2) {
      return;
    }
    void groupElements(displaySelectedElementIds);
  }, [activeWorkbenchId, displaySelectedElementIds, groupElements]);

  const handleUngroup = useCallback(() => {
    if (!activeWorkbenchId || primarySelectedElement?.type !== "group") {
      return;
    }
    void ungroupElement(primarySelectedElement.id);
  }, [activeWorkbenchId, primarySelectedElement, ungroupElement]);

  return (
    <div className="flex min-h-0 flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Layer Stack</p>
          <h3 className="mt-1 font-['Syne'] text-xl text-zinc-100">有意识地组织当前工作台。</h3>
        </div>
        <div className="flex items-center gap-2">
          {displaySelectedElementIds.length > 1 ? (
            <Button
              size="sm"
              variant="secondary"
              className="h-9 rounded-2xl border border-white/10 bg-white/[0.06] px-3 text-xs"
              onClick={handleGroup}
            >
              Group
            </Button>
          ) : null}
          {primarySelectedElement?.type === "group" ? (
            <Button
              size="sm"
              variant="secondary"
              className="h-9 rounded-2xl border border-white/10 bg-white/[0.06] px-3 text-xs"
              onClick={handleUngroup}
            >
              Ungroup
            </Button>
          ) : null}
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
            <Layers3 className="h-4 w-4 text-zinc-400" />
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-400">
        拖拽即可重排。可见性和锁定状态会跟随图层保存，方便你持续组织当前工作台
        without losing alternates.
      </p>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
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
            selected={displaySelectedElementIdSet.has(layer.id)}
          />
        ))}
        {layers.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-zinc-500">
            还没有图层。先放一张图或一段文字，再开始搭建工作台内容。
          </div>
        ) : null}
      </div>
    </div>
  );
}
