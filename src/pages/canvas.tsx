import type Konva from "konva";
import { useRef } from "react";
import { CanvasAppBar } from "@/features/canvas/CanvasAppBar";
import { CanvasExportDialog } from "@/features/canvas/CanvasExportDialog";
import { CanvasFloatingPanel } from "@/features/canvas/CanvasFloatingPanel";
import { CanvasToolRail } from "@/features/canvas/CanvasToolRail";
import { CanvasViewport } from "@/features/canvas/CanvasViewport";
import { useCanvasPageModel } from "@/features/canvas/hooks/useCanvasPageModel";
import { CanvasRuntimeProvider } from "@/features/canvas/runtime/CanvasRuntimeProvider";

export function CanvasPage() {
  const stageRef = useRef<Konva.Stage>(null);
  const {
    activeWorkbench,
    activeWorkbenchId,
    exportOpen,
    openExportDialog,
    selectSlice,
    selectedSliceId,
    setExportOpen,
  } = useCanvasPageModel();

  return (
    <div className="absolute inset-0 overflow-hidden">
      <CanvasRuntimeProvider
        key={activeWorkbenchId ?? "canvas-runtime:empty"}
        workbench={activeWorkbench}
        workbenchId={activeWorkbenchId}
      >
        <CanvasViewport stageRef={stageRef} selectedSliceId={selectedSliceId} />
        <CanvasAppBar onExport={openExportDialog} />
        <CanvasToolRail />
        <CanvasFloatingPanel
          selectedSliceId={selectedSliceId}
          onSelectSlice={selectSlice}
        />
        <CanvasExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          stage={stageRef.current}
        />
      </CanvasRuntimeProvider>
    </div>
  );
}
