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

export const isCanvasRoutePath = (pathname: string) =>
  pathname === "/canvas" || pathname.startsWith("/canvas/");

export function useCanvasRouteWorkbenchSync() {
  const navigate = useNavigate();
  const pathname = useLocation({
    select: (state) => state.pathname,
  });
  const routeWorkbenchId = resolveCanvasRouteWorkbenchId(pathname);
  const activeRecoveryRef = useRef<{ pathname: string } | null>(null);
  const mountedRef = useRef(true);
  const loadedWorkbenchId = useCanvasStore((state) => state.loadedWorkbenchId);
  const loadedWorkbenchInteraction = useCanvasStore((state) =>
    state.loadedWorkbenchId === loadedWorkbenchId ? state.workbenchInteraction : null
  );
  const workbenchIds = useCanvasStore(
    (state) => state.workbenchList.map((workbench) => workbench.id),
    shallow
  );
  const init = useCanvasStore((state) => state.init);
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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRecoveryRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (activeRecoveryRef.current?.pathname === pathname) {
      return;
    }

    const recoveryAttempt = { pathname };
    activeRecoveryRef.current = recoveryAttempt;

    const isStale = () => !mountedRef.current || activeRecoveryRef.current !== recoveryAttempt;

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

    const returnToStudio = async () => {
      if (!(await awaitWorkbenchTransitionGuard()) || isStale()) {
        return;
      }

      await navigate({ to: "/" });
    };

    void (async () => {
      if (!isCanvasRoutePath(pathname)) {
        return;
      }

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
          unavailableWorkbenchId: routeWorkbenchId,
          workbenchIds: latestWorkbenchIds,
        });
        if (recoveryPlan.type === "navigate-to-fallback") {
          await navigateToWorkbench(recoveryPlan.workbenchId);
          return;
        }

        await returnToStudio();
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

      await returnToStudio();
    })().finally(() => {
      if (activeRecoveryRef.current === recoveryAttempt) {
        activeRecoveryRef.current = null;
      }
    });
  }, [
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
