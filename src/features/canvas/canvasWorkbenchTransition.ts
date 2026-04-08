import type { CanvasWorkbenchInteractionStatus } from "./store/canvasStoreTypes";

export const CANVAS_WORKBENCH_TRANSITION_INTERACTION_ERROR =
  "Cannot switch workbenches while a canvas interaction is still settling.";

export const CANVAS_WORKBENCH_TRANSITION_TEXT_SESSION_ERROR =
  "Failed to commit active text session before switching workbenches.";

interface RunCanvasWorkbenchTransitionGuardOptions {
  commitTextSession: () => Promise<"committed" | "noop" | "skipped">;
  hasActiveTextSession: boolean;
  interactionStatus: CanvasWorkbenchInteractionStatus | null;
}

export const runCanvasWorkbenchTransitionGuard = async ({
  commitTextSession,
  hasActiveTextSession,
  interactionStatus,
}: RunCanvasWorkbenchTransitionGuardOptions) => {
  if (
    interactionStatus?.active ||
    (interactionStatus?.pendingCommits ?? 0) > 0 ||
    (interactionStatus?.queuedMutations ?? 0) > 0
  ) {
    throw new Error(CANVAS_WORKBENCH_TRANSITION_INTERACTION_ERROR);
  }

  if (!hasActiveTextSession) {
    return;
  }

  const result = await commitTextSession();
  if (result === "skipped") {
    throw new Error(CANVAS_WORKBENCH_TRANSITION_TEXT_SESSION_ERROR);
  }
};
