import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useAssetStore } from "@/stores/assetStore";
import { AssetDetailPanel } from "./AssetDetailPanel";
import { AssetGrid } from "./AssetGrid";
import { BatchActionsBar } from "./BatchActionsBar";
import { FilterBar } from "./FilterBar";
import { ImportDropZone } from "./ImportDropZone";
import { useAssetSelection } from "./hooks/useAssetSelection";
import { useBatchOperations } from "./hooks/useBatchOperations";
import { useLibraryFilters } from "./hooks/useLibraryFilters";

export function LibraryPage() {
  const assets = useAssetStore((state) => state.assets);
  const isImporting = useAssetStore((state) => state.isImporting);
  const importAssets = useAssetStore((state) => state.importAssets);

  const {
    filters,
    setFilters,
    resetFilters,
    filteredAssets,
    dayOptions,
    tagOptions,
  } = useLibraryFilters(assets);
  const { selectedAssetIds, selectedSet, toggleAsset, toggleAll } = useAssetSelection(filteredAssets);
  const { addTag, removeTag, removeSelection, applyPreset } = useBatchOperations();

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetIds[0]) ?? null,
    [assets, selectedAssetIds]
  );

  return (
    <div className="space-y-3">
      <ImportDropZone
        isImporting={isImporting}
        onImport={(files) => {
          void importAssets(files);
        }}
      />

      <FilterBar
        filters={filters}
        dayOptions={dayOptions}
        tagOptions={tagOptions}
        onChange={setFilters}
        onReset={resetFilters}
      />

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">{filteredAssets.length} results</p>
        <Button
          size="sm"
          variant="secondary"
          className="rounded-xl border border-white/10 bg-black/45"
          onClick={toggleAll}
          disabled={filteredAssets.length === 0}
        >
          {selectedAssetIds.length === filteredAssets.length ? "Clear Selection" : "Select All"}
        </Button>
      </div>

      <BatchActionsBar
        selectedCount={selectedAssetIds.length}
        onAddTag={addTag}
        onRemoveTag={removeTag}
        onDelete={() => {
          void removeSelection();
        }}
        onApplyPreset={applyPreset}
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
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
        />
        <AssetDetailPanel asset={selectedAsset} />
      </div>
    </div>
  );
}
