import { useMemo } from "react";
import { shallow } from "zustand/shallow";
import { useCanvasStore, type CanvasState } from "@/stores/canvasStore";
import { bindCanvasActiveWorkbenchHistoryActions } from "../store/canvasActiveWorkbenchPorts";
import { useCanvasActiveWorkbenchId } from "./useCanvasActiveWorkbenchId";

const selectHistoryActionStoreApi = (state: CanvasState) => ({
  redoInWorkbench: state.redoInWorkbench,
  undoInWorkbench: state.undoInWorkbench,
});

export function useCanvasHistoryActions() {
  const activeWorkbenchId = useCanvasActiveWorkbenchId();
  const storeApi = useCanvasStore(selectHistoryActionStoreApi, shallow);

  return useMemo(
    () =>
      bindCanvasActiveWorkbenchHistoryActions({
        storeApi,
        workbenchId: activeWorkbenchId,
      }),
    [activeWorkbenchId, storeApi]
  );
}
