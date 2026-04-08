import { describe, expect, it, vi } from "vitest";
import {
  CANVAS_WORKBENCH_TRANSITION_INTERACTION_ERROR,
  CANVAS_WORKBENCH_TRANSITION_TEXT_SESSION_ERROR,
  runCanvasWorkbenchTransitionGuard,
} from "./canvasWorkbenchTransition";

describe("runCanvasWorkbenchTransitionGuard", () => {
  it("blocks workbench transitions while canvas interaction state is still settling", async () => {
    const commitTextSession = vi.fn();

    await expect(
      runCanvasWorkbenchTransitionGuard({
        commitTextSession,
        hasActiveTextSession: true,
        interactionStatus: {
          active: false,
          pendingCommits: 1,
          queuedMutations: 0,
        },
      })
    ).rejects.toThrow(CANVAS_WORKBENCH_TRANSITION_INTERACTION_ERROR);

    expect(commitTextSession).not.toHaveBeenCalled();
  });

  it("does not commit text when no text session is active", async () => {
    const commitTextSession = vi.fn().mockResolvedValue("committed");

    await expect(
      runCanvasWorkbenchTransitionGuard({
        commitTextSession,
        hasActiveTextSession: false,
        interactionStatus: null,
      })
    ).resolves.toBeUndefined();

    expect(commitTextSession).not.toHaveBeenCalled();
  });

  it("commits active text before allowing the transition", async () => {
    const commitTextSession = vi.fn().mockResolvedValue("committed");

    await expect(
      runCanvasWorkbenchTransitionGuard({
        commitTextSession,
        hasActiveTextSession: true,
        interactionStatus: null,
      })
    ).resolves.toBeUndefined();

    expect(commitTextSession).toHaveBeenCalledTimes(1);
  });

  it("accepts noop text-session commits during transition", async () => {
    const commitTextSession = vi.fn().mockResolvedValue("noop");

    await expect(
      runCanvasWorkbenchTransitionGuard({
        commitTextSession,
        hasActiveTextSession: true,
        interactionStatus: {
          active: false,
          pendingCommits: 0,
          queuedMutations: 0,
        },
      })
    ).resolves.toBeUndefined();
  });

  it("fails the transition when the text-session commit is skipped", async () => {
    const commitTextSession = vi.fn().mockResolvedValue("skipped");

    await expect(
      runCanvasWorkbenchTransitionGuard({
        commitTextSession,
        hasActiveTextSession: true,
        interactionStatus: {
          active: false,
          pendingCommits: 0,
          queuedMutations: 0,
        },
      })
    ).rejects.toThrow(CANVAS_WORKBENCH_TRANSITION_TEXT_SESSION_ERROR);
  });
});
