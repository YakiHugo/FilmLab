import { useCallback, useState } from "react";
import {
  MAX_STYLE_SELECTION,
  applySelectionLimit,
  toggleSelectionWithLimit,
} from "@/lib/ai/recommendationUtils";
import { useProjectStore, type AddAssetsResult } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";

export function useWorkspaceSelection() {
  const {
    assets,
    isImporting,
    importAssets,
    selectedAssetIds,
    setSelectedAssetIds,
    clearAssetSelection,
  } = useProjectStore(
    useShallow((state) => ({
      assets: state.assets,
      isImporting: state.isImporting,
      importAssets: state.importAssets,
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
    (result: AddAssetsResult, prefixNotices?: string[]) => {
      if (result.added > 0) {
        const prev = useProjectStore.getState().selectedAssetIds;
        const merged = [...prev, ...result.addedAssetIds];
        const limited = applySelectionLimit(merged, MAX_STYLE_SELECTION);
        setSelectedAssetIds(limited.ids);
        setSelectionNotice(limited.limited ? `最多可选择 ${MAX_STYLE_SELECTION} 张素材。` : null);
      }

      const parts: string[] = prefixNotices ? [...prefixNotices] : [];

      if (result.skipped.unsupported > 0) {
        parts.push(`${result.skipped.unsupported} 个文件格式不支持已跳过。`);
      }
      if (result.skipped.oversized > 0) {
        parts.push(`${result.skipped.oversized} 个超过 50MB 的文件已跳过。`);
      }
      if (result.skipped.duplicated > 0) {
        parts.push(`${result.skipped.duplicated} 个重复文件已跳过。`);
      }
      if (result.skipped.overflow > 0) {
        parts.push(`单次最多导入 500 张，已截断 ${result.skipped.overflow} 张。`);
      }

      if (result.added > 0 && result.failed === 0) {
        parts.push(`已导入 ${result.added} 张素材。`);
      } else if (result.added > 0 && result.failed > 0) {
        parts.push(`已导入 ${result.added} 张，失败 ${result.failed} 张。`);
      } else if (result.errors.length > 0) {
        parts.push(`导入失败：${result.errors[0]}`);
      } else if (result.accepted === 0) {
        parts.push("没有可导入的新文件。请检查格式、大小或重复项。");
      } else if (result.added === 0) {
        parts.push("导入失败，请重试或更换文件。");
      }

      setImportNotice(parts.length > 0 ? parts.join(" ") : null);
    },
    [setSelectedAssetIds]
  );

  const handleFiles = useCallback(
    (
      files: FileList | null,
      resetFilters: () => void,
      onResult?: (result: AddAssetsResult) => void
    ) => {
      if (isImporting) {
        setImportNotice("正在导入，请稍候。");
        return;
      }
      if (!files || files.length === 0) {
        return;
      }

      resetFilters();
      void importAssets(files)
        .then((result) => {
          handleImportResult(result);
          onResult?.(result);
        })
        .catch(() => {
          setImportNotice("导入失败，请重试或更换文件。");
        });
    },
    [handleImportResult, importAssets, isImporting]
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

