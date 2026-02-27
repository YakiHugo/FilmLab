import { useCanvasInteraction } from "./hooks/useCanvasInteraction";
import { useCanvasLayers } from "./hooks/useCanvasLayers";

export function CanvasLayerPanel() {
  const { layers } = useCanvasLayers();
  const { selectedElementIds, setSelectedElementIds } = useCanvasInteraction();

  return (
    <aside className="rounded-2xl border border-white/10 bg-black/35 p-3">
      <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-zinc-500">Layers</h3>
      <div className="space-y-1">
        {layers.map((layer) => {
          const selected = selectedElementIds.includes(layer.id);
          return (
            <button
              key={layer.id}
              type="button"
              className={[
                "w-full rounded-lg border px-2 py-1.5 text-left text-xs",
                selected
                  ? "border-sky-400/40 bg-sky-400/10 text-zinc-100"
                  : "border-white/10 bg-white/[0.02] text-zinc-300",
              ].join(" ")}
              onClick={() => setSelectedElementIds([layer.id])}
            >
              <p className="truncate">{layer.type.toUpperCase()}</p>
              <p className="text-[11px] text-zinc-500">z-index {layer.zIndex}</p>
            </button>
          );
        })}
        {layers.length === 0 && <p className="text-xs text-zinc-500">No layers yet.</p>}
      </div>
    </aside>
  );
}
