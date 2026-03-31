import type Konva from "konva";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { CanvasAppBar } from "@/features/canvas/CanvasAppBar";
import { CanvasExportDialog } from "@/features/canvas/CanvasExportDialog";
import { CanvasFloatingPanel } from "@/features/canvas/CanvasFloatingPanel";
import { CanvasToolRail } from "@/features/canvas/CanvasToolRail";
import { CanvasViewport } from "@/features/canvas/CanvasViewport";
import { CanvasWorkbenchTransitionGuardProvider } from "@/features/canvas/canvasWorkbenchTransitionGuard";
import type { CanvasInteractionNotice } from "@/features/canvas/viewportOverlay";
import {
  useCanvasContextActions,
  type CanvasContextActionsModel,
} from "@/features/canvas/hooks/useCanvasContextActions";
import { useCanvasLoadedWorkbenchState } from "@/features/canvas/hooks/useCanvasLoadedWorkbenchState";
import { useCanvasInteraction } from "@/features/canvas/hooks/useCanvasInteraction";
import { useCanvasRouteWorkbenchSync } from "@/features/canvas/hooks/useCanvasRouteWorkbenchSync";
import { CanvasRuntimeProvider } from "@/features/canvas/runtime/CanvasRuntimeProvider";

function CanvasPageEffects({
  onShortcutKeyDown,
}: {
  onShortcutKeyDown: (event: KeyboardEvent) => boolean;
}) {
  useCanvasRouteWorkbenchSync();
  useCanvasInteraction({
    onShortcutKeyDown,
  });

  return null;
}

function CanvasPreviewSurface({
  contextActions,
  interactionNotice,
  onNotice,
  stageRef,
}: {
  contextActions: CanvasContextActionsModel;
  interactionNotice: CanvasInteractionNotice | null;
  onNotice: (notice: CanvasInteractionNotice) => void;
  stageRef: RefObject<Konva.Stage>;
}) {
  const { loadedWorkbench, loadedWorkbenchId } = useCanvasLoadedWorkbenchState();

  return (
    <CanvasRuntimeProvider
      key={loadedWorkbenchId ?? "canvas-runtime:empty"}
      workbench={loadedWorkbench}
      workbenchId={loadedWorkbenchId}
    >
      <CanvasViewport
        contextActions={contextActions}
        interactionNotice={interactionNotice}
        onNotice={onNotice}
        stageRef={stageRef}
      />
      <CanvasFloatingPanel />
    </CanvasRuntimeProvider>
  );
}

export function CanvasPage() {
  const stageRef = useRef<Konva.Stage>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [interactionNotice, setInteractionNotice] = useState<CanvasInteractionNotice | null>(null);
  const handleNotice = useCallback((notice: CanvasInteractionNotice) => {
    setInteractionNotice(notice);
  }, []);
  const handleOpenExport = useCallback(() => {
    setExportOpen(true);
  }, []);
  const contextActions = useCanvasContextActions({
    onNotice: handleNotice,
    onOpenExport: handleOpenExport,
    stageRef,
  });

  useEffect(() => {
    if (!interactionNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setInteractionNotice(null);
    }, 2400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [interactionNotice]);

  return (
    <CanvasWorkbenchTransitionGuardProvider>
      <div className="absolute inset-0 overflow-hidden">
        <CanvasPageEffects onShortcutKeyDown={contextActions.handleShortcutKeyDown} />
        <CanvasPreviewSurface
          contextActions={contextActions}
          interactionNotice={interactionNotice}
          onNotice={handleNotice}
          stageRef={stageRef}
        />
        <CanvasAppBar onExport={handleOpenExport} />
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
