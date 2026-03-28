import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { shallow } from "zustand/shallow";
import { getCanvasResetEpoch, useCanvasStore } from "@/stores/canvasStore";
import { resolveCanvasPageRecoveryPlan } from "../canvasPageState";

export function useCanvasRouteWorkbenchSync() {
  const navigate = useNavigate();
  const params = useParams({ from: "/canvas/$workbenchId", shouldThrow: false });
  const routeWorkbenchId = params?.workbenchId ?? null;
  const recoveryTokenRef = useRef(0);
  const pendingRecoveryTokenRef = useRef<number | null>(null);
  const routeWorkbenchIdRef = useRef(routeWorkbenchId);
  const [hasInitializedCanvas, setHasInitializedCanvas] = useState(false);
  const [pendingRecoveryToken, setPendingRecoveryToken] = useState<number | null>(null);
  const workbenchIds = useCanvasStore(
    (state) => state.workbenchList.map((workbench) => workbench.id),
    shallow
  );
  const loadedWorkbenchId = useCanvasStore((state) => state.loadedWorkbenchId);
  const isLoading = useCanvasStore((state) => state.isLoading);
  const init = useCanvasStore((state) => state.init);
  const createWorkbench = useCanvasStore((state) => state.createWorkbench);
  const openWorkbench = useCanvasStore((state) => state.openWorkbench);

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
        useCanvasStore.getState().loadedWorkbenchId === targetWorkbenchId
      ) {
        return;
      }
      await openWorkbench(targetWorkbenchId);
    },
    [openWorkbench]
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
      activeWorkbenchId: loadedWorkbenchId,
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
      void openWorkbench(recoveryPlan.workbenchId);
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
      const created = await createWorkbench(undefined, { openAfterCreate: false });
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
    createWorkbench,
    finalizeRecoveryNavigation,
    hasInitializedCanvas,
    isLoading,
    loadedWorkbenchId,
    navigate,
    openWorkbench,
    pendingRecoveryToken,
    routeWorkbenchId,
    workbenchIds,
  ]);
}
