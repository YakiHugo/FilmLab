import { useMemo, useRef } from "react";
import type { Asset } from "@/types";
import { useAssetStore } from "@/stores/assetStore";

interface ToggleAssetOptions {
  additive?: boolean;
  range?: boolean;
}

export function useAssetSelection(assets: Asset[]) {
  const selectedAssetIds = useAssetStore((state) => state.selectedAssetIds);
  const setSelectedAssetIds = useAssetStore((state) => state.setSelectedAssetIds);
  const clearAssetSelection = useAssetStore((state) => state.clearAssetSelection);
  const anchorIdRef = useRef<string | null>(null);

  const selectedSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const assetIds = useMemo(() => assets.map((asset) => asset.id), [assets]);

  const toggleAsset = (assetId: string, options?: ToggleAssetOptions) => {
    const additive = Boolean(options?.additive);
    const range = Boolean(options?.range);

    if (range && anchorIdRef.current) {
      const startIndex = assetIds.indexOf(anchorIdRef.current);
      const endIndex = assetIds.indexOf(assetId);
      if (startIndex >= 0 && endIndex >= 0) {
        const [from, to] =
          startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        const rangeIds = assetIds.slice(from, to + 1);
        if (additive) {
          const merged = Array.from(new Set([...selectedAssetIds, ...rangeIds]));
          setSelectedAssetIds(merged);
        } else {
          setSelectedAssetIds(rangeIds);
        }
        return;
      }
    }

    if (additive) {
      if (selectedSet.has(assetId)) {
        setSelectedAssetIds(selectedAssetIds.filter((id) => id !== assetId));
      } else {
        setSelectedAssetIds([...selectedAssetIds, assetId]);
      }
      anchorIdRef.current = assetId;
      return;
    }

    setSelectedAssetIds([assetId]);
    anchorIdRef.current = assetId;
  };

  const toggleAll = () => {
    if (selectedAssetIds.length === assets.length) {
      clearAssetSelection();
      return;
    }
    setSelectedAssetIds(assetIds);
  };

  return {
    selectedAssetIds,
    selectedSet,
    toggleAsset,
    toggleAll,
    clearAssetSelection,
  };
}
