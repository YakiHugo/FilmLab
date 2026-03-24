import { useMemo } from "react";
import { useCanvasHistoryActions } from "./useCanvasHistoryActions";
import { useCanvasHistoryState } from "./useCanvasHistoryState";

export function useCanvasHistory() {
  const { canRedo, canUndo } = useCanvasHistoryState();
  const { redo, undo } = useCanvasHistoryActions();

  return useMemo(
    () => ({
      canRedo,
      canUndo,
      redo,
      undo,
    }),
    [canRedo, canUndo, redo, undo]
  );
}
