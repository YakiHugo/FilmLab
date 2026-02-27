import { useCanvasStore } from "@/stores/canvasStore";

export function useCanvasInteraction() {
  const selectedElementIds = useCanvasStore((state) => state.selectedElementIds);
  const setSelectedElementIds = useCanvasStore((state) => state.setSelectedElementIds);

  return {
    selectedElementIds,
    setSelectedElementIds,
  };
}
