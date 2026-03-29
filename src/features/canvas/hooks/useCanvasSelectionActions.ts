import { useCallback } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  isSelectableSelectionTarget,
  resolveSelectableSelectionIds,
} from "../selectionGeometry";
import {
  resolveNextAdditiveSelectionIds,
  selectionIdsEqual,
} from "../selectionModel";
import { selectLoadedWorkbench } from "../store/canvasStoreSelectors";

const resolveSelectableElementIdSet = () => {
  const loadedWorkbench = selectLoadedWorkbench(useCanvasStore.getState());
  return new Set(
    (loadedWorkbench?.allNodes ?? [])
      .filter(isSelectableSelectionTarget)
      .map((node) => node.id)
  );
};

const resolveSelectableElementIds = () => {
  const loadedWorkbench = selectLoadedWorkbench(useCanvasStore.getState());
  return loadedWorkbench
    ? resolveSelectableSelectionIds(
        loadedWorkbench.allNodes,
        loadedWorkbench.allNodes.map((node) => node.id)
      )
    : [];
};

export function useCanvasSelectionActions() {
  const selectedElementIds = useCanvasStore(
    (state) => state.selectedElementIds,
    selectionIdsEqual
  );
  const setSelectedElementIds = useCanvasStore((state) => state.setSelectedElementIds);

  const clearSelection = useCallback(() => {
    setSelectedElementIds([]);
  }, [setSelectedElementIds]);

  const selectElement = useCallback(
    (id: string, options?: { additive?: boolean }) => {
      const selectableElementIdSet = resolveSelectableElementIdSet();
      if (!selectableElementIdSet.has(id)) {
        return false;
      }

      const currentSelectedIds = useCanvasStore
        .getState()
        .selectedElementIds.filter((selectedId) => selectableElementIdSet.has(selectedId));

      if (!options?.additive) {
        setSelectedElementIds([id]);
        return true;
      }

      setSelectedElementIds(resolveNextAdditiveSelectionIds(currentSelectedIds, id));
      return true;
    },
    [setSelectedElementIds]
  );

  const selectAll = useCallback(() => {
    const nextSelectedIds = resolveSelectableElementIds();
    if (nextSelectedIds.length === 0) {
      return;
    }

    setSelectedElementIds(nextSelectedIds);
  }, [setSelectedElementIds]);

  return {
    clearSelection,
    selectAll,
    selectElement,
    selectedElementIds,
    setSelectedElementIds,
  };
}
