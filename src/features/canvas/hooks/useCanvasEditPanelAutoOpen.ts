import { useEffect } from "react";
import { hasSelectedImageElement } from "@/features/canvas/selectionModel";
import { useCanvasStore } from "@/stores/canvasStore";
import { shouldAutoOpenCanvasEditPanel } from "../canvasPageState";
import { selectActiveWorkbench } from "../store/canvasStoreSelectors";

export function useCanvasEditPanelAutoOpen() {
  const activeWorkbench = useCanvasStore(selectActiveWorkbench);
  const selectedElementIds = useCanvasStore((state) => state.selectedElementIds);
  const activePanel = useCanvasStore((state) => state.activePanel);
  const setActivePanel = useCanvasStore((state) => state.setActivePanel);

  useEffect(() => {
    const hasSelectedImage =
      Boolean(activeWorkbench) &&
      selectedElementIds.length > 0 &&
      hasSelectedImageElement(activeWorkbench, selectedElementIds);

    if (shouldAutoOpenCanvasEditPanel({ activePanel, hasSelectedImage })) {
      setActivePanel("edit");
    }
  }, [activePanel, activeWorkbench, selectedElementIds, setActivePanel]);
}
