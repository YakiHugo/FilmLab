import { describe, expect, it } from "vitest";
import {
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  resolveCanvasFitView,
  resolveCanvasPointFromScreen,
  resolveCanvasZoomStep,
  resolveViewportAfterZoom,
} from "./viewportNavigation";

const VIEWPORT_INSETS = {
  top: 88,
  right: 32,
  bottom: 104,
  left: 112,
};

describe("viewport navigation helpers", () => {
  it("centers the active workbench inside the usable stage bounds", () => {
    expect(
      resolveCanvasFitView({
        insets: VIEWPORT_INSETS,
        stageSize: {
          width: 1200,
          height: 900,
        },
        workbenchSize: {
          width: 800,
          height: 600,
        },
      })
    ).toEqual({
      zoom: 1,
      viewport: {
        x: 240,
        y: 142,
      },
    });
  });

  it("clamps fit-to-view zoom to the supported minimum", () => {
    expect(
      resolveCanvasFitView({
        insets: VIEWPORT_INSETS,
        stageSize: {
          width: 1200,
          height: 900,
        },
        workbenchSize: {
          width: 10_000,
          height: 8_000,
        },
      })
    ).toMatchObject({
      zoom: CANVAS_MIN_ZOOM,
    });
  });

  it("converts screen coordinates back into canvas space", () => {
    expect(
      resolveCanvasPointFromScreen({
        screenPoint: {
          x: 180,
          y: 170,
        },
        viewport: {
          x: 120,
          y: 80,
        },
        zoom: 1.5,
      })
    ).toEqual({
      x: 40,
      y: 60,
    });
  });

  it("preserves the pointer anchor when zooming", () => {
    const pointer = {
      x: 500,
      y: 300,
    };
    const viewport = {
      x: 100,
      y: 80,
    };
    const zoom = 2;
    const nextZoom = 4;
    const worldPointBeforeZoom = resolveCanvasPointFromScreen({
      screenPoint: pointer,
      viewport,
      zoom,
    });

    const nextViewport = resolveViewportAfterZoom({
      nextZoom,
      pointer,
      viewport,
      zoom,
    });

    expect(
      resolveCanvasPointFromScreen({
        screenPoint: pointer,
        viewport: nextViewport,
        zoom: nextZoom,
      })
    ).toEqual(worldPointBeforeZoom);
  });

  it("clamps toolbar zoom steps to the supported range", () => {
    expect(
      resolveCanvasZoomStep({
        direction: "in",
        zoom: 3.95,
      })
    ).toBe(CANVAS_MAX_ZOOM);

    expect(
      resolveCanvasZoomStep({
        direction: "out",
        zoom: 0.21,
      })
    ).toBe(CANVAS_MIN_ZOOM);
  });
});
