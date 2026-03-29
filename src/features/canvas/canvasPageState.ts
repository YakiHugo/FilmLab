export type CanvasPageRecoveryPlan =
  | { type: "navigate-to-fallback"; workbenchId: string }
  | { type: "create-and-navigate" };

interface ResolveCanvasPageRecoveryPlanOptions {
  activeWorkbenchId: string | null;
  workbenchIds: string[];
}

const hasWorkbench = (workbenchIds: string[], workbenchId: string | null | undefined) =>
  Boolean(workbenchId && workbenchIds.includes(workbenchId));

export const resolveCanvasPageRecoveryPlan = ({
  activeWorkbenchId,
  workbenchIds,
}: ResolveCanvasPageRecoveryPlanOptions): CanvasPageRecoveryPlan =>
  hasWorkbench(workbenchIds, activeWorkbenchId)
    ? {
        type: "navigate-to-fallback",
        workbenchId: activeWorkbenchId!,
      }
    : workbenchIds[0]
      ? {
          type: "navigate-to-fallback",
          workbenchId: workbenchIds[0],
        }
      : { type: "create-and-navigate" };
