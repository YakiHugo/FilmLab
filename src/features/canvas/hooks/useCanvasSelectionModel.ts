import { useMemo, useRef } from "react";
import { useCanvasRuntimeStore } from "@/stores/canvasRuntimeStore";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  createCanvasSelectionModel,
  resolveDisplaySelectedElementIds,
  selectionIdsEqual,
} from "../selectionModel";

const EMPTY_SELECTED_ELEMENT_IDS: string[] = [];

const selectActiveDocument = (state: ReturnType<typeof useCanvasStore.getState>) =>
  state.activeDocumentId
    ? (state.documents.find((document) => document.id === state.activeDocumentId) ?? null)
    : null;

export function useCanvasSelectionModel() {
  const activeDocument = useCanvasStore(selectActiveDocument);
  const committedSelectedElementIds = useCanvasStore(
    (state) => state.selectedElementIds,
    selectionIdsEqual
  );
  const selectionPreviewElementIds = useCanvasRuntimeStore(
    (state) => state.selectionPreviewElementIds,
    selectionIdsEqual
  );
  const stabilizedDisplaySelectedElementIdsRef = useRef<string[]>(EMPTY_SELECTED_ELEMENT_IDS);
  const nodeById = useMemo(
    () => new Map((activeDocument?.allNodes ?? []).map((node) => [node.id, node])),
    [activeDocument?.allNodes]
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
        activeDocument,
        committedSelectedElementIds,
        displaySelectedElementIds,
        nodeById,
        hasPreviewSelection: selectionPreviewElementIds !== null,
      }),
    [
      activeDocument,
      committedSelectedElementIds,
      displaySelectedElementIds,
      nodeById,
      selectionPreviewElementIds,
    ]
  );
}
