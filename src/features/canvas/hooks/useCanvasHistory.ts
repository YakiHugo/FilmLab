import { useMemo } from "react";
import { shallow } from "zustand/shallow";
import { useCanvasStore, type CanvasState } from "@/stores/canvasStore";
import {
  selectCanRedoOnLoadedWorkbench,
  selectCanUndoOnLoadedWorkbench,
  selectResolvedLoadedWorkbenchId,
} from "../store/canvasStoreSelectors";
import { bindCanvasLoadedWorkbenchHistoryActions } from "../store/canvasLoadedWorkbenchPorts";

export function useCanvasHistoryState() {
  const canUndo = useCanvasStore(selectCanUndoOnLoadedWorkbench);
  const canRedo = useCanvasStore(selectCanRedoOnLoadedWorkbench);

  return useMemo(
    () => ({
      canRedo,
      canUndo,
    }),
    [canRedo, canUndo]
  );
}

const selectHistoryActionStoreApi = (state: CanvasState) => ({
  redoInWorkbench: state.redoInWorkbench,
  undoInWorkbench: state.undoInWorkbench,
});

export function useCanvasHistoryActions() {
  const loadedWorkbenchId = useCanvasStore(selectResolvedLoadedWorkbenchId);
  const storeApi = useCanvasStore(selectHistoryActionStoreApi, shallow);

  return useMemo(
    () =>
      bindCanvasLoadedWorkbenchHistoryActions({
        storeApi,
        workbenchId: loadedWorkbenchId,
      }),
    [loadedWorkbenchId, storeApi]
  );
}

export function useCanvasHistory() {
  const { canRedo, canUndo } = useCanvasHistoryState();
  const { redo, undo } = useCanvasHistoryActions();

  return useMemo(
    () => ({
      canRedo,
      canUndo,
      redo,
      undo,
    }),
    [canRedo, canUndo, redo, undo]
  );
}
