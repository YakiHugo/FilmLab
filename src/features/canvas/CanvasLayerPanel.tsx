import { Eye, EyeOff, GripVertical, Lock, Trash2, Unlock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
    <aside className="rounded-2xl border border-white/10 bg-black/35 p-3">
      <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-zinc-500">Layers</h3>
      <div className="space-y-1">
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
              className={[
                "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                selected
                  ? "border-sky-400/40 bg-sky-400/10 text-zinc-100"
                  : "border-white/10 bg-white/[0.02] text-zinc-300",
              ].join(" ")}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={(event) => {
                  selectElement(layer.id, { additive: event.shiftKey });
                }}
              >
                <GripVertical className="h-3.5 w-3.5 text-zinc-500" />
                {layer.type === "image" && (
                  <img
                    src={asset?.thumbnailUrl || asset?.objectUrl}
                    alt={asset?.name ?? "layer"}
                    className="h-8 w-8 rounded border border-white/10 object-cover"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium">{layer.type.toUpperCase()}</p>
                  <p className="truncate text-[10px] text-zinc-500">{previewText}</p>
                </div>
              </button>

              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 rounded-md p-0"
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
                  className="h-7 w-7 rounded-md p-0"
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
                  className="h-7 w-7 rounded-md p-0 text-rose-300 hover:text-rose-200"
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
        {layers.length === 0 && <p className="text-xs text-zinc-500">No layers yet.</p>}
      </div>
    </aside>
  );
}
