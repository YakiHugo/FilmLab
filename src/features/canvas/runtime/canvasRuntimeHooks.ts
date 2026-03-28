import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { selectionIdsEqual } from "../selectionModel";
import type { BoardPreviewPriority } from "../boardImageRendering";
import { useCanvasRuntimeScope } from "./canvasRuntimeContext";
import type { CanvasPreviewEntry } from "./canvasPreviewRuntimeState";

export const useCanvasPreviewEntry = (
  elementId: string
): CanvasPreviewEntry | undefined => {
  const scope = useCanvasRuntimeScope();
  return useStoreWithEqualityFn(
    scope.store,
    (state) => state.previewEntries[elementId],
    Object.is
  );
};

export const useCanvasElementDraftRenderState = (elementId: string | null) => {
  const scope = useCanvasRuntimeScope();
  return useStoreWithEqualityFn(
    scope.store,
    (state) => (elementId ? state.draftRenderStateByElementId[elementId] : undefined),
    Object.is
  );
};

export const useCanvasRuntimeAsset = (assetId: string | null) => {
  const scope = useCanvasRuntimeScope();
  const subscribe = useCallback(
    (listener: () => void) => scope.subscribeRuntimeAsset(assetId, listener),
    [assetId, scope]
  );
  const getRuntimeAssetSnapshot = useCallback(
    () => scope.getRuntimeAssetSnapshot(assetId),
    [assetId, scope]
  );
  const runtimeAssetSnapshot = useSyncExternalStore(
    subscribe,
    getRuntimeAssetSnapshot,
    getRuntimeAssetSnapshot
  );

  return useMemo(
    () => ({
      asset: runtimeAssetSnapshot?.asset ?? null,
      assetRenderFingerprint: runtimeAssetSnapshot?.renderFingerprint ?? null,
    }),
    [runtimeAssetSnapshot]
  );
};

export const useCanvasPreviewActions = () => {
  const scope = useCanvasRuntimeScope();
  return useMemo(
    () => ({
      clearElementDraftRenderState: scope.clearElementDraftRenderState,
      invalidateBoardPreview: scope.invalidateBoardPreview,
      releaseBoardPreview: scope.releaseBoardPreview,
      requestBoardPreview: (
        elementId: string,
        priority: BoardPreviewPriority
      ) => {
        scope.requestBoardPreview(elementId, priority);
      },
      setElementDraftRenderState: scope.setElementDraftRenderState,
    }),
    [scope]
  );
};

export const useCanvasSelectionPreview = () => {
  const scope = useCanvasRuntimeScope();
  const selectionPreviewElementIds = useStoreWithEqualityFn(
    scope.store,
    (state) => state.selectionPreviewElementIds,
    selectionIdsEqual
  );

  return useMemo(
    () => ({
      clearSelectionPreview: scope.clearSelectionPreview,
      selectionPreviewElementIds,
      setSelectionPreviewElementIds: scope.setSelectionPreviewElementIds,
    }),
    [scope, selectionPreviewElementIds]
  );
};

export const useCanvasPrimarySelectionPreviewElementId = () => {
  const scope = useCanvasRuntimeScope();
  return useStoreWithEqualityFn(
    scope.store,
    (state) => state.selectionPreviewElementIds?.[0] ?? null,
    Object.is
  );
};
