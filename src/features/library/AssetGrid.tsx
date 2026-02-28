import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "@/types";
import { cn } from "@/lib/utils";
import type { LibraryView } from "./types";

interface AssetGridProps {
  assets: Asset[];
  selectedSet: Set<string>;
  view: LibraryView;
  onSelectAsset: (
    assetId: string,
    options: {
      additive: boolean;
      range: boolean;
    }
  ) => void;
}

const GRID_ITEM_HEIGHT = 248;
const LIST_ITEM_HEIGHT = 88;
const GRID_GAP = 12;

const resolveGridColumns = (width: number) => {
  if (width >= 1440) return 6;
  if (width >= 1200) return 5;
  if (width >= 980) return 4;
  if (width >= 700) return 3;
  return 2;
};

export function AssetGrid({ assets, selectedSet, view, onSelectAsset }: AssetGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (nextWidth) {
        setContainerWidth(nextWidth);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const columns = view === "grid" ? resolveGridColumns(containerWidth) : 1;
  const rowCount = Math.ceil(assets.length / columns);
  const estimateSize = view === "grid" ? GRID_ITEM_HEIGHT + GRID_GAP : LIST_ITEM_HEIGHT + GRID_GAP;

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan: 6,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  const rowClassName = "grid gap-3";

  const gridTemplateColumns = useMemo(
    () =>
      view === "grid"
        ? `repeat(${columns}, minmax(0, 1fr))`
        : "minmax(0, 1fr)",
    [columns, view]
  );

  return (
    <div
      ref={scrollRef}
      className="h-[calc(100dvh-340px)] min-h-[460px] overflow-auto rounded-2xl border border-white/10 bg-black/25 p-3"
    >
      {assets.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-black/35 p-8 text-center text-sm text-zinc-500">
          No assets match the current filters.
        </div>
      )}

      {assets.length > 0 && (
        <div
          className="relative w-full"
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
          }}
        >
          {virtualRows.map((virtualRow) => {
            const startIndex = virtualRow.index * columns;
            const rowAssets = assets.slice(startIndex, startIndex + columns);
            return (
              <div
                key={virtualRow.key}
                className={rowClassName}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingBottom: `${GRID_GAP}px`,
                  gridTemplateColumns,
                }}
              >
                {rowAssets.map((asset) => {
                  const isSelected = selectedSet.has(asset.id);
                  return (
                    <article
                      key={asset.id}
                      className={cn(
                        "group content-auto overflow-hidden rounded-xl border bg-black/35 transition",
                        isSelected ? "border-sky-400/60" : "border-white/10 hover:border-white/25"
                      )}
                    >
                      <button
                        type="button"
                        className={cn("block w-full text-left", view === "list" && "flex items-center gap-3")}
                        onClick={(event) =>
                          onSelectAsset(asset.id, {
                            additive: event.ctrlKey || event.metaKey,
                            range: event.shiftKey,
                          })
                        }
                      >
                        <img
                          src={asset.thumbnailUrl || asset.objectUrl}
                          alt={asset.name}
                          className={cn(
                            "object-cover transition group-hover:scale-[1.02]",
                            view === "grid" ? "aspect-square w-full" : "h-[72px] w-[72px] shrink-0 rounded-lg m-2"
                          )}
                          loading="lazy"
                        />
                        <div className="space-y-1 p-2">
                          <p className="truncate text-xs font-medium text-zinc-100">{asset.name}</p>
                          <p className="truncate text-[11px] text-zinc-500">
                            {asset.importDay || asset.createdAt.slice(0, 10)}
                          </p>
                          {view === "list" && (
                            <p className="text-[11px] text-zinc-500">{Math.round(asset.size / 1024)} KB</p>
                          )}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
