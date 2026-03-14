import { describe, expect, it } from "vitest";
import { calculatePreviewViewportRoi } from "./viewportRoi";

describe("calculatePreviewViewportRoi", () => {
  it("returns null when the viewport is effectively fit-to-screen", () => {
    expect(
      calculatePreviewViewportRoi({
        frameSize: { width: 1200, height: 800 },
        viewScale: 1,
        viewOffset: { x: 0, y: 0 },
      })
    ).toBeNull();
  });

  it("returns a normalized ROI when zoomed and panned", () => {
    const roi = calculatePreviewViewportRoi({
      frameSize: { width: 1000, height: 500 },
      viewScale: 2,
      viewOffset: { x: 100, y: -50 },
    });

    expect(roi).not.toBeNull();
    expect(roi?.x).toBeCloseTo(0.2, 6);
    expect(roi?.y).toBeCloseTo(0.3, 6);
    expect(roi?.width).toBeCloseTo(0.5, 6);
    expect(roi?.height).toBeCloseTo(0.5, 6);
  });

  it("collapses near-full-frame visible regions back to null", () => {
    expect(
      calculatePreviewViewportRoi({
        frameSize: { width: 1600, height: 900 },
        viewScale: 1.04,
        viewOffset: { x: 0, y: 0 },
      })
    ).toBeNull();
  });
});
