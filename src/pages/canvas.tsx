import type Konva from "konva";
import { useRef, useState } from "react";
import { CanvasAppBar } from "@/features/canvas/CanvasAppBar";
import { CanvasExportDialog } from "@/features/canvas/CanvasExportDialog";
import { CanvasFloatingPanel } from "@/features/canvas/CanvasFloatingPanel";
import { CanvasToolRail } from "@/features/canvas/CanvasToolRail";
import { CanvasViewport } from "@/features/canvas/CanvasViewport";
import { useCanvasEditPanelAutoOpen } from "@/features/canvas/hooks/useCanvasEditPanelAutoOpen";
import { useCanvasRouteWorkbenchSync } from "@/features/canvas/hooks/useCanvasRouteWorkbenchSync";
import { CanvasRuntimeProvider } from "@/features/canvas/runtime/CanvasRuntimeProvider";
import { selectActiveWorkbench } from "@/features/canvas/store/canvasStoreSelectors";
import { useCanvasStore } from "@/stores/canvasStore";

export function CanvasPage() {
  const stageRef = useRef<Konva.Stage>(null);
  const [exportOpen, setExportOpen] = useState(false);
  useCanvasRouteWorkbenchSync();
  useCanvasEditPanelAutoOpen();
  const activeWorkbench = useCanvasStore(selectActiveWorkbench);
  const activeWorkbenchId = useCanvasStore((state) => state.activeWorkbenchId);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <CanvasRuntimeProvider
        key={activeWorkbenchId ?? "canvas-runtime:empty"}
        workbench={activeWorkbench}
        workbenchId={activeWorkbenchId}
      >
        <CanvasViewport stageRef={stageRef} />
        <CanvasAppBar
          onExport={() => {
            setExportOpen(true);
          }}
        />
        <CanvasToolRail />
        <CanvasFloatingPanel />
        <CanvasExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          stage={stageRef.current}
        />
      </CanvasRuntimeProvider>
    </div>
  );
}
