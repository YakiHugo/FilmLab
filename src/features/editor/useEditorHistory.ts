import { useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  createEditorAssetSnapshot,
  createEditorAssetSnapshotRef,
  editorSnapshotToAssetPatch,
  isEditorAssetSnapshotEqual,
  type EditorAssetSnapshot,
} from "@/features/editor/history";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectStore } from "@/stores/projectStore";
import type { Asset, AssetUpdate } from "@/types";

type PendingHistoryByKey = Record<string, EditorAssetSnapshot>;

const createHistorySessionKey = (assetId: string, key: string) => `${assetId}:${key}`;

export function useEditorHistory(selectedAsset: Asset | null) {
  const { updateAsset, updateAssetOnly } = useProjectStore(
    useShallow((state) => ({
      updateAsset: state.updateAsset,
      updateAssetOnly: state.updateAssetOnly,
    }))
  );

  const { historyByAssetId, pushHistory, undoSnapshot, redoSnapshot } = useEditorStore(
    useShallow((state) => ({
      historyByAssetId: state.historyByAssetId,
      pushHistory: state.pushHistory,
      undoSnapshot: state.undoSnapshot,
      redoSnapshot: state.redoSnapshot,
    }))
  );

  const pendingHistoryRef = useRef<PendingHistoryByKey>({});

  useEffect(() => {
    pendingHistoryRef.current = {};
  }, [selectedAsset?.id]);

  const clearPendingHistoryForAsset = useCallback((assetId: string) => {
    const prefix = `${assetId}:`;
    Object.keys(pendingHistoryRef.current).forEach((key) => {
      if (key.startsWith(prefix)) {
        delete pendingHistoryRef.current[key];
      }
    });
  }, []);

  const applyEditorPatch = useCallback(
    (patch: AssetUpdate, options?: { before?: EditorAssetSnapshot }) => {
      if (!selectedAsset) {
        return false;
      }
      const before = options?.before ?? createEditorAssetSnapshot(selectedAsset);
      const merged: Asset = { ...selectedAsset, ...patch };
      const after = createEditorAssetSnapshot(merged);
      if (isEditorAssetSnapshotEqual(before, after)) {
        return false;
      }
      pushHistory(selectedAsset.id, before);
      updateAsset(selectedAsset.id, patch);
      return true;
    },
    [pushHistory, selectedAsset, updateAsset]
  );

  const stageEditorPatch = useCallback(
    (historyKey: string, patch: AssetUpdate) => {
      if (!selectedAsset) {
        return;
      }
      const sessionKey = createHistorySessionKey(selectedAsset.id, historyKey);
      if (!pendingHistoryRef.current[sessionKey]) {
        pendingHistoryRef.current[sessionKey] = createEditorAssetSnapshot(selectedAsset);
      }
      const before = pendingHistoryRef.current[sessionKey];
      const merged: Asset = { ...selectedAsset, ...patch };
      const after = createEditorAssetSnapshotRef(merged);
      if (isEditorAssetSnapshotEqual(before, after)) {
        return;
      }
      updateAssetOnly(selectedAsset.id, patch);
    },
    [selectedAsset, updateAssetOnly]
  );

  const commitEditorPatch = useCallback(
    (historyKey: string, patch: AssetUpdate) => {
      if (!selectedAsset) {
        return false;
      }
      const sessionKey = createHistorySessionKey(selectedAsset.id, historyKey);
      const before =
        pendingHistoryRef.current[sessionKey] ?? createEditorAssetSnapshot(selectedAsset);
      delete pendingHistoryRef.current[sessionKey];
      return applyEditorPatch(patch, { before });
    },
    [applyEditorPatch, selectedAsset]
  );

  const selectedAssetId = selectedAsset?.id ?? null;

  const canUndo = Boolean(
    selectedAssetId &&
    historyByAssetId[selectedAssetId] &&
    historyByAssetId[selectedAssetId].past.length > 0
  );

  const canRedo = Boolean(
    selectedAssetId &&
    historyByAssetId[selectedAssetId] &&
    historyByAssetId[selectedAssetId].future.length > 0
  );

  const handleUndo = useCallback(() => {
    if (!selectedAsset) {
      return false;
    }
    clearPendingHistoryForAsset(selectedAsset.id);
    const current = createEditorAssetSnapshot(selectedAsset);
    const previous = undoSnapshot(selectedAsset.id, current);
    if (!previous) {
      return false;
    }
    updateAsset(selectedAsset.id, editorSnapshotToAssetPatch(previous));
    return true;
  }, [clearPendingHistoryForAsset, selectedAsset, undoSnapshot, updateAsset]);

  const handleRedo = useCallback(() => {
    if (!selectedAsset) {
      return false;
    }
    clearPendingHistoryForAsset(selectedAsset.id);
    const current = createEditorAssetSnapshot(selectedAsset);
    const next = redoSnapshot(selectedAsset.id, current);
    if (!next) {
      return false;
    }
    updateAsset(selectedAsset.id, editorSnapshotToAssetPatch(next));
    return true;
  }, [clearPendingHistoryForAsset, redoSnapshot, selectedAsset, updateAsset]);

  return {
    canUndo,
    canRedo,
    applyEditorPatch,
    stageEditorPatch,
    commitEditorPatch,
    handleUndo,
    handleRedo,
  };
}
