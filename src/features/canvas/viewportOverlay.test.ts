import { describe, expect, it } from "vitest";
import { fitCanvasTextElementToContent } from "./textStyle";
import type { CanvasTextEditorModel, CanvasTextOverlayModel } from "./textRuntimeViewModel";
import type { CanvasSelectionOverlayMetrics } from "./viewportOverlay";
import {
  getTextEditorLayout,
  resolveSelectionOverlayMetrics,
  selectionOverlayEqual,
} from "./viewportOverlay";

const createTextEditorModel = (): CanvasTextEditorModel => ({
  id: "text-1",
  content: "Hello",
  fontFamily: "Georgia",
  fontSize: 24,
  fontSizeTier: "small" as const,
  color: "#ffffff",
  textAlign: "left" as const,
  x: 40,
  y: 60,
  rotation: 15,
});

const createTextOverlayModel = (): CanvasTextOverlayModel => ({
  content: "Hello",
  fontFamily: "Georgia",
  fontSize: 24,
  id: "text-1",
  rotation: 15,
  x: 40,
  y: 60,
});

describe("viewport overlay helpers", () => {
  it("keeps overlay metrics stable when rect deltas stay under half a pixel", () => {
    const base: CanvasSelectionOverlayMetrics = {
      rect: {
        x: 100,
        y: 200,
        width: 300,
        height: 120,
      },
      textMatrix: "matrix(1, 0, 0, 1, 10, 20)",
    };

    expect(
      selectionOverlayEqual(base, {
        rect: {
          x: 100.49,
          y: 199.75,
          width: 300.1,
          height: 120.49,
        },
        textMatrix: "matrix(1, 0, 0, 1, 10, 20)",
      })
    ).toBe(true);

    expect(
      selectionOverlayEqual(base, {
        rect: {
          x: 100.6,
          y: 200,
          width: 300,
          height: 120,
        },
        textMatrix: "matrix(1, 0, 0, 1, 10, 20)",
      })
    ).toBe(false);
  });

  it("uses the provided transform matrix when one exists", () => {
    expect(
      getTextEditorLayout({
        element: createTextEditorModel(),
        transform: "matrix(1, 0, 0, 1, 15, 25)",
        viewport: { x: 300, y: 400 },
        zoom: 2,
      })
    ).toMatchObject({
      left: 0,
      top: 0,
      transform: "matrix(1, 0, 0, 1, 15, 25)",
      transformOrigin: "top left",
    });
  });

  it("falls back to the draft text rect when no node rect exists", () => {
    expect(
      resolveSelectionOverlayMetrics({
        textOverlayModel: createTextOverlayModel(),
        textMatrix: "matrix(1, 0, 0, 1, 15, 25)",
        viewport: { x: 120, y: 80 },
        zoom: 1.5,
        nodeRect: null,
      })
    ).toEqual({
      rect: {
        x: 180,
        y: 170,
        width: 111,
        height: 43.5,
      },
      textMatrix: null,
    });
  });

  it("prefers the node rect when both node and draft text data exist", () => {
    expect(
      resolveSelectionOverlayMetrics({
        textOverlayModel: createTextOverlayModel(),
        textMatrix: "matrix(1, 0, 0, 1, 15, 25)",
        viewport: { x: 120, y: 80 },
        zoom: 1.5,
        nodeRect: {
          x: 10,
          y: 20,
          width: 30,
          height: 40,
        },
      })
    ).toEqual({
      rect: {
        x: 10,
        y: 20,
        width: 30,
        height: 40,
      },
      textMatrix: "matrix(1, 0, 0, 1, 15, 25)",
    });
  });

  it("returns null when neither node nor draft text metrics exist", () => {
    expect(
      resolveSelectionOverlayMetrics({
        textOverlayModel: null,
        textMatrix: null,
        viewport: { x: 120, y: 80 },
        zoom: 1.5,
        nodeRect: null,
      })
    ).toBeNull();
  });

  it("falls back to viewport, zoom, and rotation when no matrix exists", () => {
    expect(
      getTextEditorLayout({
        element: createTextEditorModel(),
        transform: null,
        viewport: { x: 120, y: 80 },
        zoom: 1.5,
      })
    ).toMatchObject({
      left: 0,
      top: 0,
      transform: "translate(180px, 170px) scale(1.5) rotate(15deg)",
      transformOrigin: "top left",
    });
  });

  it("keeps empty editing text wide enough to show the placeholder", () => {
    const element = {
      ...createTextEditorModel(),
      content: "",
    };
    const fitted = fitCanvasTextElementToContent({
      ...element,
      type: "text",
      parentId: null,
      width: 1,
      height: 1,
      transform: {
        x: element.x,
        y: element.y,
        width: 1,
        height: 1,
        rotation: element.rotation,
      },
      opacity: 1,
      locked: false,
      visible: true,
    });
    const layout = getTextEditorLayout({
      element,
      transform: null,
      viewport: { x: 120, y: 80 },
      zoom: 1.5,
    });
    const overlay = resolveSelectionOverlayMetrics({
      textOverlayModel: {
        ...element,
      },
      textMatrix: null,
      viewport: { x: 120, y: 80 },
      zoom: 1.5,
      nodeRect: null,
    });

    expect(layout.width).toBeGreaterThan(fitted.transform.width);
    expect(overlay?.rect.width).toBeGreaterThan(fitted.transform.width * 1.5);
  });
});
