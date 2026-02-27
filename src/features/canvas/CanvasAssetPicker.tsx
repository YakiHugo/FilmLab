import { useCanvasEngine } from "./hooks/useCanvasEngine";

export function CanvasAssetPicker() {
  const { assets, addAssetToCanvas } = useCanvasEngine();

  return (
    <aside className="rounded-2xl border border-white/10 bg-black/35 p-3">
      <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-zinc-500">Assets</h3>
      <div className="grid max-h-[240px] grid-cols-3 gap-2 overflow-y-auto">
        {assets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            className="overflow-hidden rounded-lg border border-white/10 bg-black/45"
            onClick={() => {
              void addAssetToCanvas(asset.id);
            }}
            title={asset.name}
          >
            <img src={asset.thumbnailUrl || asset.objectUrl} alt={asset.name} className="aspect-square w-full object-cover" />
          </button>
        ))}
        {assets.length === 0 && (
          <p className="col-span-full text-xs text-zinc-500">Import assets in Library first.</p>
        )}
      </div>
    </aside>
  );
}
