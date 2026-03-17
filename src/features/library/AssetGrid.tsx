import { useVirtualizer } from "@tanstack/react-virtual";
import { Heart } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
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
  onImport: (files: FileList) => void;
  onToggleLike: (assetId: string, nextLiked: boolean) => void;
}

type CompactOrListView = Exclude<LibraryView, "masonry">;

const LIST_ITEM_HEIGHT = 86;
const COMPACT_CARD_WIDTH = 230;
const COMPACT_ROW_HEIGHT = 300;

const SELECTED_BORDER = "border-yellow-500";

const resolveMasonryColumns = (width: number) => {
  if (width >= 1480) return 4;
  if (width >= 1100) return 3;
  return 2;
};

const toKb = (size: number) => `${Math.max(1, Math.round(size / 1024))} KB`;

const MasonryAssetCard = memo(function MasonryAssetCard({
  asset,
  isSelected,
  onSelectAsset,
  onToggleLike,
}: {
  asset: Asset;
  isSelected: boolean;
  onSelectAsset: AssetGridProps["onSelectAsset"];
  onToggleLike: AssetGridProps["onToggleLike"];
}) {
  const isLiked = (asset.tags ?? []).includes("liked");

  return (
    <article
      className={cn(
        "break-inside-avoid bg-[#0a0b0d] p-2.5 transition",
        isSelected ? SELECTED_BORDER : "hover:bg-[#0e0f12]"
      )}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={(event) =>
          onSelectAsset(asset.id, {
            additive: event.ctrlKey || event.metaKey,
            range: event.shiftKey,
          })
        }
      >
        <p className="truncate pb-1.5 text-[11px] font-medium tracking-wide text-zinc-300">
          {asset.name}
        </p>
        <div className={cn("overflow-hidden bg-[#08090b] transition", "hover:bg-[#0c0d0f]")}>
          <img
            src={asset.thumbnailUrl || asset.objectUrl}
            alt={asset.name}
            className="w-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="flex items-center justify-end pt-2">
          <button
            type="button"
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 transition",
              isLiked
                ? "bg-rose-500/20 text-rose-300"
                : "bg-black/35 text-zinc-500 hover:text-zinc-200"
            )}
            onClick={(event) => {
              event.stopPropagation();
              onToggleLike(asset.id, !isLiked);
            }}
            aria-label={isLiked ? "Unlike asset" : "Like asset"}
          >
            <Heart className={cn("h-3.5 w-3.5", isLiked && "fill-current")} />
          </button>
        </div>
      </button>
    </article>
  );
});

const AssetCard = memo(function AssetCard({
  asset,
  isSelected,
  view,
  onSelectAsset,
  onToggleLike,
}: {
  asset: Asset;
  isSelected: boolean;
  view: CompactOrListView;
  onSelectAsset: AssetGridProps["onSelectAsset"];
  onToggleLike: AssetGridProps["onToggleLike"];
}) {
  const src = asset.thumbnailUrl || asset.objectUrl;
  const importDay = asset.importDay || asset.createdAt.slice(0, 10);
  const isLiked = (asset.tags ?? []).includes("liked");

  if (view === "list") {
    return (
      <article
        className={cn(
          "bg-[#0a0b0d] p-2 transition",
          isSelected ? SELECTED_BORDER : "hover:bg-[#0e0f12]"
        )}
      >
        <button
          type="button"
          className="flex w-full items-center gap-3 text-left"
          onClick={(event) =>
            onSelectAsset(asset.id, {
              additive: event.ctrlKey || event.metaKey,
              range: event.shiftKey,
            })
          }
        >
          <img
            src={src}
            alt={asset.name}
            className="h-[70px] w-[70px] object-cover"
            loading="lazy"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-zinc-100">{asset.name}</p>
            <p className="truncate text-xs text-zinc-500">{importDay}</p>
          </div>
          <p className="text-xs text-zinc-500">{toKb(asset.size)}</p>
          <button
            type="button"
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 transition",
              isLiked
                ? "bg-rose-500/20 text-rose-300"
                : "bg-black/35 text-zinc-500 hover:text-zinc-200"
            )}
            onClick={(event) => {
              event.stopPropagation();
              onToggleLike(asset.id, !isLiked);
            }}
            aria-label={isLiked ? "Unlike asset" : "Like asset"}
          >
            <Heart className={cn("h-3.5 w-3.5", isLiked && "fill-current")} />
          </button>
        </button>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "bg-[#0a0b0d] p-2.5 transition",
        isSelected ? SELECTED_BORDER : "hover:bg-[#0e0f12]"
      )}
    >
      <button
        type="button"
        className="group block w-full text-left"
        onClick={(event) =>
          onSelectAsset(asset.id, {
            additive: event.ctrlKey || event.metaKey,
            range: event.shiftKey,
          })
        }
      >
        <p className="truncate pb-1.5 text-[11px] font-medium tracking-wide text-zinc-300">
          {asset.name}
        </p>
        <div className={cn("overflow-hidden bg-[#08090b] transition", "group-hover:bg-[#0c0d0f]")}>
          <img
            src={src}
            alt={asset.name}
            className="h-[236px] w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        </div>
        <div className="flex items-center justify-between pt-2 text-zinc-600">
          <button
            type="button"
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 transition",
              isLiked
                ? "bg-rose-500/20 text-rose-300"
                : "bg-black/35 text-zinc-500 hover:text-zinc-200"
            )}
            onClick={(event) => {
              event.stopPropagation();
              onToggleLike(asset.id, !isLiked);
            }}
            aria-label={isLiked ? "Unlike asset" : "Like asset"}
          >
            <Heart className={cn("h-3.5 w-3.5", isLiked && "fill-current")} />
          </button>
          <span className="text-[11px]">{toKb(asset.size)}</span>
        </div>
      </button>
    </article>
  );
});

