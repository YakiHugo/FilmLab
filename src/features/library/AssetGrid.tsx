import { useVirtualizer } from "@tanstack/react-virtual";
import { Circle, Heart, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
}

type CompactOrListView = Exclude<LibraryView, "masonry">;

const COMPACT_GAP = 10;
const LIST_GAP = 0;
const MASONRY_GAP = 14;
const COMPACT_ITEM_HEIGHT = 346;
const LIST_ITEM_HEIGHT = 94;
const COMPACT_CARD_WIDTH = 480;

const SELECTED_BORDER = "border-yellow-500";
const NORMAL_BORDER = "border-white/10";

const resolveCompactColumns = (width: number) => {
  return Math.max(1, Math.floor((width + COMPACT_GAP) / (COMPACT_CARD_WIDTH + COMPACT_GAP)));
};

const resolveMasonryColumns = (width: number) => {
  if (width >= 1480) return 4;
  if (width >= 1100) return 3;
  return 2;
};

const toKb = (size: number) => `${Math.max(1, Math.round(size / 1024))} KB`;

function MasonryAssetCard({
  asset,
  isSelected,
  onSelectAsset,
}: {
  asset: Asset;
  isSelected: boolean;
  onSelectAsset: AssetGridProps["onSelectAsset"];
}) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = cardRef.current;
    if (!node) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "260px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <article
      ref={cardRef}
      className={cn(
        "break-inside-avoid border bg-[#0f1114] p-2.5 transition",
        isSelected ? SELECTED_BORDER : `${NORMAL_BORDER} hover:border-white/20`
      )}
      style={{ marginBottom: `${MASONRY_GAP}px` }}
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
        <div
          className={cn(
            "overflow-hidden rounded-sm border bg-[#0e0f11] transition",
            `${NORMAL_BORDER} hover:border-white/25`
          )}
        >
          {isVisible ? (
            <img
              src={asset.thumbnailUrl || asset.objectUrl}
              alt={asset.name}
              className="w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="aspect-[3/4] w-full animate-pulse bg-zinc-800/40" />
          )}
        </div>
      </button>
    </article>
  );
}

function AssetCard({
  asset,
  isSelected,
  view,
  onSelectAsset,
}: {
  asset: Asset;
  isSelected: boolean;
  view: CompactOrListView;
  onSelectAsset: AssetGridProps["onSelectAsset"];
}) {
  const src = asset.thumbnailUrl || asset.objectUrl;
  const importDay = asset.importDay || asset.createdAt.slice(0, 10);

  if (view === "list") {
    return (
      <article
        className={cn(
          "border border-white/10 bg-[#0f1114] transition",
          isSelected ? SELECTED_BORDER : "hover:border-white/20"
        )}
      >
        <button
          type="button"
          className="flex w-full items-center gap-3 px-2 py-2 text-left"
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
            className="h-[70px] w-[70px] border border-white/10 object-cover"
            loading="lazy"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-zinc-100">{asset.name}</p>
            <p className="truncate text-xs text-zinc-500">{importDay}</p>
          </div>
          <p className="text-xs text-zinc-500">{toKb(asset.size)}</p>
        </button>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "border border-white/10 bg-[#0f1114] p-2.5 transition",
        isSelected ? SELECTED_BORDER : "hover:border-white/20"
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
        <p className="truncate pb-2 text-[11px] font-medium tracking-wide text-zinc-300">
          {asset.name}
        </p>
        <div
          className={cn(
            "overflow-hidden rounded-sm border bg-[#0d0e10] transition",
            `${NORMAL_BORDER} group-hover:border-white/25`,
            "mx-auto w-[480px] max-w-full"
          )}
        >
          <img
            src={src}
            alt={asset.name}
            className="h-[236px] w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        </div>
        <div className="flex items-center justify-between pt-2 text-zinc-600">
          <div className="flex items-center gap-2 text-zinc-600">
            <Star className="h-3.5 w-3.5" />
            <Heart className="h-3.5 w-3.5" />
            <Circle className="h-3.5 w-3.5" />
          </div>
          <span className="text-[11px]">{toKb(asset.size)}</span>
        </div>
      </button>
    </article>
  );
}

export function AssetGrid({ assets, selectedSet, view, onSelectAsset, onImport }: AssetGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [isDragging, setIsDragging] = useState(false);

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

  const isMasonry = view === "masonry";
  const rowView = (isMasonry ? "grid-compact" : view) as CompactOrListView;
  const columns = rowView === "grid-compact" ? resolveCompactColumns(containerWidth) : 1;
  const rowGap = rowView === "grid-compact" ? COMPACT_GAP : LIST_GAP;
  const rowHeight = rowView === "grid-compact" ? COMPACT_ITEM_HEIGHT : LIST_ITEM_HEIGHT;
  const rowCount = Math.ceil(assets.length / columns);
  const masonryColumns = resolveMasonryColumns(containerWidth);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight + rowGap,
    overscan: 7,
    enabled: !isMasonry,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className="relative min-h-0 flex-1 overflow-auto bg-[#111316] px-3 pb-4 pt-3"
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
        <div className="border border-white/10 bg-black/30 p-8 text-center text-sm text-zinc-500">
          No photos match current filters.
        </div>
      )}

      {assets.length > 0 && isMasonry && (
        <div
          style={{
            columnCount: masonryColumns,
            columnGap: `${MASONRY_GAP}px`,
          }}
        >
          {assets.map((asset) => (
            <MasonryAssetCard
              key={asset.id}
              asset={asset}
              isSelected={selectedSet.has(asset.id)}
              onSelectAsset={onSelectAsset}
            />
          ))}
        </div>
      )}

      {assets.length > 0 && !isMasonry && (
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
                className={cn("grid", rowView === "grid-compact" ? "gap-[14px]" : "gap-0")}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingBottom: `${rowGap}px`,
                  gridTemplateColumns:
                    rowView === "grid-compact"
                      ? `repeat(${columns}, ${COMPACT_CARD_WIDTH}px)`
                      : `repeat(${columns}, minmax(0, 1fr))`,
                  justifyContent: rowView === "grid-compact" ? "start" : undefined,
                }}
              >
                {rowAssets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    isSelected={selectedSet.has(asset.id)}
                    view={rowView}
                    onSelectAsset={onSelectAsset}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
