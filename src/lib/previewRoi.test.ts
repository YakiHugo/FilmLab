import { describe, expect, it } from "vitest";
import { resolvePreviewRoiFromViewport, transformLocalAdjustmentMaskForPreviewRoi } from "./previewRoi";

describe("previewRoi", () => {
  it("resolves a centered ROI for zoomed previews", () => {
    const roi = resolvePreviewRoiFromViewport({
      frameWidth: 1200,
      frameHeight: 800,
      viewScale: 2,
      viewOffset: { x: 0, y: 0 },
    });

    expect(roi).toMatchObject({
      centerX: 0.5,
      centerY: 0.5,
      width: 0.5,
      height: 0.5,
      left: 0.25,
      top: 0.25,
      right: 0.75,
      bottom: 0.75,
    });
  });

  it("shifts ROI center opposite the pan offset", () => {
    const roi = resolvePreviewRoiFromViewport({
      frameWidth: 400,
      frameHeight: 400,
      viewScale: 2,
      viewOffset: { x: 100, y: -80 },
    });

    expect(roi?.centerX).toBeCloseTo(0.375);
    expect(roi?.centerY).toBeCloseTo(0.6);
  });

  it("transforms brush masks into ROI-relative space", () => {
    const transformed = transformLocalAdjustmentMaskForPreviewRoi(
      {
        mode: "brush",
        points: [
          { x: 0.25, y: 0.25, pressure: 1 },
          { x: 0.5, y: 0.5, pressure: 0.8 },
        ],
        brushSize: 0.1,
        feather: 0.2,
        flow: 0.75,
      },
      {
        centerX: 0.5,
        centerY: 0.5,
        zoom: 2,
        width: 0.5,
        height: 0.5,
        left: 0.25,
        top: 0.25,
        right: 0.75,
        bottom: 0.75,
      }
    );

    expect(transformed.mode).toBe("brush");
    if (transformed.mode !== "brush") {
      throw new Error("Expected brush mask");
    }
    expect(transformed.points[0]).toMatchObject({ x: 0, y: 0 });
    expect(transformed.points[1]).toMatchObject({ x: 0.5, y: 0.5 });
    expect(transformed.brushSize).toBeCloseTo(0.2);
  });
});
