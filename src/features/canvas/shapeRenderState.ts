import type { CanvasShapeElement, CanvasShapePoint } from "@/types";

export const CANVAS_SHAPE_BODY_NODE_NAME = "canvas-shape-body";

export const flattenCanvasShapePoints = (points: CanvasShapePoint[]) =>
  points.flatMap((point) => [point.x, point.y]);

export const resolveCanvasShapeFlatPoints = ({
  height,
  points,
  width,
}: Pick<CanvasShapeElement, "height" | "points" | "width">) =>
  flattenCanvasShapePoints(
    points && points.length > 0
      ? points
      : [
          { x: 0, y: height / 2 },
          { x: width, y: height / 2 },
        ]
  );

export const resolveCanvasRectShapeAttrs = ({
  fill,
  height,
  radius,
  stroke,
  strokeWidth,
  width,
}: Pick<CanvasShapeElement, "fill" | "height" | "radius" | "stroke" | "strokeWidth" | "width">) => ({
  width,
  height,
  fill,
  stroke,
  strokeWidth,
  cornerRadius: radius ?? 0,
});

export const resolveCanvasEllipseShapeAttrs = ({
  fill,
  height,
  stroke,
  strokeWidth,
  width,
}: Pick<CanvasShapeElement, "fill" | "height" | "stroke" | "strokeWidth" | "width">) => ({
  x: width / 2,
  y: height / 2,
  radiusX: width / 2,
  radiusY: height / 2,
  fill,
  stroke,
  strokeWidth,
});

export const resolveCanvasLineShapeAttrs = ({
  height,
  points,
  stroke,
  strokeWidth,
  width,
}: Pick<CanvasShapeElement, "height" | "points" | "stroke" | "strokeWidth" | "width">) => ({
  points: resolveCanvasShapeFlatPoints({ height, points, width }),
  stroke,
  strokeWidth,
  lineCap: "round" as const,
  lineJoin: "round" as const,
});

export const resolveCanvasArrowShapeAttrs = ({
  arrowHead,
  height,
  points,
  stroke,
  strokeWidth,
  width,
}: Pick<
  CanvasShapeElement,
  "arrowHead" | "height" | "points" | "stroke" | "strokeWidth" | "width"
>) => ({
  points: resolveCanvasShapeFlatPoints({ height, points, width }),
  stroke,
  fill: stroke,
  strokeWidth,
  lineCap: "round" as const,
  lineJoin: "round" as const,
  pointerAtBeginning: Boolean(arrowHead?.start),
  pointerAtEnding: arrowHead?.end ?? true,
});
