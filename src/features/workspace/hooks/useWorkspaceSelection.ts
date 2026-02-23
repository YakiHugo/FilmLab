import { useCallback, useState } from "react";
import {
  MAX_STYLE_SELECTION,
  applySelectionLimit,
  toggleSelectionWithLimit,
} from "@/lib/ai/recommendationUtils";
import { useProjectStore, type AddAssetsResult } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import { isSupportedImportFile } from "../constants";

export function useWorkspaceSelection() {
  const {
    assets,
    isImporting,
    addAssets,
    selectedAssetIds,
    setSelectedAssetIds,
    clearAssetSelection,
  } = useProjectStore(
    useShallow((state) => ({
      assets: state.assets,
      isImporting: state.isImporting,
      addAssets: state.addAssets,
      selectedAssetIds: state.selectedAssetIds,
      setSelectedAssetIds: state.setSelectedAssetIds,
      clearAssetSelection: state.clearAssetSelection,
    }))
  );

  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const setSelectionWithLimit = useCallback(
    (assetIds: string[]) => {
      const limited = applySelectionLimit(assetIds, MAX_STYLE_SELECTION);
      setSelectedAssetIds(limited.ids);
      setSelectionNotice(limited.limited ? `最多可选择 ${MAX_STYLE_SELECTION} 张素材。` : null);
    },
    [setSelectedAssetIds]
  );

  const handleToggleAssetSelection = useCallback(
    (assetId: string) => {
      const prev = useProjectStore.getState().selectedAssetIds;
      const next = toggleSelectionWithLimit(prev, assetId, MAX_STYLE_SELECTION);
      setSelectedAssetIds(next.ids);
      setSelectionNotice(next.limited ? `最多可选择 ${MAX_STYLE_SELECTION} 张素材。` : null);
    },
    [setSelectedAssetIds]
  );

  const handleSelectFilteredAssets = useCallback(
    (filteredAssets: Array<{ id: string }>) => {
      setSelectionWithLimit(filteredAssets.map((asset) => asset.id));
    },
    [setSelectionWithLimit]
  );

  const handleDeselectFilteredAssets = useCallback(
    (filteredAssets: Array<{ id: string }>) => {
      if (filteredAssets.length === 0) {
        return;
      }
      const filteredSet = new Set(filteredAssets.map((asset) => asset.id));
      const prev = useProjectStore.getState().selectedAssetIds;
      const nextIds = prev.filter((assetId) => !filteredSet.has(assetId));
      setSelectedAssetIds(nextIds);
      setSelectionNotice(null);
    },
    [setSelectedAssetIds]
  );

  const handleToggleAllFilteredAssets = useCallback(
    (filteredAssets: Array<{ id: string }>, allFilteredSelected: boolean) => {
      if (allFilteredSelected) {
        handleDeselectFilteredAssets(filteredAssets);
      } else {
        handleSelectFilteredAssets(filteredAssets);
      }
    },
    [handleDeselectFilteredAssets, handleSelectFilteredAssets]
  );

  const handleImportResult = useCallback(
    (result: AddAssetsResult) => {
      if (result.added > 0) {
        const prev = useProjectStore.getState().selectedAssetIds;
        const merged = [...prev, ...result.addedAssetIds];
        const limited = applySelectionLimit(merged, MAX_STYLE_SELECTION);
        setSelectedAssetIds(limited.ids);
        setSelectionNotice(
          limited.limited ? `最多可选择 ${MAX_STYLE_SELECTION} 张素材。` : null
        );
      }
      if (result.added > 0 && result.failed === 0) {
        setImportNotice(`已导入 ${result.added} 张素材。`);
        return;
      }
      if (result.added > 0 && result.failed > 0) {
        setImportNotice(`已导入 ${result.added} 张，失败 ${result.failed} 张。`);
        return;
      }
      if (result.errors && result.errors.length > 0) {
        setImportNotice(`导入失败：${result.errors[0]}`);
        return;
      }
      setImportNotice("导入失败，请重试或更换文件。");
    },
    [setSelectedAssetIds]
  );

  const handleFiles = useCallback(
    (
      files: FileList | null,
      resetFilters: () => void
    ) => {
      if (isImporting) {
        setImportNotice("正在导入，请稍候。");
        return;
      }
      if (!files || files.length === 0) {
        return;
      }
      const filtered = Array.from(files).filter((file) => isSupportedImportFile(file));
      if (filtered.length === 0) {
        setImportNotice("仅支持导入 JPG / PNG / WebP 图片。");
        return;
      }
      resetFilters();
      void addAssets(filtered)
        .then((result) => handleImportResult(result))
        .catch(() => {
          setImportNotice("导入失败，请重试或更换文件。");
        });
    },
    [addAssets, handleImportResult, isImporting]
  );

  return {
    assets,
    isImporting,
    selectedAssetIds,
    clearAssetSelection,
    selectionNotice,
    importNotice,
    setImportNotice,
    setSelectionWithLimit,
    handleToggleAssetSelection,
    handleToggleAllFilteredAssets,
    handleImportResult,
    handleFiles,
  };
}
