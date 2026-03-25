import { useEffect, useRef } from "react";
import { resolvePrimarySelectedImageElement } from "@/features/canvas/selectionModel";
import { useCanvasStore } from "@/stores/canvasStore";
import { shouldAutoOpenCanvasEditPanel } from "../canvasPageState";
import { selectActiveWorkbench } from "../store/canvasStoreSelectors";

export function useCanvasEditPanelAutoOpen() {
  const activeWorkbench = useCanvasStore(selectActiveWorkbench);
  const selectedElementIds = useCanvasStore((state) => state.selectedElementIds);
  const activePanel = useCanvasStore((state) => state.activePanel);
  const setActivePanel = useCanvasStore((state) => state.setActivePanel);
  const previousSelectedImageIdRef = useRef<string | null>(null);

  const selectedImageId =
    activeWorkbench && selectedElementIds.length > 0
      ? resolvePrimarySelectedImageElement(activeWorkbench, selectedElementIds)?.id ?? null
      : null;

  useEffect(() => {
    const previousSelectedImageId = previousSelectedImageIdRef.current;
    if (
      shouldAutoOpenCanvasEditPanel({
        activePanel,
        currentSelectedImageId: selectedImageId,
        previousSelectedImageId,
      })
    ) {
      setActivePanel("edit");
    }

    previousSelectedImageIdRef.current = selectedImageId;
  }, [activePanel, selectedImageId, setActivePanel]);
}
