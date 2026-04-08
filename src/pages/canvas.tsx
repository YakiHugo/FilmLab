import type Konva from "konva";
import { useRef, useState, type RefObject } from "react";
import { CanvasAppBar } from "@/features/canvas/CanvasAppBar";
import { CanvasExportDialog } from "@/features/canvas/CanvasExportDialog";
import { CanvasFloatingPanel } from "@/features/canvas/CanvasFloatingPanel";
import { CanvasToolRail } from "@/features/canvas/CanvasToolRail";
import { CanvasViewport } from "@/features/canvas/CanvasViewport";
import { CanvasWorkbenchTransitionGuardProvider } from "@/features/canvas/canvasWorkbenchTransitionGuard";
import { useCanvasLoadedWorkbenchState } from "@/features/canvas/hooks/useCanvasLoadedWorkbenchState";
import { useCanvasInteraction } from "@/features/canvas/hooks/useCanvasInteraction";
import { useCanvasRouteWorkbenchSync } from "@/features/canvas/hooks/useCanvasRouteWorkbenchSync";
import { CanvasRuntimeProvider } from "@/features/canvas/runtime/CanvasRuntimeProvider";

function CanvasPageEffects() {
  useCanvasRouteWorkbenchSync();
  useCanvasInteraction();

  return null;
}

function CanvasPreviewSurface({ stageRef }: { stageRef: RefObject<Konva.Stage> }) {
  const { loadedWorkbench, loadedWorkbenchId } = useCanvasLoadedWorkbenchState();

  return (
    <CanvasRuntimeProvider
      key={loadedWorkbenchId ?? "canvas-runtime:empty"}
      workbench={loadedWorkbench}
      workbenchId={loadedWorkbenchId}
    >
      <CanvasViewport stageRef={stageRef} />
      <CanvasFloatingPanel />
    </CanvasRuntimeProvider>
  );
}

export function CanvasPage() {
  const stageRef = useRef<Konva.Stage>(null);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <CanvasWorkbenchTransitionGuardProvider>
      <div className="absolute inset-0 overflow-hidden">
        <CanvasPageEffects />
        <CanvasPreviewSurface stageRef={stageRef} />
        <CanvasAppBar
          onExport={() => {
            setExportOpen(true);
          }}
        />
        <CanvasToolRail />
        <CanvasExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          stage={stageRef.current}
        />
      </div>
    </CanvasWorkbenchTransitionGuardProvider>
  );
}
