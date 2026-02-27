import { Link } from "@tanstack/react-router";
import type { Asset } from "@/types";
import { cn } from "@/lib/utils";

interface AssetGridProps {
  assets: Asset[];
  selectedSet: Set<string>;
  onToggleSelect: (assetId: string) => void;
}

export function AssetGrid({ assets, selectedSet, onToggleSelect }: AssetGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {assets.map((asset) => {
        const isSelected = selectedSet.has(asset.id);
        return (
          <article
            key={asset.id}
            className={cn(
              "group content-auto overflow-hidden rounded-xl border bg-black/35 transition",
              isSelected ? "border-sky-400/60" : "border-white/10 hover:border-white/25"
            )}
          >
            <button type="button" className="block w-full text-left" onClick={() => onToggleSelect(asset.id)}>
              <img
                src={asset.thumbnailUrl || asset.objectUrl}
                alt={asset.name}
                className="aspect-square w-full object-cover transition group-hover:scale-[1.02]"
                loading="lazy"
              />
              <div className="space-y-1 p-2">
                <p className="truncate text-xs font-medium text-zinc-100">{asset.name}</p>
                <p className="truncate text-[11px] text-zinc-500">{asset.importDay || asset.createdAt.slice(0, 10)}</p>
              </div>
            </button>
            <div className="border-t border-white/10 px-2 py-1.5">
              <Link
                to="/editor"
                search={{ assetId: asset.id }}
                className="text-[11px] text-zinc-400 transition hover:text-sky-300"
              >
                Open in Editor
              </Link>
            </div>
          </article>
        );
      })}
      {assets.length === 0 && (
        <div className="col-span-full rounded-2xl border border-white/10 bg-black/35 p-8 text-center text-sm text-zinc-500">
          No assets match the current filters.
        </div>
      )}
    </div>
  );
}