export function AssetGrid({
  assets,
  selectedSet,
  view,
  onSelectAsset,
  onImport,
  onToggleLike,
}: AssetGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [isDragging, setIsDragging] = useState(false);
  const isMasonry = view === "masonry";
  const isCompact = view === "grid-compact";
  const isList = view === "list";

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

  const masonryColumns = resolveMasonryColumns(containerWidth);
  const compactColumns = Math.max(1, Math.floor(containerWidth / COMPACT_CARD_WIDTH));
  const compactRowCount = Math.ceil(assets.length / compactColumns);

  const rowVirtualizer = useVirtualizer({
    count: assets.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LIST_ITEM_HEIGHT,
    overscan: 7,
    enabled: isList,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  const compactVirtualizer = useVirtualizer({
    count: compactRowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => COMPACT_ROW_HEIGHT,
    overscan: 6,
    enabled: isCompact,
  });
  const compactVirtualRows = compactVirtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className="relative min-h-0 flex-1 overflow-auto bg-[#121214]"
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget && event.currentTarget.contains(nextTarget as Node)) {
          return;
        }
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (event.dataTransfer.files.length > 0) {
          onImport(event.dataTransfer.files);
        }
      }}
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center border border-yellow-500 bg-yellow-500/15 text-sm text-yellow-200 backdrop-blur-sm">
          Drop photos to import
        </div>
      )}

      {assets.length === 0 && (
        <div className="bg-[#0a0b0d] p-8 text-center text-sm text-zinc-500">
          No photos match current filters.
        </div>
      )}

      {assets.length > 0 && isMasonry && (
        <div
          style={{
            columnCount: masonryColumns,
            columnGap: 0,
          }}
        >
          {assets.map((asset) => (
            <MasonryAssetCard
              key={asset.id}
              asset={asset}
              isSelected={selectedSet.has(asset.id)}
              onSelectAsset={onSelectAsset}
              onToggleLike={onToggleLike}
            />
          ))}
        </div>
      )}

      {assets.length > 0 && isCompact && (
        <div
          className="relative w-full"
          style={{ height: `${compactVirtualizer.getTotalSize()}px` }}
        >
          {compactVirtualRows.map((virtualRow) => {
            const from = virtualRow.index * compactColumns;
            const rowAssets = assets.slice(from, from + compactColumns);
            return (
              <div
                key={virtualRow.key}
                className="absolute left-0 top-0 grid w-full"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  gridTemplateColumns: `repeat(${compactColumns}, minmax(0, 1fr))`,
                }}
              >
                {rowAssets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    isSelected={selectedSet.has(asset.id)}
                    view="grid-compact"
                    onSelectAsset={onSelectAsset}
                    onToggleLike={onToggleLike}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {assets.length > 0 && isList && (
        <div
          className="relative w-full"
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
          }}
        >
          {virtualRows.map((virtualRow) => {
            const asset = assets[virtualRow.index];
            if (!asset) {
              return null;
            }
            return (
              <div
                key={virtualRow.key}
                className="grid"
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  gridTemplateColumns: "minmax(0, 1fr)",
                }}
              >
                <AssetCard
                  asset={asset}
                  isSelected={selectedSet.has(asset.id)}
                  view="list"
                  onSelectAsset={onSelectAsset}
                  onToggleLike={onToggleLike}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
