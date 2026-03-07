import { useEffect, useMemo, useRef } from "react";
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
  const assetIdSet = useMemo(() => new Set(assetIds), [assetIds]);
  const assetIndexById = useMemo(() => {
    const indexMap = new Map<string, number>();
    assetIds.forEach((id, index) => {
      indexMap.set(id, index);
    });
    return indexMap;
  }, [assetIds]);

  useEffect(() => {
    const nextSelected = selectedAssetIds.filter((id) => assetIdSet.has(id));
    if (nextSelected.length !== selectedAssetIds.length) {
      setSelectedAssetIds(nextSelected);
    }
    if (anchorIdRef.current && !assetIdSet.has(anchorIdRef.current)) {
      anchorIdRef.current = nextSelected[0] ?? null;
    }
  }, [assetIdSet, selectedAssetIds, setSelectedAssetIds]);

  const toggleAsset = (assetId: string, options?: ToggleAssetOptions) => {
    const additive = Boolean(options?.additive);
    const range = Boolean(options?.range);

    if (range && anchorIdRef.current) {
      const startIndex = assetIndexById.get(anchorIdRef.current) ?? -1;
      const endIndex = assetIndexById.get(assetId) ?? -1;
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
