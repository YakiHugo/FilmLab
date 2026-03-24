import { useMemo } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  selectCanRedoOnActiveWorkbench,
  selectCanUndoOnActiveWorkbench,
} from "../store/canvasStoreSelectors";

export function useCanvasHistoryState() {
  const canUndo = useCanvasStore(selectCanUndoOnActiveWorkbench);
  const canRedo = useCanvasStore(selectCanRedoOnActiveWorkbench);

  return useMemo(
    () => ({
      canRedo,
      canUndo,
    }),
    [canRedo, canUndo]
  );
}
