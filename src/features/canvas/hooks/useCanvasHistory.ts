import { useCallback, useMemo } from "react";
import { useCanvasStore } from "@/stores/canvasStore";

export function useCanvasHistory() {
  const canUndoSelector = useCanvasStore((state) => state.canUndo);
  const canRedoSelector = useCanvasStore((state) => state.canRedo);
  const undoInStore = useCanvasStore((state) => state.undo);
  const redoInStore = useCanvasStore((state) => state.redo);

  const canUndo = useMemo(() => canUndoSelector(), [canUndoSelector]);
  const canRedo = useMemo(() => canRedoSelector(), [canRedoSelector]);

  const undo = useCallback(() => {
    void undoInStore();
  }, [undoInStore]);

  const redo = useCallback(() => {
    void redoInStore();
  }, [redoInStore]);

  return {
    canUndo,
    canRedo,
    undo,
    redo,
  };
}
