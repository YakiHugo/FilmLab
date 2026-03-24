import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { shallow } from "zustand/shallow";
import { hasSelectedImageElement } from "@/features/canvas/selectionModel";
import { getCanvasResetEpoch, useCanvasStore } from "@/stores/canvasStore";
import type { CanvasWorkbench } from "@/types";
import {
  resolveCanvasPageRecoveryPlan,
  shouldAutoOpenCanvasEditPanel,
} from "../canvasPageState";
import { selectActiveWorkbench } from "../store/canvasStoreSelectors";
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
  const recoveryTokenRef = useRef(0);
  const pendingRecoveryTokenRef = useRef<number | null>(null);
  const routeWorkbenchIdRef = useRef(routeWorkbenchId);
  const [hasInitializedCanvas, setHasInitializedCanvas] = useState(false);
  const [pendingRecoveryToken, setPendingRecoveryToken] = useState<number | null>(null);
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
  routeWorkbenchIdRef.current = routeWorkbenchId;

  const finalizeRecoveryNavigation = useCallback(
    async (targetWorkbenchId: string, token: number) => {
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
      }
      if (
        pendingRecoveryTokenRef.current !== token ||
        routeWorkbenchIdRef.current !== targetWorkbenchId ||
        useCanvasStore.getState().activeWorkbenchId === targetWorkbenchId
      ) {
        return;
      }
      setActiveWorkbenchId(targetWorkbenchId);
    },
    [setActiveWorkbenchId]
  );

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
      hasPendingRecovery: pendingRecoveryToken !== null,
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
      const recoveryToken = recoveryTokenRef.current + 1;
      recoveryTokenRef.current = recoveryToken;
      pendingRecoveryTokenRef.current = recoveryToken;
      setPendingRecoveryToken(recoveryToken);
      void navigate({
        to: "/canvas/$workbenchId",
        params: { workbenchId: recoveryPlan.workbenchId },
      })
        .then(() => finalizeRecoveryNavigation(recoveryPlan.workbenchId, recoveryToken))
        .finally(() => {
          if (pendingRecoveryTokenRef.current === recoveryToken) {
            pendingRecoveryTokenRef.current = null;
            setPendingRecoveryToken((currentToken) =>
              currentToken === recoveryToken ? null : currentToken
            );
          }
        });
      return;
    }

    const recoveryToken = recoveryTokenRef.current + 1;
    recoveryTokenRef.current = recoveryToken;
    pendingRecoveryTokenRef.current = recoveryToken;
    setPendingRecoveryToken(recoveryToken);
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
      await finalizeRecoveryNavigation(created.id, recoveryToken);
    })().finally(() => {
      if (pendingRecoveryTokenRef.current === recoveryToken) {
        pendingRecoveryTokenRef.current = null;
        setPendingRecoveryToken((currentToken) =>
          currentToken === recoveryToken ? null : currentToken
        );
      }
    });
  }, [
    activeWorkbenchId,
    createWorkbench,
    finalizeRecoveryNavigation,
    hasInitializedCanvas,
    isLoading,
    navigate,
    pendingRecoveryToken,
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
