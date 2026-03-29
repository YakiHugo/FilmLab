import { describe, expect, it } from "vitest";
import { resolveCanvasPageRecoveryPlan } from "./canvasPageState";

describe("canvasPageState", () => {
  it("prefers the currently loaded workbench when it still exists", () => {
    expect(
      resolveCanvasPageRecoveryPlan({
        activeWorkbenchId: "workbench-2",
        workbenchIds: ["workbench-1", "workbench-2"],
      })
    ).toEqual({
      type: "navigate-to-fallback",
      workbenchId: "workbench-2",
    });
  });

  it("falls back to the first available workbench when the active one is missing", () => {
    expect(
      resolveCanvasPageRecoveryPlan({
        activeWorkbenchId: "missing",
        workbenchIds: ["workbench-1", "workbench-2"],
      })
    ).toEqual({
      type: "navigate-to-fallback",
      workbenchId: "workbench-1",
    });
  });

  it("creates a new workbench when none exist", () => {
    expect(
      resolveCanvasPageRecoveryPlan({
        activeWorkbenchId: null,
        workbenchIds: [],
      })
    ).toEqual({ type: "create-and-navigate" });
  });
});
