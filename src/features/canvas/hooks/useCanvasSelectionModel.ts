import { useMemo, useRef } from "react";
import { useCanvasSelectionPreview } from "@/features/canvas/runtime/canvasRuntimeHooks";
import { selectActiveWorkbench, useCanvasStore } from "@/stores/canvasStore";
import {
  createCanvasSelectionModel,
  resolveDisplaySelectedElementIds,
  selectionIdsEqual,
} from "../selectionModel";

const EMPTY_SELECTED_ELEMENT_IDS: string[] = [];

export function useCanvasSelectionModel() {
  const activeWorkbench = useCanvasStore(selectActiveWorkbench);
  const committedSelectedElementIds = useCanvasStore(
    (state) => state.selectedElementIds,
    selectionIdsEqual
  );
  const { selectionPreviewElementIds } = useCanvasSelectionPreview();
  const stabilizedDisplaySelectedElementIdsRef = useRef<string[]>(EMPTY_SELECTED_ELEMENT_IDS);
  const nodeById = useMemo(
    () => new Map((activeWorkbench?.allNodes ?? []).map((node) => [node.id, node])),
    [activeWorkbench?.allNodes]
  );

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

  return useMemo(
    () =>
      createCanvasSelectionModel({
        activeWorkbench,
        committedSelectedElementIds,
        displaySelectedElementIds,
        nodeById,
        hasPreviewSelection: selectionPreviewElementIds !== null,
      }),
    [
      activeWorkbench,
      committedSelectedElementIds,
      displaySelectedElementIds,
      nodeById,
      selectionPreviewElementIds,
    ]
  );
}
