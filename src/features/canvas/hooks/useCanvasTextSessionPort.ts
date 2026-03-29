import { useMemo } from "react";
import { shallow } from "zustand/shallow";
import { useCanvasStore, type CanvasState } from "@/stores/canvasStore";
import type { CanvasTextSessionPort } from "../textSessionRunner";
import { useCanvasLoadedWorkbenchId } from "./useCanvasLoadedWorkbenchId";

const selectCanvasTextSessionStoreApi = (state: CanvasState) => ({
  executeCommandInWorkbench: state.executeCommandInWorkbench,
  upsertElementInWorkbench: state.upsertElementInWorkbench,
});

export function useCanvasTextSessionPort({
  clearSelection,
  selectElement,
}: {
  clearSelection: () => void;
  selectElement: (elementId: string) => void;
}): CanvasTextSessionPort {
  const loadedWorkbenchId = useCanvasLoadedWorkbenchId();
  const storeApi = useCanvasStore(selectCanvasTextSessionStoreApi, shallow);

  return useMemo(
    () => ({
      clearSelection,
      executeCommandInWorkbench: (workbenchId, command, options) =>
        storeApi.executeCommandInWorkbench(workbenchId, command, options),
      getActiveWorkbenchId: () => loadedWorkbenchId,
      selectElement,
      upsertElementInWorkbench: (workbenchId, element) =>
        storeApi.upsertElementInWorkbench(workbenchId, element),
    }),
    [loadedWorkbenchId, clearSelection, selectElement, storeApi]
  );
}
