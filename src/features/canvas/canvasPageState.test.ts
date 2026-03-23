import { describe, expect, it } from "vitest";
import {
  resolveCanvasPageRecoveryPlan,
  shouldAutoOpenCanvasEditPanel,
} from "./canvasPageState";

describe("canvasPageState", () => {
  it("waits until canvas initialization completes", () => {
    expect(
      resolveCanvasPageRecoveryPlan({
        activeWorkbenchId: "workbench-1",
        hasInitialized: false,
        hasPendingRecovery: false,
        isLoading: false,
        routeWorkbenchId: "workbench-1",
        workbenchIds: ["workbench-1"],
      })
    ).toEqual({ type: "wait" });
  });

  it("waits while loading or a recovery action is already pending", () => {
    expect(
      resolveCanvasPageRecoveryPlan({
        activeWorkbenchId: "workbench-1",
        hasInitialized: true,
        hasPendingRecovery: false,
        isLoading: true,
        routeWorkbenchId: "workbench-1",
        workbenchIds: ["workbench-1"],
      })
    ).toEqual({ type: "wait" });

    expect(
      resolveCanvasPageRecoveryPlan({
        activeWorkbenchId: "workbench-1",
        hasInitialized: true,
        hasPendingRecovery: true,
        isLoading: false,
        routeWorkbenchId: "missing",
        workbenchIds: ["workbench-1"],
      })
    ).toEqual({ type: "wait" });
  });

  it("activates the route workbench when it exists but is not active yet", () => {
    expect(
      resolveCanvasPageRecoveryPlan({
        activeWorkbenchId: "workbench-2",
        hasInitialized: true,
        hasPendingRecovery: false,
        isLoading: false,
        routeWorkbenchId: "workbench-1",
        workbenchIds: ["workbench-1", "workbench-2"],
      })
    ).toEqual({
      type: "activate-route",
      workbenchId: "workbench-1",
    });
  });

  it("navigates to the active workbench when the route id is invalid", () => {
    expect(
      resolveCanvasPageRecoveryPlan({
        activeWorkbenchId: "workbench-2",
        hasInitialized: true,
        hasPendingRecovery: false,
        isLoading: false,
        routeWorkbenchId: "missing",
        workbenchIds: ["workbench-1", "workbench-2"],
      })
    ).toEqual({
      type: "navigate-to-fallback",
      workbenchId: "workbench-2",
    });
  });

  it("falls back to the first workbench when the route and active ids are invalid", () => {
    expect(
      resolveCanvasPageRecoveryPlan({
        activeWorkbenchId: "missing",
        hasInitialized: true,
        hasPendingRecovery: false,
        isLoading: false,
        routeWorkbenchId: "also-missing",
        workbenchIds: ["workbench-1", "workbench-2"],
      })
    ).toEqual({
      type: "navigate-to-fallback",
      workbenchId: "workbench-1",
    });
  });

  it("uses the same fallback-or-create rule when the route id is absent", () => {
    expect(
      resolveCanvasPageRecoveryPlan({
        activeWorkbenchId: "workbench-2",
        hasInitialized: true,
        hasPendingRecovery: false,
        isLoading: false,
        routeWorkbenchId: null,
        workbenchIds: ["workbench-1", "workbench-2"],
      })
    ).toEqual({
      type: "navigate-to-fallback",
      workbenchId: "workbench-2",
    });

    expect(
      resolveCanvasPageRecoveryPlan({
        activeWorkbenchId: null,
        hasInitialized: true,
        hasPendingRecovery: false,
        isLoading: false,
        routeWorkbenchId: null,
        workbenchIds: [],
      })
    ).toEqual({ type: "create-and-navigate" });
  });

  it("opens the edit panel only when an image is selected and edit is not already active", () => {
    expect(
      shouldAutoOpenCanvasEditPanel({
        activePanel: "layers",
        hasSelectedImage: true,
      })
    ).toBe(true);
    expect(
      shouldAutoOpenCanvasEditPanel({
        activePanel: "edit",
        hasSelectedImage: true,
      })
    ).toBe(false);
    expect(
      shouldAutoOpenCanvasEditPanel({
        activePanel: null,
        hasSelectedImage: false,
      })
    ).toBe(false);
  });
});
