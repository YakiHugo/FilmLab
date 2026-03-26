import type Konva from "konva";
import type { CanvasRenderableElement } from "@/types";
import type { CanvasResizePreview } from "./resizeGeometry";
import {
  CANVAS_SHAPE_BODY_NODE_NAME,
  resolveCanvasArrowShapeAttrs,
  resolveCanvasEllipseShapeAttrs,
  resolveCanvasLineShapeAttrs,
  resolveCanvasRectShapeAttrs,
} from "./shapeRenderState";

export type CanvasResizeMutableNode = Konva.Node & {
  findOne?: <T extends Konva.Node>(selector: string) => T | null;
  fontSize?: (value?: number) => number;
  height?: (value?: number) => number;
  position: (value?: { x: number; y: number }) => { x: number; y: number };
  scaleX: (value?: number) => number;
  scaleY: (value?: number) => number;
  width?: (value?: number) => number;
  x: (value?: number) => number;
  y: (value?: number) => number;
};

const applyPreviewToRectLikeNode = (
  node: CanvasResizeMutableNode,
  preview: Pick<CanvasResizePreview, "height" | "width" | "x" | "y">
) => {
  node.position({ x: preview.x, y: preview.y });
  node.scaleX(1);
  node.scaleY(1);
  node.width?.(preview.width);
  node.height?.(preview.height);
};

const applyPreviewToShapeNode = ({
  element,
  node,
  preview,
}: {
  element: Extract<CanvasRenderableElement, { type: "shape" }>;
  node: CanvasResizeMutableNode;
  preview: CanvasResizePreview;
}) => {
  node.position({ x: preview.x, y: preview.y });
  node.scaleX(1);
  node.scaleY(1);

  const child = node.findOne?.<CanvasResizeMutableNode>(`.${CANVAS_SHAPE_BODY_NODE_NAME}`);
  if (!child) {
    return;
  }

  const previewElement = {
    ...element,
    width: preview.width,
    height: preview.height,
    points: preview.points ?? element.points,
    radius: preview.radius ?? element.radius,
    strokeWidth: preview.strokeWidth ?? element.strokeWidth,
  };

  if (element.shapeType === "rect") {
    child.setAttrs(resolveCanvasRectShapeAttrs(previewElement));
    return;
  }

  if (element.shapeType === "ellipse") {
    child.setAttrs(resolveCanvasEllipseShapeAttrs(previewElement));
    return;
  }

  if (element.shapeType === "line") {
    child.setAttrs(resolveCanvasLineShapeAttrs(previewElement));
    return;
  }

  child.setAttrs(resolveCanvasArrowShapeAttrs(previewElement));
};

export const applyCanvasResizePreviewToNode = ({
  element,
  node,
  preview,
}: {
  element: CanvasRenderableElement;
  node: CanvasResizeMutableNode;
  preview: CanvasResizePreview;
}) => {
  if (element.type === "image") {
    applyPreviewToRectLikeNode(node, preview);
    return;
  }

  if (element.type === "text") {
    applyPreviewToRectLikeNode(node, preview);
    if (typeof preview.fontSize === "number") {
      node.fontSize?.(preview.fontSize);
    }
    return;
  }

  applyPreviewToShapeNode({ element, node, preview });
};
