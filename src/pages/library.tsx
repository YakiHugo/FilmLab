import { motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
  const assets = useAssetStore((state) => state.assets);
  const importAssets = useAssetStore((state) => state.importAssets);

  const { filters, updateFilters, filteredAssets, dayOptions } = useLibraryFilters(assets);
  const { selectedAssetIds, selectedSet, toggleAsset, toggleAll } =
    useAssetSelection(filteredAssets);
  const [detailPanelOpen, setDetailPanelOpen] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetIds[0]) ?? null,
    [assets, selectedAssetIds]
  );

  const handleImport = (files: FileList) => {
    void importAssets(files);
  };

  return (
    <div className="flex h-[calc(100dvh-44px)] overflow-hidden bg-[#121214]">
      <LibraryFilterSidebar
        dayOptions={dayOptions}
        onImport={handleImport}
        className="hidden w-[280px] shrink-0 lg:flex"
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
          onToggleFilterPanel={() => setMobileFiltersOpen(true)}
        />

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
        />
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

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm lg:hidden">
          <div className="absolute left-0 top-0 h-full w-[86vw] max-w-[320px] bg-[#121214]">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Filters</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 rounded-sm border border-white/10 bg-black/45 text-zinc-200 hover:border-white/20 hover:bg-white/[0.08] focus-visible:border-yellow-500/60 focus-visible:ring-0"
                onClick={() => setMobileFiltersOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <LibraryFilterSidebar
              dayOptions={dayOptions}
              onImport={handleImport}
              className="h-[calc(100%-40px)]"
            />
          </div>
          <button
            type="button"
            className="absolute inset-0 -z-10 h-full w-full"
            onClick={() => setMobileFiltersOpen(false)}
            aria-label="Close filters"
          />
        </div>
      )}
    </div>
  );
}
