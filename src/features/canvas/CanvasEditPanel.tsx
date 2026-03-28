import { useCallback } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  canvasEditTargetEqual,
  resolveCanvasEditTargetFromPrimarySelection,
} from "./editPanelSelection";
import { selectActiveWorkbench } from "./store/canvasStoreSelectors";
import { CanvasImageEditPanel } from "./CanvasImageEditPanel";
import { CanvasShapeEditPanel } from "./CanvasShapeEditPanel";
import { canvasDockBodyTextClassName } from "./editDockTheme";

function useCanvasEditTarget() {
  const primarySelectedElementId = useCanvasStore((state) => state.selectedElementIds[0] ?? null);
  const selectEditTarget = useCallback(
    (state: Parameters<typeof selectActiveWorkbench>[0]) =>
      resolveCanvasEditTargetFromPrimarySelection(
        selectActiveWorkbench(state),
        primarySelectedElementId
      ),
    [primarySelectedElementId]
  );

  return useCanvasStore(selectEditTarget, canvasEditTargetEqual);
}

export function CanvasEditPanel() {
  const editTarget = useCanvasEditTarget();

  if (editTarget?.type === "image") {
    return <CanvasImageEditPanel imageElement={editTarget} />;
  }

  if (editTarget?.type === "shape") {
    return <CanvasShapeEditPanel shape={editTarget} />;
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      <div className="py-5">
        <p className={canvasDockBodyTextClassName}>
          Select an image or shape on the canvas to start editing.
        </p>
      </div>
    </section>
  );
}
