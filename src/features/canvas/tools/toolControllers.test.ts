import { describe, expect, it, vi } from "vitest";
import type { CanvasShapeType } from "@/types";
import {
  resolveCanvasToolController,
  shouldCanvasToolSelectElements,
} from "./toolControllers";

const createContext = () => ({
  marquee: {
    beginSelection: vi.fn(),
    commitSelection: vi.fn(),
    updateSelection: vi.fn(),
  },
  pan: {
    begin: vi.fn(),
    end: vi.fn(),
    update: vi.fn(),
  },
  selection: {
    clear: vi.fn(),
    select: vi.fn(),
    suppressElementActivation: vi.fn(),
  },
  shape: {
    activeShapeType: "rect" as CanvasShapeType,
    insert: vi.fn(),
  },
  text: {
    beginEdit: vi.fn(),
  },
  toolState: {
    setTool: vi.fn(),
  },
  workbench: {
    activeWorkbenchId: "doc-1",
  },
});

describe("toolControllers", () => {
  it("routes select tool pointer down into marquee selection", () => {
    const controller = resolveCanvasToolController("select", false);
    const context = createContext();

    controller.onPointerDown(context, {
      additive: true,
      canvasPoint: { x: 120, y: 180 },
      isBackgroundTarget: true,
      screenPoint: { x: 480, y: 520 },
    });

    expect(context.marquee.beginSelection).toHaveBeenCalledWith({
      additive: true,
      canvasPoint: { x: 120, y: 180 },
      screenPoint: { x: 480, y: 520 },
    });
  });

  it("routes hand tool movement into pan handlers", () => {
    const controller = resolveCanvasToolController("hand", false);
    const context = createContext();

    controller.onPointerDown(context, {
      additive: false,
      canvasPoint: { x: 0, y: 0 },
      isBackgroundTarget: false,
      screenPoint: { x: 400, y: 300 },
    });
    controller.onPointerMove?.(context, {
      canvasPoint: { x: 0, y: 0 },
      screenPoint: { x: 420, y: 330 },
    });
    controller.onPointerUp?.(context, {
      canvasPoint: null,
      screenPoint: null,
    });

    expect(context.pan.begin).toHaveBeenCalledWith({ x: 400, y: 300 });
    expect(context.pan.update).toHaveBeenCalledWith({ x: 420, y: 330 });
    expect(context.pan.end).toHaveBeenCalled();
  });

  it("creates text through the text tool controller", () => {
    const controller = resolveCanvasToolController("text", false);
    const context = createContext();

    controller.onPointerDown(context, {
      additive: false,
      canvasPoint: { x: 123, y: 187 },
      isBackgroundTarget: true,
      screenPoint: { x: 0, y: 0 },
    });

    expect(context.selection.clear).toHaveBeenCalled();
    expect(context.toolState.setTool).toHaveBeenCalledWith("select");
    expect(context.text.beginEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "text",
        parentId: null,
      }),
      { mode: "create" }
    );
  });

  it("creates a shape through the shape tool controller", () => {
    const controller = resolveCanvasToolController("shape", false);
    const context = createContext();
    context.shape.activeShapeType = "arrow";

    controller.onPointerDown(context, {
      additive: false,
      canvasPoint: { x: 160, y: 240 },
      isBackgroundTarget: true,
      screenPoint: { x: 0, y: 0 },
    });

    expect(context.shape.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "shape",
        shapeType: "arrow",
      })
    );
    expect(context.selection.clear).toHaveBeenCalled();
    expect(context.selection.suppressElementActivation).toHaveBeenCalled();
    expect(context.selection.select).not.toHaveBeenCalled();
    expect(context.toolState.setTool).toHaveBeenCalledWith("select");
  });

  it("uses rect as the default shape subtype", () => {
    const controller = resolveCanvasToolController("shape", false);
    const context = createContext();

    controller.onPointerDown(context, {
      additive: false,
      canvasPoint: { x: 160, y: 240 },
      isBackgroundTarget: true,
      screenPoint: { x: 0, y: 0 },
    });

    expect(context.shape.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "shape",
        shapeType: "rect",
      })
    );
  });

  it("keeps background gating inside the text tool controller", () => {
    const controller = resolveCanvasToolController("text", false);
    const context = createContext();

    controller.onPointerDown(context, {
      additive: false,
      canvasPoint: { x: 123, y: 187 },
      isBackgroundTarget: false,
      screenPoint: { x: 0, y: 0 },
    });

    expect(context.text.beginEdit).not.toHaveBeenCalled();
  });

  it("keeps background gating inside the shape tool controller", () => {
    const controller = resolveCanvasToolController("shape", false);
    const context = createContext();

    controller.onPointerDown(context, {
      additive: false,
      canvasPoint: { x: 160, y: 240 },
      isBackgroundTarget: false,
      screenPoint: { x: 0, y: 0 },
    });

    expect(context.shape.insert).not.toHaveBeenCalled();
    expect(context.toolState.setTool).not.toHaveBeenCalled();
  });

  it("only allows element selection in select mode when not panning", () => {
    expect(
      shouldCanvasToolSelectElements({
        shouldPan: false,
        tool: "select",
      })
    ).toBe(true);
    expect(
      shouldCanvasToolSelectElements({
        shouldPan: false,
        tool: "shape",
      })
    ).toBe(false);
    expect(
      shouldCanvasToolSelectElements({
        shouldPan: true,
        tool: "select",
      })
    ).toBe(false);
  });
});
