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

export interface CanvasToolActionPort {
  marquee: {
    beginSelection: (payload: {
      additive: boolean;
      canvasPoint: CanvasToolPoint;
      screenPoint: CanvasToolPoint;
    }) => void;
    commitSelection: (payload: {
      canvasPoint: CanvasToolPoint | null;
      screenPoint: CanvasToolPoint | null;
    }) => void;
    updateSelection: (payload: {
      canvasPoint: CanvasToolPoint;
      screenPoint: CanvasToolPoint;
    }) => void;
  };
  pan: {
    begin: (screenPoint: CanvasToolPoint) => void;
    end: () => void;
    update: (screenPoint: CanvasToolPoint) => void;
  };
  selection: {
    clear: () => void;
    select: (elementId: string) => void;
  };
  shape: {
    activeShapeType: CanvasShapeType;
    insert: (element: ReturnType<typeof createDefaultShapeNode>) => void;
  };
  text: {
    beginEdit: (
      element: CanvasTextElement,
      options?: { mode?: "existing" | "create" }
    ) => void;
  };
  toolState: {
    setTool: (tool: CanvasToolName) => void;
  };
  workbench: {
    activeWorkbenchId: string | null;
  };
}

export interface CanvasToolController {
  onPointerDown: (
    context: CanvasToolActionPort,
    payload: CanvasToolPointerPayload
  ) => void;
  onPointerMove?: (
    context: CanvasToolActionPort,
    payload: Pick<CanvasToolPointerPayload, "canvasPoint" | "screenPoint">
  ) => void;
  onPointerUp?: (
    context: CanvasToolActionPort,
    payload: Pick<CanvasToolPointerPayload, "canvasPoint" | "screenPoint">
  ) => void;
}

const selectToolController: CanvasToolController = {
  onPointerDown: (context, payload) => {
    if (!payload.isBackgroundTarget || !payload.canvasPoint || !payload.screenPoint) {
      return;
    }
    context.marquee.beginSelection({
      additive: payload.additive,
      canvasPoint: payload.canvasPoint,
      screenPoint: payload.screenPoint,
    });
  },
  onPointerMove: (context, payload) => {
    if (!payload.canvasPoint || !payload.screenPoint) {
      return;
    }
    context.marquee.updateSelection({
      canvasPoint: payload.canvasPoint,
      screenPoint: payload.screenPoint,
    });
  },
  onPointerUp: (context, payload) => {
    context.marquee.commitSelection(payload);
  },
};

const handToolController: CanvasToolController = {
  onPointerDown: (context, payload) => {
    if (!payload.isBackgroundTarget || !payload.screenPoint) {
      return;
    }
    context.pan.begin(payload.screenPoint);
  },
  onPointerMove: (context, payload) => {
    if (!payload.screenPoint) {
      return;
    }
    context.pan.update(payload.screenPoint);
  },
  onPointerUp: (context) => {
    context.pan.end();
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
    context.selection.clear();
    context.toolState.setTool("select");
    context.text.beginEdit(textElement, { mode: "create" });
  },
};

const shapeToolController: CanvasToolController = {
  onPointerDown: (context, payload) => {
    if (
      !payload.isBackgroundTarget ||
      !payload.canvasPoint ||
      !context.workbench.activeWorkbenchId
    ) {
      return;
    }

    const snappedPoint = snapPoint(payload.canvasPoint);
    const nextShape = createDefaultShapeNode({
      shapeType: context.shape.activeShapeType,
      x: snappedPoint.x,
      y: snappedPoint.y,
    });

    context.selection.clear();
    context.shape.insert(nextShape);
    context.selection.select(nextShape.id);
    context.toolState.setTool("select");
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
