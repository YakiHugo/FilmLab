import { useCallback, useState } from "react";
import {
  MAX_STYLE_SELECTION,
  applySelectionLimit,
  toggleSelectionWithLimit,
} from "@/lib/ai/recommendationUtils";
import { useProjectStore, type AddAssetsResult } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import {
  isSupportedImportFile,
  MAX_IMPORT_FILE_SIZE,
  MAX_IMPORT_BATCH_SIZE,
} from "../constants";

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
    (result: AddAssetsResult, prefixNotices?: string[]) => {
      if (result.added > 0) {
        const prev = useProjectStore.getState().selectedAssetIds;
        const merged = [...prev, ...result.addedAssetIds];
        const limited = applySelectionLimit(merged, MAX_STYLE_SELECTION);
        setSelectedAssetIds(limited.ids);
        setSelectionNotice(
          limited.limited ? `最多可选择 ${MAX_STYLE_SELECTION} 张素材。` : null
        );
      }

      const parts: string[] = prefixNotices ? [...prefixNotices] : [];

      if (result.added > 0 && result.failed === 0) {
        parts.push(`已导入 ${result.added} 张素材。`);
      } else if (result.added > 0 && result.failed > 0) {
        parts.push(`已导入 ${result.added} 张，失败 ${result.failed} 张。`);
      } else if (result.errors && result.errors.length > 0) {
        parts.push(`导入失败：${result.errors[0]}`);
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

      const notices: string[] = [];

      // Step 1: format filter
      let accepted = Array.from(files).filter((file) => isSupportedImportFile(file));
      const unsupportedCount = files.length - accepted.length;
      if (accepted.length === 0) {
        setImportNotice("仅支持导入 JPG / PNG / WebP 图片。");
        return;
      }
      if (unsupportedCount > 0) {
        notices.push(`${unsupportedCount} 个不支持的文件已跳过。`);
      }

      // Step 2: file size filter
      const oversized = accepted.filter((f) => f.size > MAX_IMPORT_FILE_SIZE);
      if (oversized.length > 0) {
        accepted = accepted.filter((f) => f.size <= MAX_IMPORT_FILE_SIZE);
        notices.push(`${oversized.length} 个超过 50 MB 的文件已跳过。`);
        if (accepted.length === 0) {
          setImportNotice(notices.join(" "));
          return;
        }
      }

      // Step 3: duplicate detection (name + size fingerprint)
      const existingAssets = useProjectStore.getState().assets;
      const existingFingerprints = new Set(
        existingAssets.map((a) => `${a.name}:${a.size}`)
      );
      const beforeDedupe = accepted.length;
      accepted = accepted.filter(
        (f) => !existingFingerprints.has(`${f.name}:${f.size}`)
      );
      const duplicateCount = beforeDedupe - accepted.length;
      if (duplicateCount > 0) {
        notices.push(`${duplicateCount} 个重复文件已跳过。`);
      }
      if (accepted.length === 0) {
        setImportNotice(
          notices.length > 0
            ? notices.join(" ")
            : "所有文件已存在，已跳过重复素材。"
        );
        return;
      }

      // Step 4: batch size limit
      if (accepted.length > MAX_IMPORT_BATCH_SIZE) {
        notices.push(`单次最多导入 ${MAX_IMPORT_BATCH_SIZE} 张，已截取前 ${MAX_IMPORT_BATCH_SIZE} 张。`);
        accepted = accepted.slice(0, MAX_IMPORT_BATCH_SIZE);
      }

      resetFilters();
      const capturedNotices = notices.length > 0 ? [...notices] : undefined;
      void addAssets(accepted)
        .then((result) => {
          handleImportResult(result, capturedNotices);
          onResult?.(result);
        })
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
