import type { Asset } from "@/types";

interface AssetDetailPanelProps {
  asset: Asset | null;
}

export function AssetDetailPanel({ asset }: AssetDetailPanelProps) {
  return (
    <aside className="rounded-2xl border border-white/10 bg-black/35 p-4">
      <h2 className="text-xs uppercase tracking-[0.2em] text-zinc-500">Asset Detail</h2>
      {!asset && <p className="mt-3 text-xs text-zinc-500">Select one asset from the grid.</p>}
      {asset && (
        <div className="mt-3 space-y-2 text-xs text-zinc-300">
          <p className="truncate text-sm font-medium text-zinc-100">{asset.name}</p>
          <p>ID: <span className="text-zinc-500">{asset.id}</span></p>
          <p>Size: {Math.round(asset.size / 1024)} KB</p>
          <p>Type: {asset.type}</p>
          <p>Created: {new Date(asset.createdAt).toLocaleString()}</p>
          <p>Tags: {(asset.tags ?? []).join(", ") || "-"}</p>
          <p>
            Dimensions: {asset.metadata?.width ?? "-"} x {asset.metadata?.height ?? "-"}
          </p>
        </div>
      )}
    </aside>
  );
}
