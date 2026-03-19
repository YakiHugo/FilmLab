import { describe, expect, it, vi } from "vitest";
import type { CanvasShapeType } from "@/types";
import { resolveCanvasToolController } from "./toolControllers";

const createContext = () => ({
  activeDocumentId: "doc-1",
  activeShapeType: "rect" as CanvasShapeType,
  beginMarqueeSelection: vi.fn(),
  beginPan: vi.fn(),
  beginTextEdit: vi.fn(),
  clearSelection: vi.fn(),
  commitMarqueeSelection: vi.fn(),
  endPan: vi.fn(),
  insertShape: vi.fn(),
  selectElement: vi.fn(),
  setTool: vi.fn(),
  updateMarqueeSelection: vi.fn(),
  updatePan: vi.fn(),
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

    expect(context.beginMarqueeSelection).toHaveBeenCalledWith({
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
      isBackgroundTarget: true,
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

    expect(context.beginPan).toHaveBeenCalledWith({ x: 400, y: 300 });
    expect(context.updatePan).toHaveBeenCalledWith({ x: 420, y: 330 });
    expect(context.endPan).toHaveBeenCalled();
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

    expect(context.clearSelection).toHaveBeenCalled();
    expect(context.setTool).toHaveBeenCalledWith("select");
    expect(context.beginTextEdit).toHaveBeenCalledWith(
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
    context.activeShapeType = "arrow";

    controller.onPointerDown(context, {
      additive: false,
      canvasPoint: { x: 160, y: 240 },
      isBackgroundTarget: true,
      screenPoint: { x: 0, y: 0 },
    });

    expect(context.clearSelection).toHaveBeenCalled();
    expect(context.insertShape).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "shape",
        shapeType: "arrow",
      })
    );
    expect(context.selectElement).toHaveBeenCalledWith(
      context.insertShape.mock.calls[0]?.[0]?.id
    );
    expect(context.setTool).toHaveBeenCalledWith("select");
  });
});
