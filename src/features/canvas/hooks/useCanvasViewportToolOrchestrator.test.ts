import { describe, expect, it } from "vitest";
import { isCanvasWorkspaceBackgroundTarget } from "./useCanvasViewportToolOrchestrator";

const createTarget = (type: string, id = "") =>
  ({
    getType: () => type,
    id: () => id,
  }) as never;

const createStage = (options?: { intersectionTarget?: ReturnType<typeof createTarget> | null }) =>
  ({
    getType: () => "Stage",
    getPointerPosition: () => ({ x: 100, y: 100 }),
    getIntersection: () => options?.intersectionTarget ?? null,
    id: () => "",
  }) as never;

describe("isCanvasWorkspaceBackgroundTarget", () => {
  it("treats the stage, empty layers, and the workspace background node as background", () => {
    const stage = createStage();

    expect(isCanvasWorkspaceBackgroundTarget(stage, stage)).toBe(true);
    expect(isCanvasWorkspaceBackgroundTarget(stage, createTarget("Layer"))).toBe(true);
    expect(
      isCanvasWorkspaceBackgroundTarget(stage, createTarget("Rect", "canvas-workspace-background"))
    ).toBe(true);
  });

  it("keeps element targets out of the background path", () => {
    const stage = createStage();

    expect(isCanvasWorkspaceBackgroundTarget(stage, createTarget("Text", "node-text-1"))).toBe(
      false
    );
    expect(isCanvasWorkspaceBackgroundTarget(stage, createTarget("Image", "node-image-1"))).toBe(
      false
    );
  });

  it("prefers the real pointer intersection over a layer fallback target", () => {
    const shapeTarget = createTarget("Rect", "node-shape-1");
    const stage = createStage({
      intersectionTarget: shapeTarget,
    });

    expect(isCanvasWorkspaceBackgroundTarget(stage, createTarget("Layer"))).toBe(false);
  });
});
