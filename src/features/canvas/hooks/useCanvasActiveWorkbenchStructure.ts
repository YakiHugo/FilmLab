import { useMemo } from "react";
import { shallow } from "zustand/shallow";
import { useCanvasStore, type CanvasState } from "@/stores/canvasStore";
import { bindCanvasActiveWorkbenchStructure } from "../store/canvasActiveWorkbenchPorts";
import { useCanvasActiveWorkbenchId } from "./useCanvasActiveWorkbenchId";

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

export function useCanvasActiveWorkbenchStructure() {
  const activeWorkbenchId = useCanvasActiveWorkbenchId();
  const storeApi = useCanvasStore(selectStructureStoreApi, shallow);

  return useMemo(
    () =>
      bindCanvasActiveWorkbenchStructure({
        storeApi,
        workbenchId: activeWorkbenchId,
      }),
    [activeWorkbenchId, storeApi]
  );
}
