import type { CanvasOverlayRect } from "./overlayGeometry";
import type { CanvasTextEditorModel, CanvasTextOverlayModel } from "./textRuntimeViewModel";
import { measureCanvasTextEditorSize } from "./textStyle";

export interface CanvasSelectionOverlayMetrics {
  rect: CanvasOverlayRect;
  textMatrix: string | null;
}

export interface CanvasTextEditorLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  transform: string;
  transformOrigin: "top left";
}

export interface CanvasInteractionNotice {
  type: "error" | "info";
  message: string;
}

export const selectionOverlayEqual = (
  left: CanvasSelectionOverlayMetrics | null,
  right: CanvasSelectionOverlayMetrics | null
) => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  return (
    left.textMatrix === right.textMatrix &&
    Math.abs(left.rect.x - right.rect.x) < 0.5 &&
    Math.abs(left.rect.y - right.rect.y) < 0.5 &&
    Math.abs(left.rect.width - right.rect.width) < 0.5 &&
    Math.abs(left.rect.height - right.rect.height) < 0.5
  );
};

export const overlayPositionEqual = (
  left: { left: number; top: number },
  right: { left: number; top: number }
) => Math.abs(left.left - right.left) < 0.5 && Math.abs(left.top - right.top) < 0.5;

export const getTextOverlayRect = (
  element: CanvasTextOverlayModel,
  viewport: { x: number; y: number },
  zoom: number
): CanvasOverlayRect => {
  const editingSize = measureCanvasTextEditorSize(element);

  return {
    x: element.x * zoom + viewport.x,
    y: element.y * zoom + viewport.y,
    width: Math.max(1, editingSize.width * zoom),
    height: Math.max(1, editingSize.height * zoom),
  };
};

export const resolveSelectionOverlayMetrics = ({
  textOverlayModel,
  textMatrix,
  viewport,
  zoom,
  nodeRect,
}: {
  textOverlayModel: CanvasTextOverlayModel | null;
  textMatrix: string | null;
  viewport: { x: number; y: number };
  zoom: number;
  nodeRect: CanvasOverlayRect | null;
}): CanvasSelectionOverlayMetrics | null => {
  if (nodeRect) {
    return {
      rect: nodeRect,
      textMatrix,
    };
  }

  if (!textOverlayModel) {
    return null;
  }

  return {
    rect: getTextOverlayRect(textOverlayModel, viewport, zoom),
    textMatrix: null,
  };
};

export const getTextEditorLayout = ({
  element,
  transform,
  viewport,
  zoom,
}: {
  element: CanvasTextEditorModel;
  transform: string | null;
  viewport: { x: number; y: number };
  zoom: number;
}): CanvasTextEditorLayout => {
  const editingSize = measureCanvasTextEditorSize(element);

  if (transform) {
    return {
      left: 0,
      top: 0,
      width: editingSize.width,
      height: editingSize.height,
      transform,
      transformOrigin: "top left",
    };
  }

  return {
    left: 0,
    top: 0,
    width: editingSize.width,
    height: editingSize.height,
    transform: `translate(${element.x * zoom + viewport.x}px, ${element.y * zoom + viewport.y}px) scale(${zoom}) rotate(${element.rotation}deg)`,
    transformOrigin: "top left",
  };
};
