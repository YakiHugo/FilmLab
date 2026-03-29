import type { CanvasImageRenderStateV1 } from "@/render/image";
import type { Asset } from "@/types";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { BoardPreviewPriority } from "../boardImageRendering";
import {
  createCanvasPreviewRuntimeController,
  type CanvasPreviewRuntimeController,
} from "./canvasPreviewRuntimeController";
import {
  createCanvasRuntimeAssetSnapshotById,
  createInitialCanvasRuntimeState,
  type CanvasRuntimeAssetSnapshot,
  resolveNextSelectionPreviewElementIds,
  type CanvasRuntimeAssetChangeSet,
  type CanvasRuntimeScopeInput,
  type CanvasRuntimeState,
} from "./canvasPreviewRuntimeState";

export interface CanvasRuntimeScope {
  clearElementDraftRenderState: (elementId: string) => void;
  clearSelectionPreview: () => void;
  dispose: () => void;
  refreshPreviewsForChangedAssets: (changedAssetIds: Iterable<string>) => void;
  getInput: () => CanvasRuntimeScopeInput;
  getRuntimeAsset: (assetId: string | null) => Asset | null;
  getRuntimeAssetSnapshot: (assetId: string | null) => CanvasRuntimeAssetSnapshot | null;
  getRuntimeAssetRenderFingerprint: (assetId: string | null) => string | null;
  invalidateBoardPreview: (elementId: string) => void;
  releaseBoardPreview: (elementId: string) => void;
  requestBoardPreview: (elementId: string, priority: BoardPreviewPriority) => void;
  reset: () => void;
  setElementDraftRenderState: (
    elementId: string,
    renderState: CanvasImageRenderStateV1 | undefined
  ) => void;
  setSelectionPreviewElementIds: (ids: string[] | null) => void;
  subscribeRuntimeAsset: (assetId: string | null, listener: () => void) => () => void;
  syncRuntimeAssets: (changeSet: CanvasRuntimeAssetChangeSet) => void;
  store: StoreApi<CanvasRuntimeState>;
  updateInput: (input: CanvasRuntimeScopeInput) => void;
}

