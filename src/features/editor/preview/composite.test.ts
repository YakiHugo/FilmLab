import { describe, expect, it } from "vitest";
import {
  compositeRetainedPreviewLayers,
  copyPreviewCanvas,
  resolvePreviewLayerBlendOperation,
} from "./composite";

interface FakeCanvasContext {
  clearRectCalls: Array<[number, number, number, number]>;
  drawImageCalls: unknown[][];
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
  save: () => void;
  restore: () => void;
  clearRect: (x: number, y: number, width: number, height: number) => void;
  drawImage: (...args: unknown[]) => void;
}

const createFakeCanvasContext = (): FakeCanvasContext => ({
  clearRectCalls: [],
  drawImageCalls: [],
  globalAlpha: 1,
  globalCompositeOperation: "source-over",
  save: () => undefined,
  restore: () => undefined,
  clearRect: (x, y, width, height) => {
    fakeContext.clearRectCalls.push([x, y, width, height]);
  },
  drawImage: (...args) => {
    fakeContext.drawImageCalls.push(args);
  },
});

let fakeContext: FakeCanvasContext;

const createFakeCanvas = (width: number, height: number) => {
  fakeContext = createFakeCanvasContext();
  return {
    width,
    height,
    getContext: () => fakeContext,
  } as unknown as HTMLCanvasElement;
};

describe("preview composite utilities", () => {
  it("resolves blend modes for retained layer composition", () => {
    expect(resolvePreviewLayerBlendOperation("softLight")).toBe("soft-light");
    expect(resolvePreviewLayerBlendOperation("normal")).toBe("source-over");
  });

  it("copies the full staged preview canvas into the visible canvas", () => {
    const targetCanvas = createFakeCanvas(1, 1);
    const sourceCanvas = {
      width: 640,
      height: 360,
    } as HTMLCanvasElement;

    expect(copyPreviewCanvas(targetCanvas, sourceCanvas)).toBe(true);
    expect(targetCanvas.width).toBe(640);
    expect(targetCanvas.height).toBe(360);
    expect(fakeContext.clearRectCalls).toEqual([[0, 0, 640, 360]]);
    expect(fakeContext.drawImageCalls).toEqual([[sourceCanvas, 0, 0, 640, 360]]);
  });

  it("recomposites only the dirty ROI into a retained full-frame preview canvas", () => {
    const targetCanvas = createFakeCanvas(800, 600);
    const layerCanvas = { id: "layer-1" } as unknown as CanvasImageSource;

    expect(
      compositeRetainedPreviewLayers({
        targetCanvas,
        layerSurfaces: [
          {
            drawSource: layerCanvas,
            opacity: 0.5,
            blendMode: "screen",
          },
        ],
        region: {
          x: 120,
          y: 80,
          width: 300,
          height: 200,
        },
      })
    ).toBe(true);

    expect(fakeContext.clearRectCalls).toEqual([[120, 80, 300, 200]]);
    expect(fakeContext.globalAlpha).toBe(1);
    expect(fakeContext.globalCompositeOperation).toBe("source-over");
    expect(fakeContext.drawImageCalls).toEqual([
      [layerCanvas, 120, 80, 300, 200, 120, 80, 300, 200],
    ]);
  });
});
