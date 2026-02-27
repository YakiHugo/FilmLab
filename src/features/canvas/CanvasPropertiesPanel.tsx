import { useMemo } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";

export function CanvasPropertiesPanel() {
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const { selectedElementIds } = useCanvasInteraction();

  const selected = useMemo(() => {
    const active = documents.find((document) => document.id === activeDocumentId);
    if (!active || selectedElementIds.length === 0) {
      return null;
    }
    return active.elements.find((element) => element.id === selectedElementIds[0]) ?? null;
  }, [documents, activeDocumentId, selectedElementIds]);

  return (
    <aside className="rounded-2xl border border-white/10 bg-black/35 p-3">
      <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-zinc-500">Properties</h3>
      {!selected && <p className="text-xs text-zinc-500">Select an element to inspect.</p>}
      {selected && (
        <div className="space-y-1 text-xs text-zinc-300">
          <p>Type: {selected.type}</p>
          <p>X: {Math.round(selected.x)}</p>
          <p>Y: {Math.round(selected.y)}</p>
          <p>W: {Math.round(selected.width)}</p>
          <p>H: {Math.round(selected.height)}</p>
          <p>Rotation: {Math.round(selected.rotation)}°</p>
          <p>Opacity: {Math.round(selected.opacity * 100)}%</p>
        </div>
      )}
    </aside>
  );
}
