import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useAssetStore } from "@/stores/assetStore";

interface LibrarySidebarProps {
  className?: string;
}

const formatDay = (day: string) => day;

export function LibrarySidebar({ className }: LibrarySidebarProps) {
  const { assets, selectedAssetIds } = useAssetStore(
    useShallow((state) => ({
      assets: state.assets,
      selectedAssetIds: state.selectedAssetIds,
    }))
  );

  const { dayGroups, tagGroups, selectedAsset } = useMemo(() => {
    const dayMap = new Map<string, number>();
    const tagMap = new Map<string, number>();

    for (const asset of assets) {
      const day = asset.importDay || asset.createdAt.slice(0, 10);
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
      for (const tag of asset.tags ?? []) {
        tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
      }
    }

    const selectedAsset = selectedAssetIds[0]
      ? assets.find((asset) => asset.id === selectedAssetIds[0]) ?? null
      : null;

    return {
      dayGroups: Array.from(dayMap.entries()).sort((a, b) => b[0].localeCompare(a[0])),
      tagGroups: Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]),
      selectedAsset,
    };
  }, [assets, selectedAssetIds]);

  return (
    <aside
      className={cn(
        "glass-panel h-[calc(100dvh-96px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/35",
        className
      )}
    >
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="text-xs uppercase tracking-[0.2em] text-zinc-400">Library Sidebar</h2>
      </div>

      <div className="space-y-5 overflow-y-auto p-4">
        <section>
          <h3 className="mb-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Dates</h3>
          <div className="space-y-1">
            {dayGroups.slice(0, 10).map(([day, count]) => (
              <div
                key={day}
                className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-2 py-1.5 text-xs text-zinc-300"
              >
                <span>{formatDay(day)}</span>
                <span className="text-zinc-500">{count}</span>
              </div>
            ))}
            {dayGroups.length === 0 && <p className="text-xs text-zinc-500">No imports yet.</p>}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {tagGroups.slice(0, 12).map(([tag, count]) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[11px] text-zinc-300"
              >
                {tag} ({count})
              </span>
            ))}
            {tagGroups.length === 0 && <p className="text-xs text-zinc-500">No tags.</p>}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Selected</h3>
          {selectedAsset ? (
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-zinc-300">
              <p className="truncate font-medium text-zinc-100">{selectedAsset.name}</p>
              <p>{Math.round(selectedAsset.size / 1024)} KB</p>
              <p>{selectedAsset.metadata?.width ?? "-"} x {selectedAsset.metadata?.height ?? "-"}</p>
              <p className="truncate text-zinc-500">{selectedAsset.id}</p>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Select an asset to view metadata.</p>
          )}
        </section>
      </div>
    </aside>
  );
}
