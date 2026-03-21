import type { CanvasShapeType, CanvasTextElement } from "@/types";
import { createId } from "@/utils";
import { createDefaultShapeNode } from "../documentGraph";
import { snapPoint } from "../grid";
import {
  DEFAULT_CANVAS_TEXT_COLOR,
  DEFAULT_CANVAS_TEXT_FONT_FAMILY,
  DEFAULT_CANVAS_TEXT_FONT_SIZE,
  DEFAULT_CANVAS_TEXT_FONT_SIZE_TIER,
  fitCanvasTextElementToContent,
} from "../textStyle";

export type CanvasToolName = "select" | "text" | "hand" | "shape";

export interface CanvasToolPoint {
  x: number;
  y: number;
}

export interface CanvasToolPointerPayload {
  additive: boolean;
  canvasPoint: CanvasToolPoint | null;
  isBackgroundTarget: boolean;
  screenPoint: CanvasToolPoint | null;
}

export interface CanvasToolControllerContext {
  activeWorkbenchId: string | null;
  activeShapeType: CanvasShapeType;
  beginMarqueeSelection: (payload: {
    additive: boolean;
    canvasPoint: CanvasToolPoint;
    screenPoint: CanvasToolPoint;
  }) => void;
  beginPan: (screenPoint: CanvasToolPoint) => void;
  beginTextEdit: (element: CanvasTextElement, options?: { mode?: "existing" | "create" }) => void;
  clearSelection: () => void;
  commitMarqueeSelection: (payload: {
    canvasPoint: CanvasToolPoint | null;
    screenPoint: CanvasToolPoint | null;
  }) => void;
  endPan: () => void;
  insertShape: (element: ReturnType<typeof createDefaultShapeNode>) => void;
  selectElement: (elementId: string) => void;
  setTool: (tool: CanvasToolName) => void;
  updateMarqueeSelection: (payload: {
    canvasPoint: CanvasToolPoint;
    screenPoint: CanvasToolPoint;
  }) => void;
  updatePan: (screenPoint: CanvasToolPoint) => void;
}

export interface CanvasToolController {
  onPointerDown: (
    context: CanvasToolControllerContext,
    payload: CanvasToolPointerPayload
  ) => void;
  onPointerMove?: (
    context: CanvasToolControllerContext,
    payload: Pick<CanvasToolPointerPayload, "canvasPoint" | "screenPoint">
  ) => void;
  onPointerUp?: (
    context: CanvasToolControllerContext,
    payload: Pick<CanvasToolPointerPayload, "canvasPoint" | "screenPoint">
  ) => void;
}

const selectToolController: CanvasToolController = {
  onPointerDown: (context, payload) => {
    if (!payload.isBackgroundTarget || !payload.canvasPoint || !payload.screenPoint) {
      return;
    }
    context.beginMarqueeSelection({
      additive: payload.additive,
      canvasPoint: payload.canvasPoint,
      screenPoint: payload.screenPoint,
    });
  },
  onPointerMove: (context, payload) => {
    if (!payload.canvasPoint || !payload.screenPoint) {
      return;
    }
    context.updateMarqueeSelection({
      canvasPoint: payload.canvasPoint,
      screenPoint: payload.screenPoint,
    });
  },
  onPointerUp: (context, payload) => {
    context.commitMarqueeSelection(payload);
  },
};

const handToolController: CanvasToolController = {
  onPointerDown: (context, payload) => {
    if (!payload.isBackgroundTarget || !payload.screenPoint) {
      return;
    }
    context.beginPan(payload.screenPoint);
  },
  onPointerMove: (context, payload) => {
    if (!payload.screenPoint) {
      return;
    }
    context.updatePan(payload.screenPoint);
  },
  onPointerUp: (context) => {
    context.endPan();
  },
};

const textToolController: CanvasToolController = {
  onPointerDown: (context, payload) => {
    if (!payload.isBackgroundTarget || !payload.canvasPoint) {
      return;
    }

    const snappedPoint = snapPoint(payload.canvasPoint);
    const textElement = fitCanvasTextElementToContent({
      id: createId("node-id"),
      type: "text",
      parentId: null,
      content: "",
      x: snappedPoint.x,
      y: snappedPoint.y,
      width: 1,
      height: 1,
      rotation: 0,
      transform: {
        x: snappedPoint.x,
        y: snappedPoint.y,
        width: 1,
        height: 1,
        rotation: 0,
      },
      opacity: 1,
      locked: false,
      visible: true,
      fontFamily: DEFAULT_CANVAS_TEXT_FONT_FAMILY,
      fontSize: DEFAULT_CANVAS_TEXT_FONT_SIZE,
      fontSizeTier: DEFAULT_CANVAS_TEXT_FONT_SIZE_TIER,
      color: DEFAULT_CANVAS_TEXT_COLOR,
      textAlign: "left",
    });
    context.clearSelection();
    context.setTool("select");
    context.beginTextEdit(textElement, { mode: "create" });
  },
};

const shapeToolController: CanvasToolController = {
  onPointerDown: (context, payload) => {
    if (!payload.isBackgroundTarget || !payload.canvasPoint || !context.activeWorkbenchId) {
      return;
    }

    const snappedPoint = snapPoint(payload.canvasPoint);
    const nextShape = createDefaultShapeNode({
      shapeType: context.activeShapeType,
      x: snappedPoint.x,
      y: snappedPoint.y,
    });

    context.clearSelection();
    context.insertShape(nextShape);
    context.selectElement(nextShape.id);
    context.setTool("select");
  },
};

export const resolveCanvasToolController = (
  tool: CanvasToolName,
  shouldPan: boolean
): CanvasToolController => {
  if (shouldPan) {
    return handToolController;
  }

  if (tool === "text") {
    return textToolController;
  }

  if (tool === "shape") {
    return shapeToolController;
  }

  if (tool === "hand") {
    return handToolController;
  }

  return selectToolController;
};
