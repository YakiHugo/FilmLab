import { useMemo } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  selectCanRedoOnLoadedWorkbench,
  selectCanUndoOnLoadedWorkbench,
} from "../store/canvasStoreSelectors";

export function useCanvasHistoryState() {
  const canUndo = useCanvasStore(selectCanUndoOnLoadedWorkbench);
  const canRedo = useCanvasStore(selectCanRedoOnLoadedWorkbench);

  return useMemo(
    () => ({
      canRedo,
      canUndo,
    }),
    [canRedo, canUndo]
  );
}
