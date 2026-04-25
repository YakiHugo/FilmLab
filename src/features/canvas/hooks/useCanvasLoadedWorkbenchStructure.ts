import { useMemo } from "react";
import { shallow } from "zustand/shallow";
import { useCanvasStore, type CanvasState } from "@/stores/canvasStore";
import { bindCanvasLoadedWorkbenchStructure } from "../store/canvasLoadedWorkbenchPorts";
import { selectResolvedLoadedWorkbenchId } from "../store/canvasStoreSelectors";

const selectStructureStoreApi = (state: CanvasState) => ({
  deleteNodesInWorkbench: state.deleteNodesInWorkbench,
  duplicateNodesInWorkbench: state.duplicateNodesInWorkbench,
  groupNodesInWorkbench: state.groupNodesInWorkbench,
  nudgeElementsInWorkbench: state.nudgeElementsInWorkbench,
  reorderElementsInWorkbench: state.reorderElementsInWorkbench,
  reparentNodesInWorkbench: state.reparentNodesInWorkbench,
  toggleElementLockInWorkbench: state.toggleElementLockInWorkbench,
  toggleElementVisibilityInWorkbench: state.toggleElementVisibilityInWorkbench,
  ungroupNodeInWorkbench: state.ungroupNodeInWorkbench,
});

export function useCanvasLoadedWorkbenchStructure() {
  const loadedWorkbenchId = useCanvasStore(selectResolvedLoadedWorkbenchId);
  const storeApi = useCanvasStore(selectStructureStoreApi, shallow);

  return useMemo(
    () =>
      bindCanvasLoadedWorkbenchStructure({
        storeApi,
        workbenchId: loadedWorkbenchId,
      }),
    [loadedWorkbenchId, storeApi]
  );
}
