import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { shallow } from "zustand/shallow";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasWorkbenchTransitionGuard } from "../canvasWorkbenchTransitionGuardHooks";
import { resolveCanvasPageRecoveryPlan } from "../canvasPageState";

const getCurrentWorkbenchIds = () =>
  useCanvasStore.getState().workbenchList.map((workbench) => workbench.id);

export const resolveCanvasRouteWorkbenchId = (pathname: string): string | null => {
  if (!pathname.startsWith("/canvas/")) {
    return null;
  }

  const encodedWorkbenchId = pathname.slice("/canvas/".length).trim();
  if (!encodedWorkbenchId || encodedWorkbenchId.includes("/")) {
    return null;
  }

  return decodeURIComponent(encodedWorkbenchId);
};

export function useCanvasRouteWorkbenchSync() {
  const navigate = useNavigate();
  const pathname = useLocation({
    select: (state) => state.pathname,
  });
  const routeWorkbenchId = resolveCanvasRouteWorkbenchId(pathname);
  const recoveryTokenRef = useRef(0);
  const loadedWorkbenchId = useCanvasStore((state) => state.loadedWorkbenchId);
  const loadedWorkbenchInteraction = useCanvasStore((state) =>
    state.loadedWorkbenchId === loadedWorkbenchId ? state.workbenchInteraction : null
  );
  const workbenchIds = useCanvasStore(
    (state) => state.workbenchList.map((workbench) => workbench.id),
    shallow
  );
  const init = useCanvasStore((state) => state.init);
  const createWorkbench = useCanvasStore((state) => state.createWorkbench);
  const openWorkbench = useCanvasStore((state) => state.openWorkbench);
  const runBeforeWorkbenchTransition = useCanvasWorkbenchTransitionGuard();
  const loadedWorkbenchInteractionKey = `${loadedWorkbenchInteraction?.active ? 1 : 0}:${
    loadedWorkbenchInteraction?.pendingCommits ?? 0
  }:${loadedWorkbenchInteraction?.queuedMutations ?? 0}`;

  const awaitWorkbenchTransitionGuard = useCallback(async () => {
    try {
      await runBeforeWorkbenchTransition();
      return true;
    } catch {
      return false;
    }
  }, [runBeforeWorkbenchTransition]);

  useEffect(() => {
    let disposed = false;
    const recoveryToken = recoveryTokenRef.current + 1;
    recoveryTokenRef.current = recoveryToken;

    const isStale = () => disposed || recoveryTokenRef.current !== recoveryToken;

    const navigateToWorkbench = async (workbenchId: string) => {
      await navigate({
        to: "/canvas/$workbenchId",
        params: { workbenchId },
      });
    };

    const refreshWorkbenchList = async () => {
      await init();
      return getCurrentWorkbenchIds();
    };

    const createAndNavigate = async () => {
      if (!(await awaitWorkbenchTransitionGuard()) || isStale()) {
        return;
      }

      const created = await createWorkbench(undefined, { openAfterCreate: false });
      if (!created || isStale()) {
        return;
      }

      await navigateToWorkbench(created.id);
    };

    void (async () => {
      if (routeWorkbenchId) {
        if (routeWorkbenchId === loadedWorkbenchId) {
          void init();
          return;
        }

        if (!(await awaitWorkbenchTransitionGuard()) || isStale()) {
          return;
        }

        const opened = await openWorkbench(routeWorkbenchId);
        if (isStale()) {
          return;
        }

        void init();
        if (opened) {
          return;
        }

        const latestWorkbenchIds = await refreshWorkbenchList();
        if (isStale()) {
          return;
        }

        const recoveryPlan = resolveCanvasPageRecoveryPlan({
          activeWorkbenchId: useCanvasStore.getState().loadedWorkbenchId,
          workbenchIds: latestWorkbenchIds,
        });
        if (recoveryPlan.type === "navigate-to-fallback") {
          if (recoveryPlan.workbenchId !== routeWorkbenchId) {
            await navigateToWorkbench(recoveryPlan.workbenchId);
          }
          return;
        }

        await createAndNavigate();
        return;
      }

      void init();
      if (loadedWorkbenchId) {
        if (!(await awaitWorkbenchTransitionGuard()) || isStale()) {
          return;
        }

        await navigateToWorkbench(loadedWorkbenchId);
        return;
      }

      const latestWorkbenchIds = await refreshWorkbenchList();
      if (isStale()) {
        return;
      }

      const recoveryPlan = resolveCanvasPageRecoveryPlan({
        activeWorkbenchId: useCanvasStore.getState().loadedWorkbenchId,
        workbenchIds: latestWorkbenchIds,
      });
      if (recoveryPlan.type === "navigate-to-fallback") {
        if (!(await awaitWorkbenchTransitionGuard()) || isStale()) {
          return;
        }

        await navigateToWorkbench(recoveryPlan.workbenchId);
        return;
      }

      await createAndNavigate();
    })();

    return () => {
      disposed = true;
    };
  }, [
    createWorkbench,
    init,
    loadedWorkbenchInteractionKey,
    loadedWorkbenchId,
    navigate,
    openWorkbench,
    pathname,
    routeWorkbenchId,
    awaitWorkbenchTransitionGuard,
    workbenchIds,
  ]);
}
