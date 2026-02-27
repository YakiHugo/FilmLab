import { useCallback } from "react";
import { useAssetStore } from "@/stores/assetStore";

export function useBatchOperations() {
  const selectedAssetIds = useAssetStore((state) => state.selectedAssetIds);
  const addTagsToAssets = useAssetStore((state) => state.addTagsToAssets);
  const removeTagsFromAssets = useAssetStore((state) => state.removeTagsFromAssets);
  const deleteAssets = useAssetStore((state) => state.deleteAssets);

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

  return {
    selectedAssetIds,
    addTag,
    removeTag,
    removeSelection,
  };
}
