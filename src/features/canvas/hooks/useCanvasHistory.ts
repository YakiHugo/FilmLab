import { useCallback } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  selectActiveWorkbench,
  selectCanRedoOnActiveWorkbench,
  selectCanUndoOnActiveWorkbench,
} from "../store/canvasStoreSelectors";

export function useCanvasHistory() {
  const activeWorkbenchId = useCanvasStore((state) => selectActiveWorkbench(state)?.id ?? null);
  const canUndo = useCanvasStore(selectCanUndoOnActiveWorkbench);
  const canRedo = useCanvasStore(selectCanRedoOnActiveWorkbench);
  const undoInWorkbench = useCanvasStore((state) => state.undoInWorkbench);
  const redoInWorkbench = useCanvasStore((state) => state.redoInWorkbench);

  const undo = useCallback(() => {
    void undoInWorkbench(activeWorkbenchId);
  }, [activeWorkbenchId, undoInWorkbench]);

  const redo = useCallback(() => {
    void redoInWorkbench(activeWorkbenchId);
  }, [activeWorkbenchId, redoInWorkbench]);

  return {
    canUndo,
    canRedo,
    undo,
    redo,
  };
}
