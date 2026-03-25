import type { CanvasFloatingPanel } from "./store/canvasStoreTypes";

export type CanvasPageRecoveryPlan =
  | { type: "wait" }
  | { type: "activate-route"; workbenchId: string }
  | { type: "navigate-to-fallback"; workbenchId: string }
  | { type: "create-and-navigate" };

interface ResolveCanvasPageRecoveryPlanOptions {
  activeWorkbenchId: string | null;
  hasInitialized: boolean;
  hasPendingRecovery: boolean;
  isLoading: boolean;
  routeWorkbenchId: string | null;
  workbenchIds: string[];
}

const hasWorkbench = (workbenchIds: string[], workbenchId: string | null | undefined) =>
  Boolean(workbenchId && workbenchIds.includes(workbenchId));

const resolveFallbackWorkbenchId = ({
  activeWorkbenchId,
  workbenchIds,
}: Pick<ResolveCanvasPageRecoveryPlanOptions, "activeWorkbenchId" | "workbenchIds">) =>
  hasWorkbench(workbenchIds, activeWorkbenchId) ? activeWorkbenchId : workbenchIds[0] ?? null;

export const resolveCanvasPageRecoveryPlan = ({
  activeWorkbenchId,
  hasInitialized,
  hasPendingRecovery,
  isLoading,
  routeWorkbenchId,
  workbenchIds,
}: ResolveCanvasPageRecoveryPlanOptions): CanvasPageRecoveryPlan => {
  if (isLoading || !hasInitialized || hasPendingRecovery) {
    return { type: "wait" };
  }

  if (routeWorkbenchId) {
    if (!hasWorkbench(workbenchIds, routeWorkbenchId)) {
      const fallbackWorkbenchId = resolveFallbackWorkbenchId({
        activeWorkbenchId,
        workbenchIds,
      });
      return fallbackWorkbenchId
        ? {
            type: "navigate-to-fallback",
            workbenchId: fallbackWorkbenchId,
          }
        : { type: "create-and-navigate" };
    }

    return routeWorkbenchId !== activeWorkbenchId
      ? { type: "activate-route", workbenchId: routeWorkbenchId }
      : { type: "wait" };
  }

  const fallbackWorkbenchId = resolveFallbackWorkbenchId({
    activeWorkbenchId,
    workbenchIds,
  });
  return fallbackWorkbenchId
    ? { type: "navigate-to-fallback", workbenchId: fallbackWorkbenchId }
    : { type: "create-and-navigate" };
};

export const shouldAutoOpenCanvasEditPanel = ({
  activePanel,
  currentSelectedImageId,
  previousSelectedImageId,
}: {
  activePanel: CanvasFloatingPanel;
  currentSelectedImageId: string | null;
  previousSelectedImageId: string | null;
}) =>
  activePanel !== "edit" &&
  currentSelectedImageId !== null &&
  currentSelectedImageId !== previousSelectedImageId;
