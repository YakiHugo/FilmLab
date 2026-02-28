import { useCallback } from "react";
import { useAssetStore } from "@/stores/assetStore";

export function useBatchOperations() {
  const selectedAssetIds = useAssetStore((state) => state.selectedAssetIds);
  const addTagsToAssets = useAssetStore((state) => state.addTagsToAssets);
  const removeTagsFromAssets = useAssetStore((state) => state.removeTagsFromAssets);
  const deleteAssets = useAssetStore((state) => state.deleteAssets);
  const applyPresetToSelection = useAssetStore((state) => state.applyPresetToSelection);

  const addTag = useCallback(
    (tag: string) => {
      const next = tag.trim();
      if (!next || selectedAssetIds.length === 0) {
        return;
      }
      addTagsToAssets(selectedAssetIds, [next]);
    },
    [addTagsToAssets, selectedAssetIds]
  );

  const removeTag = useCallback(
    (tag: string) => {
      const next = tag.trim();
      if (!next || selectedAssetIds.length === 0) {
        return;
      }
      removeTagsFromAssets(selectedAssetIds, [next]);
    },
    [removeTagsFromAssets, selectedAssetIds]
  );

  const removeSelection = useCallback(async () => {
    if (selectedAssetIds.length === 0) {
      return;
    }
    await deleteAssets(selectedAssetIds);
  }, [deleteAssets, selectedAssetIds]);

  const applyPreset = useCallback(
    (presetId: string) => {
      if (!presetId || selectedAssetIds.length === 0) {
        return;
      }
      applyPresetToSelection(selectedAssetIds, presetId, 100);
    },
    [applyPresetToSelection, selectedAssetIds]
  );

  return {
    selectedAssetIds,
    addTag,
    removeTag,
    removeSelection,
    applyPreset,
  };
}
