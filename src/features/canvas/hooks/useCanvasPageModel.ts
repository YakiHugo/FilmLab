import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { shallow } from "zustand/shallow";
import { hasSelectedImageElement } from "@/features/canvas/selectionModel";
import { getCanvasResetEpoch, selectActiveWorkbench, useCanvasStore } from "@/stores/canvasStore";
import type { CanvasWorkbench } from "@/types";
import {
  resolveCanvasPageRecoveryPlan,
  shouldAutoOpenCanvasEditPanel,
} from "../canvasPageState";
import {
  resolveOrderedCanvasSlices,
  resolveSelectedCanvasSliceId,
} from "../workbenchPanelState";

export interface CanvasPageModel {
  activeWorkbench: CanvasWorkbench | null;
  activeWorkbenchId: string | null;
  exportOpen: boolean;
  openExportDialog: () => void;
  selectSlice: (sliceId: string | null) => void;
  selectedSliceId: string | null;
  setExportOpen: (open: boolean) => void;
}

export function useCanvasPageModel(): CanvasPageModel {
  const navigate = useNavigate();
  const params = useParams({ from: "/canvas/$workbenchId", shouldThrow: false });
  const routeWorkbenchId = params?.workbenchId ?? null;
  const pendingRecoveryRef = useRef<string | null>(null);
  const [hasInitializedCanvas, setHasInitializedCanvas] = useState(false);
  const [exportOpen, setExportOpenState] = useState(false);
  const [rawSelectedSliceId, setRawSelectedSliceId] = useState<string | null>(null);
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
    let isMounted = true;

    void init().finally(() => {
      if (isMounted) {
        setHasInitializedCanvas(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [init]);

  useEffect(() => {
    const recoveryPlan = resolveCanvasPageRecoveryPlan({
      activeWorkbenchId,
      hasInitialized: hasInitializedCanvas,
      hasPendingRecovery: pendingRecoveryRef.current !== null,
      isLoading,
      routeWorkbenchId,
      workbenchIds,
    });

    if (recoveryPlan.type === "wait") {
      return;
    }

    if (recoveryPlan.type === "activate-route") {
      setActiveWorkbenchId(recoveryPlan.workbenchId);
      return;
    }

    if (recoveryPlan.type === "navigate-to-fallback") {
      pendingRecoveryRef.current = recoveryPlan.workbenchId;
      void navigate({
        to: "/canvas/$workbenchId",
        params: { workbenchId: recoveryPlan.workbenchId },
      }).finally(() => {
        pendingRecoveryRef.current = null;
      });
      return;
    }

    pendingRecoveryRef.current = "create";
    void (async () => {
      const recoveryEpoch = getCanvasResetEpoch();
      const created = await createWorkbench(undefined, { activate: false });
      if (!created || recoveryEpoch !== getCanvasResetEpoch()) {
        return;
      }

      await navigate({
        to: "/canvas/$workbenchId",
        params: { workbenchId: created.id },
      });
    })().finally(() => {
      pendingRecoveryRef.current = null;
    });
  }, [
    activeWorkbenchId,
    createWorkbench,
    hasInitializedCanvas,
    isLoading,
    navigate,
    routeWorkbenchId,
    setActiveWorkbenchId,
    workbenchIds,
  ]);

  useEffect(() => {
    const hasSelectedImage =
      Boolean(activeWorkbench) &&
      selectedElementIds.length > 0 &&
      hasSelectedImageElement(activeWorkbench, selectedElementIds);

    if (shouldAutoOpenCanvasEditPanel({ activePanel, hasSelectedImage })) {
      setActivePanel("edit");
    }
  }, [activePanel, activeWorkbench, selectedElementIds, setActivePanel]);

  const orderedSlices = resolveOrderedCanvasSlices(activeWorkbench);
  const selectedSliceId = resolveSelectedCanvasSliceId({
    orderedSlices,
    selectedSliceId: rawSelectedSliceId,
  });

  useEffect(() => {
    if (selectedSliceId !== rawSelectedSliceId) {
      setRawSelectedSliceId(selectedSliceId);
    }
  }, [rawSelectedSliceId, selectedSliceId]);

  return {
    activeWorkbench,
    activeWorkbenchId,
    exportOpen,
    openExportDialog: () => {
      setExportOpenState(true);
    },
    selectSlice: (sliceId) => {
      setRawSelectedSliceId(sliceId);
    },
    selectedSliceId,
    setExportOpen: (open) => {
      setExportOpenState(open);
    },
  };
}
