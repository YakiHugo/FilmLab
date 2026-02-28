import { useCallback, useMemo } from "react";
import { useCanvasStore } from "@/stores/canvasStore";

export function useCanvasHistory() {
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const canUndoSelector = useCanvasStore((state) => state.canUndo);
  const canRedoSelector = useCanvasStore((state) => state.canRedo);
  const undoInStore = useCanvasStore((state) => state.undo);
  const redoInStore = useCanvasStore((state) => state.redo);

  const canUndo = useMemo(
    () => (activeDocumentId ? canUndoSelector(activeDocumentId) : false),
    [activeDocumentId, canUndoSelector]
  );
  const canRedo = useMemo(
    () => (activeDocumentId ? canRedoSelector(activeDocumentId) : false),
    [activeDocumentId, canRedoSelector]
  );

  const undo = useCallback(() => {
    if (!activeDocumentId) {
      return;
    }
    void undoInStore(activeDocumentId);
  }, [activeDocumentId, undoInStore]);

  const redo = useCallback(() => {
    if (!activeDocumentId) {
      return;
    }
    void redoInStore(activeDocumentId);
  }, [activeDocumentId, redoInStore]);

  return {
    canUndo,
    canRedo,
    undo,
    redo,
  };
}
