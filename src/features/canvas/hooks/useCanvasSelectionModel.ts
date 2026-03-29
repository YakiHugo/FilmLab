import { useMemo, useRef } from "react";
import { useCanvasSelectionPreview } from "@/features/canvas/runtime/canvasRuntimeHooks";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  createCanvasSelectionNodeById,
  createCanvasSelectionModel,
  resolveDisplaySelectedElementIds,
  selectionIdsEqual,
} from "../selectionModel";
import { selectLoadedWorkbench } from "../store/canvasStoreSelectors";

const EMPTY_SELECTED_ELEMENT_IDS: string[] = [];

const useDisplaySelectedElementIds = () => {
  const committedSelectedElementIds = useCanvasStore(
    (state) => state.selectedElementIds,
    selectionIdsEqual
  );
  const { selectionPreviewElementIds } = useCanvasSelectionPreview();
  const stabilizedDisplaySelectedElementIdsRef = useRef<string[]>(EMPTY_SELECTED_ELEMENT_IDS);

  const rawDisplaySelectedElementIds = useMemo(
    () =>
      resolveDisplaySelectedElementIds(selectionPreviewElementIds, committedSelectedElementIds),
    [committedSelectedElementIds, selectionPreviewElementIds]
  );

  const displaySelectedElementIds = useMemo(() => {
    const previousDisplaySelectedElementIds = stabilizedDisplaySelectedElementIdsRef.current;
    if (selectionIdsEqual(previousDisplaySelectedElementIds, rawDisplaySelectedElementIds)) {
      return previousDisplaySelectedElementIds;
    }

    stabilizedDisplaySelectedElementIdsRef.current = rawDisplaySelectedElementIds;
    return rawDisplaySelectedElementIds;
  }, [rawDisplaySelectedElementIds]);

  return {
    committedSelectedElementIds,
    displaySelectedElementIds,
    hasPreviewSelection: selectionPreviewElementIds !== null,
  };
};

export function useCanvasDisplaySelectedElementIds() {
  return useDisplaySelectedElementIds().displaySelectedElementIds;
}

export function useCanvasDisplaySelectionState() {
  return useDisplaySelectedElementIds();
}

export function useCanvasSelectionModel() {
  const activeWorkbench = useCanvasStore(selectLoadedWorkbench);
  const { committedSelectedElementIds, displaySelectedElementIds, hasPreviewSelection } =
    useDisplaySelectedElementIds();
  const nodeById = useMemo(() => createCanvasSelectionNodeById(activeWorkbench), [activeWorkbench]);

  return useMemo(
    () =>
      createCanvasSelectionModel({
        activeWorkbench,
        committedSelectedElementIds,
        displaySelectedElementIds,
        nodeById,
        hasPreviewSelection,
      }),
    [
      activeWorkbench,
      committedSelectedElementIds,
      displaySelectedElementIds,
      hasPreviewSelection,
      nodeById,
    ]
  );
}
