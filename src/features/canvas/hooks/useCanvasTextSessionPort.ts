import { useMemo } from "react";
import { shallow } from "zustand/shallow";
import { useCanvasStore, type CanvasState } from "@/stores/canvasStore";
import type { CanvasTextSessionPort } from "../textSessionRunner";
import { useCanvasActiveWorkbenchId } from "./useCanvasActiveWorkbenchId";

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
  const activeWorkbenchId = useCanvasActiveWorkbenchId();
  const availableWorkbenchIds = useCanvasStore(
    (state) => state.workbenches.map((workbench) => workbench.id),
    shallow
  );
  const storeApi = useCanvasStore(selectCanvasTextSessionStoreApi, shallow);

  return useMemo(
    () => ({
      clearSelection,
      executeCommandInWorkbench: (workbenchId, command, options) =>
        storeApi.executeCommandInWorkbench(workbenchId, command, options),
      getActiveWorkbenchId: () => activeWorkbenchId,
      getAvailableWorkbenchIds: () => availableWorkbenchIds,
      selectElement,
      upsertElementInWorkbench: (workbenchId, element) =>
        storeApi.upsertElementInWorkbench(workbenchId, element),
    }),
    [activeWorkbenchId, availableWorkbenchIds, clearSelection, selectElement, storeApi]
  );
}
