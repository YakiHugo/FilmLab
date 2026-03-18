import { describe, expect, it, vi } from "vitest";
import type Konva from "konva";
import { exportStageDataUrl } from "./useCanvasExport";

const createNode = (options: {
  fillPatternImage?: unknown;
  fill?: string;
  id?: string;
  visible?: boolean;
}) => {
  let visibleState = options.visible ?? true;
  return {
    id: vi.fn(() => options.id ?? ""),
    getAttr: vi.fn((name: string) => {
      if (name === "fillPatternImage") {
        return options.fillPatternImage;
      }
      if (name === "fill") {
        return options.fill;
      }
      return undefined;
    }),
    visible: vi.fn((next?: boolean) => {
      if (typeof next === "boolean") {
        visibleState = next;
      }
      return visibleState;
    }),
  };
};

describe("exportStageDataUrl", () => {
  it("hides editor grid overlay nodes from the preview snapshot and restores them afterward", () => {
    const gridNode = createNode({
      fillPatternImage: {},
      visible: true,
    });
    const backgroundNode = createNode({
      fillPatternImage: {},
      id: "canvas-background",
      visible: true,
    });
    const contentNode = createNode({
      fill: "#ffffff",
      visible: true,
    });
    const stage = {
      find: vi.fn((selector: string) => {
        if (selector === "Rect") {
          return [backgroundNode, gridNode, contentNode];
        }
        return [];
      }),
      toDataURL: vi.fn(() => "data:image/png;base64,preview"),
    } as unknown as Konva.Stage;

    const result = exportStageDataUrl(stage, {
      format: "png",
      width: 1280,
      height: 720,
      quality: 0.92,
      pixelRatio: 2,
      crop: {
        x: 10,
        y: 20,
        width: 300,
        height: 200,
      },
    });

    expect(result).toBe("data:image/png;base64,preview");
    expect(gridNode.visible).toHaveBeenCalledWith(false);
    expect(gridNode.visible).toHaveBeenCalledWith(true);
    expect(backgroundNode.visible).not.toHaveBeenCalledWith(false);
    expect(contentNode.visible).not.toHaveBeenCalledWith(false);
    expect(stage.toDataURL).toHaveBeenCalledWith({
      mimeType: "image/png",
      quality: 0.92,
      x: 10,
      y: 20,
      width: 1280,
      height: 720,
      pixelRatio: 2,
    });
  });

  it("does not hide unrelated rect nodes", () => {
    const contentNode = createNode({
      fill: "#ffffff",
      visible: true,
    });
    const stage = {
      find: vi.fn((selector: string) => {
        if (selector === "Rect") {
          return [contentNode];
        }
        return [];
      }),
      toDataURL: vi.fn(() => "data:image/jpeg;base64,preview"),
    } as unknown as Konva.Stage;

    const result = exportStageDataUrl(stage, {
      format: "jpeg",
      width: 640,
      height: 480,
      quality: 0.8,
      pixelRatio: 1,
    });

    expect(result).toBe("data:image/jpeg;base64,preview");
    expect(contentNode.visible).not.toHaveBeenCalledWith(false);
    expect(stage.toDataURL).toHaveBeenCalledWith({
      mimeType: "image/jpeg",
      quality: 0.8,
      x: undefined,
      y: undefined,
      width: 640,
      height: 480,
      pixelRatio: 1,
    });
  });
});
