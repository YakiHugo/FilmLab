import { describe, expect, it } from "vitest";
import {
  resolveCanvasEllipseShapeAttrs,
  resolveCanvasRectShapeAttrs,
} from "./shapeRenderState";
import { resolveCanvasShapeFillPaint } from "./shapeStyle";

describe("shapeRenderState", () => {
  it("resolves a linear gradient paint for rectangular shapes", () => {
    const fillPaint = resolveCanvasShapeFillPaint({
      fill: "#ff0066",
      fillStyle: {
        kind: "linear-gradient",
        angle: 0,
        from: "#ff0066",
        to: "#1e90ff",
      },
      height: 120,
      width: 240,
    });

    expect(fillPaint).toMatchObject({
      kind: "linear-gradient",
      colorStops: [0, "#ff0066", 1, "#1e90ff"],
    });
  });

  it("maps gradient fills into Konva rect and ellipse attrs with the correct local origin", () => {
    const width = 240;
    const height = 120;
    const gradientRadius = Math.hypot(width, height) / 2;
    const rectAttrs = resolveCanvasRectShapeAttrs({
      fill: "#ff0066",
      fillStyle: {
        kind: "linear-gradient",
        angle: 0,
        from: "#ff0066",
        to: "#1e90ff",
      },
      height,
      radius: 12,
      stroke: "#111111",
      strokeWidth: 2,
      width,
    });
    const ellipseAttrs = resolveCanvasEllipseShapeAttrs({
      fill: "#ff0066",
      fillStyle: {
        kind: "linear-gradient",
        angle: 0,
        from: "#ff0066",
        to: "#1e90ff",
      },
      height,
      stroke: "#111111",
      strokeWidth: 2,
      width,
    });

    expect(rectAttrs).toMatchObject({
      fillLinearGradientColorStops: [0, "#ff0066", 1, "#1e90ff"],
      stroke: "#111111",
      strokeWidth: 2,
    });
    expect(ellipseAttrs).toMatchObject({
      fillLinearGradientColorStops: [0, "#ff0066", 1, "#1e90ff"],
      stroke: "#111111",
      strokeWidth: 2,
    });
    expect(rectAttrs.fillLinearGradientStartPoint?.x).toBeCloseTo(width / 2 - gradientRadius);
    expect(rectAttrs.fillLinearGradientStartPoint?.y).toBeCloseTo(height / 2);
    expect(rectAttrs.fillLinearGradientEndPoint?.x).toBeCloseTo(width / 2 + gradientRadius);
    expect(rectAttrs.fillLinearGradientEndPoint?.y).toBeCloseTo(height / 2);
    expect(ellipseAttrs.fillLinearGradientStartPoint?.x).toBeCloseTo(-gradientRadius);
    expect(ellipseAttrs.fillLinearGradientStartPoint?.y).toBeCloseTo(0);
    expect(ellipseAttrs.fillLinearGradientEndPoint?.x).toBeCloseTo(gradientRadius);
    expect(ellipseAttrs.fillLinearGradientEndPoint?.y).toBeCloseTo(0);
  });
});
