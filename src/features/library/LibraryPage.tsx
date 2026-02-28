import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAssetStore } from "@/stores/assetStore";
import { AssetGrid } from "./AssetGrid";
import { AssetMetadataPanel } from "./AssetMetadataPanel";
import { LibraryFilterSidebar } from "./LibraryFilterSidebar";
import { LibraryToolbar } from "./LibraryToolbar";
import { useAssetSelection } from "./hooks/useAssetSelection";
import { useLibraryFilters } from "./hooks/useLibraryFilters";
import type { LibraryView } from "./types";

export function LibraryPage() {
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
    <div className="flex h-[calc(100dvh-64px)] overflow-hidden border-y border-white/10 bg-[#121316]">
      <LibraryFilterSidebar
        dayOptions={dayOptions}
        onImport={handleImport}
        className="hidden w-[280px] shrink-0 border-r border-white/10 lg:flex"
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

      <AnimatePresence initial={false}>
        {detailPanelOpen ? (
          <motion.div
            key="metadata-panel"
            initial={{ width: 0, opacity: 0, x: 18 }}
            animate={{ width: 320, opacity: 1, x: 0 }}
            exit={{ width: 0, opacity: 0, x: 18 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="hidden shrink-0 overflow-hidden border-l border-white/10 lg:block"
          >
            <AssetMetadataPanel
              asset={selectedAsset}
              selectedCount={selectedAssetIds.length}
              className="h-full"
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm lg:hidden">
          <div className="absolute left-0 top-0 h-full w-[86vw] max-w-[320px] border-r border-white/10 bg-[#111115]">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
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
