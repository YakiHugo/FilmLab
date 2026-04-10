import type { CanvasShapeElement, CanvasShapeFillStyle } from "@/types";

export type CanvasShapeFillPaint =
  | {
      kind: "solid";
      color: string;
    }
  | {
      kind: "linear-gradient";
      colorStops: [number, string, number, string];
      endPoint: {
        x: number;
        y: number;
      };
      startPoint: {
        x: number;
        y: number;
      };
    };

export const resolveCanvasShapeEffectiveFillStyle = ({
  fill,
  fillStyle,
}: Pick<CanvasShapeElement, "fill" | "fillStyle">): CanvasShapeFillStyle =>
  fillStyle?.kind === "linear-gradient"
    ? fillStyle
    : {
        kind: "solid",
        color: fillStyle?.kind === "solid" ? fillStyle.color : fill,
      };

export const resolveCanvasShapeSolidFillColor = ({
  fill,
  fillStyle,
}: Pick<CanvasShapeElement, "fill" | "fillStyle">) => {
  const effectiveFillStyle = resolveCanvasShapeEffectiveFillStyle({
    fill,
    fillStyle,
  });
  return effectiveFillStyle.kind === "solid"
    ? effectiveFillStyle.color
    : effectiveFillStyle.from;
};

export const resolveCanvasShapeFillPaint = ({
  fill,
  fillStyle,
  height,
  width,
}: Pick<CanvasShapeElement, "fill" | "fillStyle"> & {
  height: number;
  width: number;
}): CanvasShapeFillPaint => {
  const effectiveFillStyle = resolveCanvasShapeEffectiveFillStyle({
    fill,
    fillStyle,
  });

  if (effectiveFillStyle.kind === "solid") {
    return {
      kind: "solid",
      color: effectiveFillStyle.color,
    };
  }

  const angleInRadians = (effectiveFillStyle.angle * Math.PI) / 180;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(Math.hypot(width, height) / 2, 1);
  const directionX = Math.cos(angleInRadians);
  const directionY = Math.sin(angleInRadians);

  return {
    kind: "linear-gradient",
    colorStops: [0, effectiveFillStyle.from, 1, effectiveFillStyle.to],
    startPoint: {
      x: centerX - directionX * radius,
      y: centerY - directionY * radius,
    },
    endPoint: {
      x: centerX + directionX * radius,
      y: centerY + directionY * radius,
    },
  };
};

export const translateCanvasShapeFillPaint = (
  fillPaint: CanvasShapeFillPaint,
  offset: { x: number; y: number }
): CanvasShapeFillPaint =>
  fillPaint.kind === "solid"
    ? fillPaint
    : {
        ...fillPaint,
        startPoint: {
          x: fillPaint.startPoint.x + offset.x,
          y: fillPaint.startPoint.y + offset.y,
        },
        endPoint: {
          x: fillPaint.endPoint.x + offset.x,
          y: fillPaint.endPoint.y + offset.y,
        },
      };
