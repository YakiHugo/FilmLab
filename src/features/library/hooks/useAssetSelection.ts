import { useMemo } from "react";
import type { Asset } from "@/types";
import { useAssetStore } from "@/stores/assetStore";

export function useAssetSelection(assets: Asset[]) {
  const selectedAssetIds = useAssetStore((state) => state.selectedAssetIds);
  const setSelectedAssetIds = useAssetStore((state) => state.setSelectedAssetIds);
  const clearAssetSelection = useAssetStore((state) => state.clearAssetSelection);

  const selectedSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);

  const toggleAsset = (assetId: string) => {
    if (selectedSet.has(assetId)) {
      setSelectedAssetIds(selectedAssetIds.filter((id) => id !== assetId));
      return;
    }
    setSelectedAssetIds([...selectedAssetIds, assetId]);
  };

  const toggleAll = () => {
    if (selectedAssetIds.length === assets.length) {
      clearAssetSelection();
      return;
    }
    setSelectedAssetIds(assets.map((asset) => asset.id));
  };

  return {
    selectedAssetIds,
    selectedSet,
    toggleAsset,
    toggleAll,
    clearAssetSelection,
  };
}