export const createCanvasRuntimeScope = (
  initialInput: CanvasRuntimeScopeInput
): CanvasRuntimeScope => {
  const store = createStore<CanvasRuntimeState>(() => createInitialCanvasRuntimeState());
  let input = initialInput;
  let disposed = false;
  const runtimeAssetSnapshotById = createCanvasRuntimeAssetSnapshotById(
    Array.from(initialInput.assetById.values())
  );
  const runtimeAssetListenersByAssetId = new Map<string, Set<() => void>>();

  const previewController: CanvasPreviewRuntimeController =
    createCanvasPreviewRuntimeController({
      getInput: () => input,
      store,
    });

  const setRuntimeState = (
    update:
      | Partial<CanvasRuntimeState>
      | ((state: CanvasRuntimeState) => Partial<CanvasRuntimeState> | CanvasRuntimeState)
  ) => {
    if (disposed) {
      return;
    }
    store.setState(update);
  };

  const notifyRuntimeAssetListeners = (assetIds: Iterable<string>) => {
    const listeners = new Set<() => void>();
    for (const assetId of assetIds) {
      const assetListeners = runtimeAssetListenersByAssetId.get(assetId);
      if (!assetListeners) {
        continue;
      }
      for (const listener of assetListeners) {
        listeners.add(listener);
      }
    }
    for (const listener of listeners) {
      listener();
    }
  };

  const clearElementDraftRenderState = (elementId: string) => {
    setRuntimeState((state) => {
      if (!(elementId in state.draftRenderStateByElementId)) {
        return state;
      }
      const nextDraftRenderStateByElementId = {
        ...state.draftRenderStateByElementId,
      };
      delete nextDraftRenderStateByElementId[elementId];
      return {
        draftRenderStateByElementId: nextDraftRenderStateByElementId,
      };
    });
  };

  const clearSelectionPreview = () => {
    setRuntimeState((state) =>
      state.selectionPreviewElementIds === null
        ? state
        : { selectionPreviewElementIds: null }
    );
  };

  const setElementDraftRenderState = (
    elementId: string,
    renderState: CanvasImageRenderStateV1 | undefined
  ) => {
    setRuntimeState((state) => ({
      draftRenderStateByElementId: {
        ...state.draftRenderStateByElementId,
        [elementId]: renderState,
      },
    }));
  };

  const setSelectionPreviewElementIds = (ids: string[] | null) => {
    setRuntimeState((state) => {
      const nextSelectionPreviewElementIds = resolveNextSelectionPreviewElementIds(
        state.selectionPreviewElementIds,
        ids
      );
      return nextSelectionPreviewElementIds === state.selectionPreviewElementIds
        ? state
        : {
            selectionPreviewElementIds: nextSelectionPreviewElementIds,
          };
    });
  };

  const resetRuntimeAssets = () => {
    const assetIdsToInvalidate = Array.from(runtimeAssetSnapshotById.keys());
    runtimeAssetSnapshotById.clear();
    input.assetById.clear();
    notifyRuntimeAssetListeners(assetIdsToInvalidate);
  };

  const reset = () => {
    previewController.reset();
    resetRuntimeAssets();
  };

  return {
    clearElementDraftRenderState,
    clearSelectionPreview,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      runtimeAssetListenersByAssetId.clear();
      runtimeAssetSnapshotById.clear();
      previewController.dispose();
    },
    refreshPreviewsForChangedAssets: previewController.refreshPreviewsForChangedAssets,
    getInput: () => input,
    getRuntimeAsset: (assetId) =>
      assetId ? runtimeAssetSnapshotById.get(assetId)?.asset ?? null : null,
    getRuntimeAssetSnapshot: (assetId) =>
      assetId ? runtimeAssetSnapshotById.get(assetId) ?? null : null,
    getRuntimeAssetRenderFingerprint: (assetId) =>
      assetId ? runtimeAssetSnapshotById.get(assetId)?.renderFingerprint ?? null : null,
    invalidateBoardPreview: previewController.invalidateBoardPreview,
    releaseBoardPreview: previewController.releaseBoardPreview,
    requestBoardPreview: previewController.requestBoardPreview,
    reset,
    setElementDraftRenderState,
    setSelectionPreviewElementIds,
    subscribeRuntimeAsset: (assetId, listener) => {
      if (!assetId) {
        return () => {};
      }

      const assetListeners = runtimeAssetListenersByAssetId.get(assetId) ?? new Set();
      assetListeners.add(listener);
      runtimeAssetListenersByAssetId.set(assetId, assetListeners);

      return () => {
        const currentAssetListeners = runtimeAssetListenersByAssetId.get(assetId);
        if (!currentAssetListeners) {
          return;
        }
        currentAssetListeners.delete(listener);
        if (currentAssetListeners.size === 0) {
          runtimeAssetListenersByAssetId.delete(assetId);
        }
      };
    },
    syncRuntimeAssets: (changeSet) => {
      if (changeSet.changedAssetIds.size === 0) {
        return;
      }

      for (const assetId of changeSet.changedAssetIds) {
        const nextAsset = changeSet.nextAssetById.get(assetId);
        if (nextAsset) {
          const renderFingerprint =
            changeSet.nextAssetRenderFingerprintById.get(assetId) ??
            runtimeAssetSnapshotById.get(assetId)?.renderFingerprint ??
            "";
          input.assetById.set(assetId, nextAsset);
          runtimeAssetSnapshotById.set(assetId, {
            asset: nextAsset,
            renderFingerprint,
          } satisfies CanvasRuntimeAssetSnapshot);
          continue;
        }

        input.assetById.delete(assetId);
        runtimeAssetSnapshotById.delete(assetId);
      }

      notifyRuntimeAssetListeners(changeSet.changedAssetIds);
    },
    store,
    updateInput: (nextInput) => {
      input = nextInput;
    },
  };
};
