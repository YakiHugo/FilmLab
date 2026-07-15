export type CanvasPageRecoveryPlan =
  | { type: "navigate-to-fallback"; workbenchId: string }
  | { type: "return-to-studio" };

interface ResolveCanvasPageRecoveryPlanOptions {
  activeWorkbenchId: string | null;
  unavailableWorkbenchId?: string | null;
  workbenchIds: string[];
}

export const resolveCanvasPageRecoveryPlan = ({
  activeWorkbenchId,
  unavailableWorkbenchId,
  workbenchIds,
}: ResolveCanvasPageRecoveryPlanOptions): CanvasPageRecoveryPlan => {
  const availableWorkbenchIds = workbenchIds.filter(
    (workbenchId) => workbenchId !== unavailableWorkbenchId
  );

  return activeWorkbenchId && availableWorkbenchIds.includes(activeWorkbenchId)
    ? {
        type: "navigate-to-fallback",
        workbenchId: activeWorkbenchId,
      }
    : availableWorkbenchIds[0]
      ? {
          type: "navigate-to-fallback",
          workbenchId: availableWorkbenchIds[0],
        }
      : { type: "return-to-studio" };
};
