import { Eye, EyeOff, GripVertical, Layers3, Lock, Trash2, Unlock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";
import { useCanvasLayers } from "./hooks/useCanvasLayers";

export function CanvasLayerPanel() {
  const { layers, assetById, activeDocumentId, reorderElements, toggleElementVisibility, toggleElementLock, deleteElements } =
    useCanvasLayers();
  const { selectedElementIds, selectElement } = useCanvasInteraction();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const reorder = (fromId: string, toId: string) => {
    if (!activeDocumentId || fromId === toId) {
      return;
    }
    const ids = layers.map((layer) => layer.id);
    const fromIndex = ids.indexOf(fromId);
    const toIndex = ids.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    const ordered = ids.slice();
    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);
    void reorderElements(activeDocumentId, ordered);
  };

  return (
    <div className="flex min-h-0 flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Layer Stack</p>
          <h3 className="mt-1 font-['Syne'] text-xl text-zinc-100">Arrange the board with intent.</h3>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
          <Layers3 className="h-4 w-4 text-zinc-400" />
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-zinc-400">
        Reorder by dragging. Visibility and lock states stay on the layer, so you can stage a board
        without losing alternates.
      </p>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {layers.map((layer) => {
          const selected = selectedElementIds.includes(layer.id);
          const asset = layer.type === "image" ? assetById.get(layer.assetId) : null;
          const previewText =
            layer.type === "text"
              ? layer.content
              : layer.type === "shape"
                ? `${layer.shape.toUpperCase()} ${Math.round(layer.width)}x${Math.round(layer.height)}`
                : asset?.name ?? "Image";

          return (
            <div
              key={layer.id}
              draggable
              onDragStart={() => setDraggingId(layer.id)}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={() => {
                if (draggingId) {
                  reorder(draggingId, layer.id);
                }
                setDraggingId(null);
              }}
              className={cn(
                "flex items-center gap-3 rounded-[22px] border px-3 py-3 transition",
                selected
                  ? "border-amber-300/30 bg-amber-200/10 text-zinc-100"
                  : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.05]"
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={(event) => {
                  selectElement(layer.id, { additive: event.shiftKey });
                }}
              >
                <GripVertical className="h-4 w-4 shrink-0 text-zinc-500" />
                {layer.type === "image" && (
                  <img
                    src={asset?.thumbnailUrl || asset?.objectUrl}
                    alt={asset?.name ?? "layer"}
                    className="h-10 w-10 rounded-xl border border-white/10 object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-zinc-100">{previewText}</p>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      {layer.type}
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
                    if (activeDocumentId) {
                      void toggleElementVisibility(activeDocumentId, layer.id);
                    }
                  }}
                >
                  {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 rounded-xl p-0"
                  onClick={() => {
                    if (activeDocumentId) {
                      void toggleElementLock(activeDocumentId, layer.id);
                    }
                  }}
                >
                  {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 rounded-xl p-0 text-rose-300 hover:text-rose-200"
                  onClick={() => {
                    if (activeDocumentId) {
                      void deleteElements(activeDocumentId, [layer.id]);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
        {layers.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-zinc-500">
            No layers yet. Add an image, text, or shape to start composing the board.
          </div>
        ) : null}
      </div>
    </div>
  );
}
