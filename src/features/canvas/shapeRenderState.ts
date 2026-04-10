import type { CanvasShapeElement, CanvasShapePoint } from "@/types";
import {
  resolveCanvasShapeFillPaint,
  translateCanvasShapeFillPaint,
} from "./shapeStyle";

export const CANVAS_SHAPE_BODY_NODE_NAME = "canvas-shape-body";

export const flattenCanvasShapePoints = (points: CanvasShapePoint[]) =>
  points.flatMap((point) => [point.x, point.y]);

type CanvasShapeStyleFields = Pick<
  CanvasShapeElement,
  "fill" | "fillStyle" | "stroke" | "strokeWidth" | "radius" | "points" | "arrowHead"
>;

type CanvasShapeDimensionFields = { width: number; height: number };

export const resolveCanvasShapeKonvaFillAttrs = ({
  fill,
  fillStyle,
  fillPaintOffset,
  height,
  width,
}: Pick<CanvasShapeStyleFields, "fill" | "fillStyle"> &
  CanvasShapeDimensionFields & {
    fillPaintOffset?: { x: number; y: number };
  }) => {
  const baseFillPaint = resolveCanvasShapeFillPaint({
    fill,
    fillStyle,
    height,
    width,
  });
  const fillPaint = fillPaintOffset
    ? translateCanvasShapeFillPaint(baseFillPaint, fillPaintOffset)
    : baseFillPaint;

  if (fillPaint.kind === "solid") {
    return {
      fill: fillPaint.color,
      fillLinearGradientStartPoint: undefined,
      fillLinearGradientEndPoint: undefined,
      fillLinearGradientColorStops: undefined,
    };
  }

  return {
    fill: undefined,
    fillLinearGradientStartPoint: fillPaint.startPoint,
    fillLinearGradientEndPoint: fillPaint.endPoint,
    fillLinearGradientColorStops: fillPaint.colorStops,
  };
};

export const resolveCanvasShapeFlatPoints = ({
  height,
  points,
  width,
}: CanvasShapeDimensionFields & Pick<CanvasShapeStyleFields, "points">) =>
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
  fillStyle,
  height,
  radius,
  stroke,
  strokeWidth,
  width,
}: CanvasShapeDimensionFields &
  Pick<CanvasShapeStyleFields, "fill" | "fillStyle" | "radius" | "stroke" | "strokeWidth">) => ({
  width,
  height,
  ...resolveCanvasShapeKonvaFillAttrs({
    fill,
    fillStyle,
    height,
    width,
  }),
  stroke,
  strokeWidth,
  cornerRadius: radius ?? 0,
});

export const resolveCanvasEllipseShapeAttrs = ({
  fill,
  fillStyle,
  height,
  stroke,
  strokeWidth,
  width,
}: CanvasShapeDimensionFields &
  Pick<CanvasShapeStyleFields, "fill" | "fillStyle" | "stroke" | "strokeWidth">) => ({
  x: width / 2,
  y: height / 2,
  radiusX: width / 2,
  radiusY: height / 2,
  ...resolveCanvasShapeKonvaFillAttrs({
    fill,
    fillStyle,
    fillPaintOffset: {
      x: -width / 2,
      y: -height / 2,
    },
    height,
    width,
  }),
  stroke,
  strokeWidth,
});

export const resolveCanvasLineShapeAttrs = ({
  height,
  points,
  stroke,
  strokeWidth,
  width,
}: CanvasShapeDimensionFields &
  Pick<CanvasShapeStyleFields, "points" | "stroke" | "strokeWidth">) => ({
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
}: CanvasShapeDimensionFields &
  Pick<CanvasShapeStyleFields, "arrowHead" | "points" | "stroke" | "strokeWidth">) => ({
  points: resolveCanvasShapeFlatPoints({ height, points, width }),
  stroke,
  fill: stroke,
  strokeWidth,
  lineCap: "round" as const,
  lineJoin: "round" as const,
  pointerAtBeginning: Boolean(arrowHead?.start),
  pointerAtEnding: arrowHead?.end ?? true,
});
