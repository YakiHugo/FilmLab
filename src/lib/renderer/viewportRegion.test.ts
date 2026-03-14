import { describe, expect, it } from "vitest";
import { resolveViewportRenderRegion } from "./viewportRegion";

describe("resolveViewportRenderRegion", () => {
  it("converts a normalized ROI into clamped pixel coordinates", () => {
    expect(
      resolveViewportRenderRegion(1200, 800, {
        x: 0.125,
        y: 0.25,
        width: 0.5,
        height: 0.5,
      })
    ).toEqual({
      x: 150,
      y: 200,
      width: 600,
      height: 400,
    });
  });

  it("returns null for full-frame or invalid regions", () => {
    expect(
      resolveViewportRenderRegion(1200, 800, {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      })
    ).toBeNull();

    expect(
      resolveViewportRenderRegion(1200, 800, {
        x: 0.8,
        y: 0.5,
        width: 0,
        height: 0.2,
      })
    ).toBeNull();
  });
});
