import { motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { importAssetFiles } from "@/lib/assetImport";
import { useAssetStore } from "@/stores/assetStore";
import { AssetGrid } from "@/features/library/AssetGrid";
import { AssetMetadataPanel } from "@/features/library/AssetMetadataPanel";
import { LibraryFilterSidebar } from "@/features/library/LibraryFilterSidebar";
import { LibraryToolbar } from "@/features/library/LibraryToolbar";
import { useAssetSelection } from "@/features/library/hooks/useAssetSelection";
import { useLibraryFilters } from "@/features/library/hooks/useLibraryFilters";
import type { LibraryView } from "@/features/library/types";

export function LibraryPage() {
  const navigate = useNavigate();
  const isLoading = useAssetStore((state) => state.isLoading);
  const assets = useAssetStore((state) => state.assets);
  const importAssetFromUrl = useAssetStore((state) => state.importAssetFromUrl);
  const addTagsToAssets = useAssetStore((state) => state.addTagsToAssets);
  const removeTagsFromAssets = useAssetStore((state) => state.removeTagsFromAssets);

  const { filters, updateFilters, filteredAssets, dayOptions } = useLibraryFilters(assets);
  const { selectedAssetIds, selectedSet, toggleAsset, toggleAll } =
    useAssetSelection(filteredAssets);
  const [detailPanelOpen, setDetailPanelOpen] = useState(true);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetIds[0]) ?? null,
    [assets, selectedAssetIds]
  );

  const handleImport = (files: FileList) => {
    void importAssetFiles(files);
  };

  const handleImportUrl = async (url: string) => {
    await importAssetFromUrl(url);
  };

  return (
    <div className="flex h-[calc(100dvh-44px)] overflow-hidden bg-[#121214]">
      <LibraryFilterSidebar
        dayOptions={dayOptions}
        onImport={handleImport}
        onImportUrl={handleImportUrl}
        className="w-[280px] shrink-0"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <LibraryToolbar
          view={filters.view}
          resultsCount={filteredAssets.length}
          selectedCount={selectedAssetIds.length}
          allSelected={
            selectedAssetIds.length > 0 && selectedAssetIds.length === filteredAssets.length
          }
          detailPanelOpen={detailPanelOpen}
          onViewChange={(view) => updateFilters({ view: view as LibraryView })}
          onToggleAll={toggleAll}
          onToggleDetailPanel={() => setDetailPanelOpen((current) => !current)}
        />

        {isLoading ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 bg-[#121214] p-4">
            <div>
              <p className="text-sm text-zinc-200">Loading library...</p>
              <p className="text-xs text-zinc-500">Preparing local assets and sync state.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <div
                  key={`library-loading-${index}`}
                  className="rounded-sm border border-white/10 bg-black/25 p-2.5"
                >
                  <div className="aspect-[4/5] animate-pulse bg-white/5" />
                  <div className="mt-2 h-3 w-2/3 animate-pulse bg-white/5" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <AssetGrid
            assets={filteredAssets}
            selectedSet={selectedSet}
            view={filters.view}
            onOpenInEditor={(assetId) => {
              void navigate({
                to: "/editor",
                search: { assetId },
              });
            }}
            onSelectAsset={(assetId, options) =>
              toggleAsset(assetId, {
                additive: options.additive,
                range: options.range,
              })
            }
            onImport={(files) => {
              handleImport(files);
            }}
            onToggleLike={(assetId, nextLiked) => {
              if (nextLiked) {
                addTagsToAssets([assetId], ["liked"]);
                return;
              }
              removeTagsFromAssets([assetId], ["liked"]);
            }}
          />
        )}
      </div>

      <motion.div
        initial={false}
        animate={{
          width: detailPanelOpen ? 320 : 0,
          opacity: detailPanelOpen ? 1 : 0,
        }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="hidden shrink-0 overflow-hidden will-change-[width,opacity] lg:block"
        style={{ pointerEvents: detailPanelOpen ? "auto" : "none" }}
      >
        <AssetMetadataPanel
          asset={selectedAsset}
          selectedCount={selectedAssetIds.length}
          className="h-full"
        />
      </motion.div>
    </div>
  );
}
