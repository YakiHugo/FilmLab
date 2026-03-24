import { useMemo } from "react";
import { shallow } from "zustand/shallow";
import { useCanvasStore, type CanvasState } from "@/stores/canvasStore";
import { bindCanvasActiveWorkbenchCommands } from "../store/canvasActiveWorkbenchPorts";
import { useCanvasActiveWorkbenchId } from "./useCanvasActiveWorkbenchId";

const selectCommandStoreApi = (state: CanvasState) => ({
  patchWorkbench: state.patchWorkbench,
  executeCommandInWorkbench: state.executeCommandInWorkbench,
  upsertElementInWorkbench: state.upsertElementInWorkbench,
  upsertElementsInWorkbench: state.upsertElementsInWorkbench,
});

export function useCanvasActiveWorkbenchCommands() {
  const activeWorkbenchId = useCanvasActiveWorkbenchId();
  const storeApi = useCanvasStore(selectCommandStoreApi, shallow);

  return useMemo(
    () =>
      bindCanvasActiveWorkbenchCommands({
        storeApi,
        workbenchId: activeWorkbenchId,
      }),
    [activeWorkbenchId, storeApi]
  );
}
