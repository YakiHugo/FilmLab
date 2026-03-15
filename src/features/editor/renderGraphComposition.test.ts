import { createDefaultAdjustments } from "@/lib/adjustments";
import { describe, expect, it, vi } from "vitest";
import { composeRenderGraphToCanvas } from "./renderGraphComposition";
import type { RenderGraph } from "./renderGraph";

const maskCanvas = { id: "mask-canvas" } as unknown as HTMLCanvasElement;
const maskedCanvas = { id: "masked-canvas" } as unknown as HTMLCanvasElement;

vi.mock("@/lib/layerMaskTexture", () => ({
  generateMaskTexture: vi.fn(() => maskCanvas),
  applyMaskToLayerCanvas: vi.fn(() => maskedCanvas),
}));

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

const createRenderGraph = (): RenderGraph => ({
  key: "graph-1",
  documentKey: "editor:asset-a",
  phases: ["develop", "film", "fx", "output"] as const,
  sourceAsset: {
    id: "asset-a",
    name: "asset-a.jpg",
    type: "image/jpeg",
    size: 1,
    createdAt: "2026-03-15T00:00:00.000Z",
    objectUrl: "blob:asset-a",
  },
  sourceAssetId: "asset-a",
  showOriginal: false,
  layers: [
    {
      id: "top",
      key: "layer-top",
      layer: {
        id: "top",
        name: "Top",
        type: "adjustment",
        visible: true,
        opacity: 100,
        blendMode: "screen",
      },
      sourceAsset: {
        id: "asset-a",
        name: "asset-a.jpg",
        type: "image/jpeg",
        size: 1,
        createdAt: "2026-03-15T00:00:00.000Z",
        objectUrl: "blob:asset-a",
      },
      sourceAssetId: "asset-a",
      opacity: 0.75,
      blendMode: "screen",
      adjustments: createDefaultAdjustments(),
      mask: undefined,
      scopedLocalAdjustments: [],
      phaseKeys: {
        develop: "develop-top",
        film: "film-top",
        fx: "fx-top",
        output: "output-top",
      },
    },
    {
      id: "bottom",
      key: "layer-bottom",
      layer: {
        id: "bottom",
        name: "Bottom",
        type: "base",
        visible: true,
        opacity: 100,
        blendMode: "normal",
      },
      sourceAsset: {
        id: "asset-a",
        name: "asset-a.jpg",
        type: "image/jpeg",
        size: 1,
        createdAt: "2026-03-15T00:00:00.000Z",
        objectUrl: "blob:asset-a",
      },
      sourceAssetId: "asset-a",
      opacity: 1,
      blendMode: "normal",
      adjustments: createDefaultAdjustments(),
      mask: undefined,
      scopedLocalAdjustments: [],
      phaseKeys: {
        develop: "develop-bottom",
        film: "film-bottom",
        fx: "fx-bottom",
        output: "output-bottom",
      },
    },
  ],
});

describe("renderGraphComposition", () => {
  it("composites render graph layers from bottom to top", async () => {
    const targetCanvas = createFakeCanvas(800, 600);
    const topCanvas = { id: "top-canvas", width: 800, height: 600 } as HTMLCanvasElement;
    const bottomCanvas = { id: "bottom-canvas", width: 800, height: 600 } as HTMLCanvasElement;
    const renderGraph = createRenderGraph();

    const didCompose = await composeRenderGraphToCanvas({
      targetCanvas,
      renderGraph,
      workspace: {
        getLayerCanvas: (layerId) => (layerId === "top" ? topCanvas : bottomCanvas),
        getLayerMaskCanvas: () => maskCanvas,
        getLayerMaskScratchCanvas: () => maskCanvas,
        getMaskedLayerCanvas: () => maskedCanvas,
      },
      targetSize: {
        width: 800,
        height: 600,
      },
      renderLayerNode: async () => undefined,
    });

    expect(didCompose).toBe(true);
    expect(fakeContext.drawImageCalls).toEqual([
      [bottomCanvas, 0, 0, 800, 600],
      [topCanvas, 0, 0, 800, 600],
    ]);
  });

  it("uses masked layer output when a layer mask is present", async () => {
    const targetCanvas = createFakeCanvas(800, 600);
    const renderGraph = {
      ...createRenderGraph(),
      layers: [
        {
          ...createRenderGraph().layers[0]!,
          mask: {
            mode: "radial" as const,
            inverted: false,
            data: {
              mode: "radial" as const,
              centerX: 0.5,
              centerY: 0.5,
              radiusX: 0.25,
              radiusY: 0.25,
              feather: 0.4,
            },
          },
        },
      ],
    };

    const didCompose = await composeRenderGraphToCanvas({
      targetCanvas,
      renderGraph,
      workspace: {
        getLayerCanvas: () =>
          ({ id: "layer-canvas", width: 800, height: 600 } as HTMLCanvasElement),
        getLayerMaskCanvas: () => maskCanvas,
        getLayerMaskScratchCanvas: () => maskCanvas,
        getMaskedLayerCanvas: () => maskedCanvas,
      },
      targetSize: {
        width: 800,
        height: 600,
      },
      renderLayerNode: async () => undefined,
    });

    expect(didCompose).toBe(true);
    expect(fakeContext.drawImageCalls).toEqual([[maskedCanvas, 0, 0, 800, 600]]);
  });
});
