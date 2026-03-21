import type Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { shallow } from "zustand/shallow";
import { CanvasAppBar } from "@/features/canvas/CanvasAppBar";
import { CanvasExportDialog } from "@/features/canvas/CanvasExportDialog";
import { CanvasFloatingPanel } from "@/features/canvas/CanvasFloatingPanel";
import { CanvasToolRail } from "@/features/canvas/CanvasToolRail";
import { CanvasViewport } from "@/features/canvas/CanvasViewport";
import { hasSelectedImageElement } from "@/features/canvas/selectionModel";
import {
  getCanvasResetEpoch,
  selectActiveWorkbench,
  useCanvasStore,
} from "@/stores/canvasStore";

export function CanvasPage() {
  const navigate = useNavigate();
  const stageRef = useRef<Konva.Stage>(null);
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const pendingRouteRecoveryRef = useRef<string | null>(null);
  const params = useParams({ from: "/canvas/$workbenchId", shouldThrow: false });
  const workbenchId = params?.workbenchId;
  const workbenchIds = useCanvasStore(
    (state) => state.workbenches.map((workbench) => workbench.id),
    shallow
  );
  const activeWorkbenchId = useCanvasStore((state) => state.activeWorkbenchId);
  const activeWorkbench = useCanvasStore(selectActiveWorkbench);
  const isLoading = useCanvasStore((state) => state.isLoading);
  const init = useCanvasStore((state) => state.init);
  const createWorkbench = useCanvasStore((state) => state.createWorkbench);
  const setActiveWorkbenchId = useCanvasStore((state) => state.setActiveWorkbenchId);
  const selectedElementIds = useCanvasStore((state) => state.selectedElementIds);
  const activePanel = useCanvasStore((state) => state.activePanel);
  const setActivePanel = useCanvasStore((state) => state.setActivePanel);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (pendingRouteRecoveryRef.current) {
      return;
    }

    const hasWorkbench = (id: string | null | undefined) => Boolean(id && workbenchIds.includes(id));
    const routeMatches = hasWorkbench(workbenchId);

    if (workbenchId) {
      if (!routeMatches) {
        const fallbackWorkbenchId =
          (activeWorkbenchId && workbenchIds.includes(activeWorkbenchId) ? activeWorkbenchId : null) ??
          workbenchIds[0] ??
          null;
        if (fallbackWorkbenchId) {
          pendingRouteRecoveryRef.current = fallbackWorkbenchId;
          void navigate({
            to: "/canvas/$workbenchId",
            params: { workbenchId: fallbackWorkbenchId },
          }).finally(() => {
            pendingRouteRecoveryRef.current = null;
          });
          return;
        }

        pendingRouteRecoveryRef.current = "create";
        void (async () => {
          const recoveryEpoch = getCanvasResetEpoch();
          const created = await createWorkbench(undefined, { activate: false });
          if (recoveryEpoch !== getCanvasResetEpoch()) {
            return;
          }
          await navigate({
            to: "/canvas/$workbenchId",
            params: { workbenchId: created.id },
          });
        })().finally(() => {
          pendingRouteRecoveryRef.current = null;
        });
        return;
      }

      if (workbenchId !== activeWorkbenchId) {
        setActiveWorkbenchId(workbenchId);
      }
      return;
    }

    const fallbackWorkbenchId = hasWorkbench(activeWorkbenchId)
      ? activeWorkbenchId
      : workbenchIds[0] ?? null;
    if (fallbackWorkbenchId) {
      pendingRouteRecoveryRef.current = fallbackWorkbenchId;
      void navigate({
        to: "/canvas/$workbenchId",
        params: { workbenchId: fallbackWorkbenchId },
      }).finally(() => {
        pendingRouteRecoveryRef.current = null;
      });
      return;
    }

    pendingRouteRecoveryRef.current = "create";
    void (async () => {
      const recoveryEpoch = getCanvasResetEpoch();
      const created = await createWorkbench(undefined, { activate: false });
      if (recoveryEpoch !== getCanvasResetEpoch()) {
        return;
      }
      await navigate({
        to: "/canvas/$workbenchId",
        params: { workbenchId: created.id },
      });
    })().finally(() => {
      pendingRouteRecoveryRef.current = null;
    });
  }, [
    activeWorkbenchId,
    createWorkbench,
    isLoading,
    navigate,
    setActiveWorkbenchId,
    workbenchId,
    workbenchIds,
  ]);

  useEffect(() => {
    const nextSlices = activeWorkbench?.slices ?? [];
    if (!selectedSliceId) {
      if (nextSlices[0]) {
        setSelectedSliceId(nextSlices[0].id);
      }
      return;
    }
    if (!nextSlices.some((slice) => slice.id === selectedSliceId)) {
      setSelectedSliceId(nextSlices[0]?.id ?? null);
    }
  }, [activeWorkbench, selectedSliceId]);

  useEffect(() => {
    if (activePanel === "edit" || !activeWorkbench || selectedElementIds.length === 0) {
      return;
    }
    if (hasSelectedImageElement(activeWorkbench, selectedElementIds)) {
      setActivePanel("edit");
    }
  }, [activeWorkbench, activePanel, selectedElementIds, setActivePanel]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <CanvasViewport stageRef={stageRef} selectedSliceId={selectedSliceId} />
      <CanvasAppBar onExport={() => setExportOpen(true)} />
      <CanvasToolRail />
      <CanvasFloatingPanel selectedSliceId={selectedSliceId} onSelectSlice={setSelectedSliceId} />
      <CanvasExportDialog open={exportOpen} onOpenChange={setExportOpen} stage={stageRef.current} />
    </div>
  );
}
