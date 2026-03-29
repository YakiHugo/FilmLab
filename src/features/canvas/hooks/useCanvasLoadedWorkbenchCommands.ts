import { useMemo } from "react";
import { shallow } from "zustand/shallow";
import { useCanvasStore, type CanvasState } from "@/stores/canvasStore";
import { bindCanvasLoadedWorkbenchCommands } from "../store/canvasLoadedWorkbenchPorts";
import { useCanvasLoadedWorkbenchId } from "./useCanvasLoadedWorkbenchId";

const selectCommandStoreApi = (state: CanvasState) => ({
  patchWorkbench: state.patchWorkbench,
  executeCommandInWorkbench: state.executeCommandInWorkbench,
  beginInteractionInWorkbench: state.beginInteractionInWorkbench,
  previewCommandInWorkbench: state.previewCommandInWorkbench,
  commitInteractionInWorkbench: state.commitInteractionInWorkbench,
  rollbackInteractionInWorkbench: state.rollbackInteractionInWorkbench,
  upsertElementInWorkbench: state.upsertElementInWorkbench,
  upsertElementsInWorkbench: state.upsertElementsInWorkbench,
});

export function useCanvasLoadedWorkbenchCommands() {
  const loadedWorkbenchId = useCanvasLoadedWorkbenchId();
  const storeApi = useCanvasStore(selectCommandStoreApi, shallow);

  return useMemo(
    () =>
      bindCanvasLoadedWorkbenchCommands({
        storeApi,
        workbenchId: loadedWorkbenchId,
      }),
    [loadedWorkbenchId, storeApi]
  );
}
