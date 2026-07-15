import { describe, expect, it } from "vitest";
import { isCanvasRoutePath, resolveCanvasRouteWorkbenchId } from "./useCanvasRouteWorkbenchSync";

describe("resolveCanvasRouteWorkbenchId", () => {
  it("returns null for non-canvas paths and the canvas root", () => {
    expect(resolveCanvasRouteWorkbenchId("/")).toBeNull();
    expect(resolveCanvasRouteWorkbenchId("/canvas")).toBeNull();
    expect(resolveCanvasRouteWorkbenchId("/library")).toBeNull();
  });

  it("returns the decoded workbench id for canvas document routes", () => {
    expect(resolveCanvasRouteWorkbenchId("/canvas/workbench-1")).toBe("workbench-1");
    expect(resolveCanvasRouteWorkbenchId("/canvas/workbench%20id")).toBe("workbench id");
  });

  it("rejects nested canvas paths that are not a direct workbench route", () => {
    expect(resolveCanvasRouteWorkbenchId("/canvas/workbench-1/extra")).toBeNull();
  });

  it("distinguishes canvas routes from locations being left", () => {
    expect(isCanvasRoutePath("/canvas")).toBe(true);
    expect(isCanvasRoutePath("/canvas/workbench-1")).toBe(true);
    expect(isCanvasRoutePath("/")).toBe(false);
    expect(isCanvasRoutePath("/canvas-lab")).toBe(false);
  });
});
