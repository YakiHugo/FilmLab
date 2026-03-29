import { useMemo } from "react";
import { shallow } from "zustand/shallow";
import { useCanvasStore, type CanvasState } from "@/stores/canvasStore";
import { bindCanvasLoadedWorkbenchHistoryActions } from "../store/canvasLoadedWorkbenchPorts";
import { useCanvasLoadedWorkbenchId } from "./useCanvasLoadedWorkbenchId";

const selectHistoryActionStoreApi = (state: CanvasState) => ({
  redoInWorkbench: state.redoInWorkbench,
  undoInWorkbench: state.undoInWorkbench,
});

export function useCanvasHistoryActions() {
  const loadedWorkbenchId = useCanvasLoadedWorkbenchId();
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
