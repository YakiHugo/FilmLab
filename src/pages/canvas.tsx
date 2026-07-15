import type Konva from "konva";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useLocation } from "@tanstack/react-router";
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
import { useCanvasInteraction } from "@/features/canvas/hooks/useCanvasInteraction";
import {
  resolveCanvasRouteWorkbenchId,
  useCanvasRouteWorkbenchSync,
} from "@/features/canvas/hooks/useCanvasRouteWorkbenchSync";
import { shallow } from "zustand/shallow";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  selectCanvasLoadedWorkbenchState,
  selectIsCanvasWorkbenchMutationPending,
} from "@/features/canvas/store/canvasStoreSelectors";
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
  onExport,
  stageRef,
}: {
  contextActions: CanvasContextActionsModel;
  interactionNotice: CanvasInteractionNotice | null;
  onNotice: (notice: CanvasInteractionNotice) => void;
  onExport: () => void;
  stageRef: RefObject<Konva.Stage>;
}) {
  const { loadedWorkbench, loadedWorkbenchId } = useCanvasStore(
    selectCanvasLoadedWorkbenchState,
    shallow
  );

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
      <CanvasFloatingPanel onExport={onExport} />
    </CanvasRuntimeProvider>
  );
}

function CanvasRoutePending() {
  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center bg-[#080a09]"
      role="status"
      aria-busy="true"
    >
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(164,255,0,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(164,255,0,0.08)_1px,transparent_1px)] [background-size:40px_40px]" />
      <div className="relative border border-[#a4ff00]/30 bg-black/70 px-8 py-6 text-center shadow-[0_0_40px_rgba(164,255,0,0.08)]">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#a4ff00]">
          Loading artifact
        </div>
        <div className="mt-2 text-sm text-zinc-300">正在同步作品…</div>
      </div>
    </div>
  );
}

export function CanvasPage() {
  const pathname = useLocation({ select: (state) => state.pathname });
  const routeWorkbenchId = resolveCanvasRouteWorkbenchId(pathname);
  const loadedWorkbenchId = useCanvasStore((state) => state.loadedWorkbenchId);
  const isRouteWorkbenchReady = routeWorkbenchId !== null && routeWorkbenchId === loadedWorkbenchId;
  const stageRef = useRef<Konva.Stage>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [interactionNotice, setInteractionNotice] = useState<CanvasInteractionNotice | null>(null);
  const handleNotice = useCallback((notice: CanvasInteractionNotice) => {
    setInteractionNotice(notice);
  }, []);
  const handleOpenExport = useCallback(() => {
    if (selectIsCanvasWorkbenchMutationPending(useCanvasStore.getState())) {
      return;
    }
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
          onExport={handleOpenExport}
          stageRef={stageRef}
        />
        {isRouteWorkbenchReady ? (
          <>
            <CanvasAppBar onExport={handleOpenExport} />
            <CanvasToolRail />
            <CanvasExportDialog open={exportOpen} onOpenChange={setExportOpen} />
          </>
        ) : (
          <CanvasRoutePending />
        )}
      </div>
    </CanvasWorkbenchTransitionGuardProvider>
  );
}
