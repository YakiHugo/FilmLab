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

  it("returns to the image-first Studio when no workbench exists", () => {
    expect(
      resolveCanvasPageRecoveryPlan({
        activeWorkbenchId: null,
        workbenchIds: [],
      })
    ).toEqual({ type: "return-to-studio" });
  });

  it("excludes a workbench whose document could not be opened", () => {
    expect(
      resolveCanvasPageRecoveryPlan({
        activeWorkbenchId: "workbench-1",
        unavailableWorkbenchId: "workbench-1",
        workbenchIds: ["workbench-1", "workbench-2"],
      })
    ).toEqual({
      type: "navigate-to-fallback",
      workbenchId: "workbench-2",
    });

    expect(
      resolveCanvasPageRecoveryPlan({
        activeWorkbenchId: "workbench-1",
        unavailableWorkbenchId: "workbench-1",
        workbenchIds: ["workbench-1"],
      })
    ).toEqual({ type: "return-to-studio" });
  });
});
