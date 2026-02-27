export function useCanvasHistory() {
  return {
    canUndo: false,
    canRedo: false,
    undo: () => {},
    redo: () => {},
  };
}
