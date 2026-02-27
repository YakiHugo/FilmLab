import { useMemo } from "react";
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

  const { filters, setFilters, filteredAssets, dayOptions, tagOptions } = useLibraryFilters(assets);
  const { selectedAssetIds, selectedSet, toggleAsset } = useAssetSelection(filteredAssets);
  const { addTag, removeTag, removeSelection } = useBatchOperations();

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

      <FilterBar filters={filters} dayOptions={dayOptions} tagOptions={tagOptions} onChange={setFilters} />

      <BatchActionsBar
        selectedCount={selectedAssetIds.length}
        onAddTag={addTag}
        onRemoveTag={removeTag}
        onDelete={() => {
          void removeSelection();
        }}
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <AssetGrid assets={filteredAssets} selectedSet={selectedSet} onToggleSelect={toggleAsset} />
        <AssetDetailPanel asset={selectedAsset} />
      </div>
    </div>
  );
}
