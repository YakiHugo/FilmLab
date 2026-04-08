import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type { Asset } from "@/types";
import { createCanvasCompositeLayerSurface } from "./compositeBackend";
import { createRenderDocument } from "./document";
import { renderDocumentToCanvas } from "./renderDocumentCanvas";

const renderSingleImageToCanvasMock = vi.fn();
const composeRenderGraphToCanvasMock = vi.fn();
const applyTimestampOverlayMock = vi.fn();

vi.mock("@/render/image", async () => {
  const actual = await vi.importActual<typeof import("@/render/image")>("@/render/image");
  return {
    ...actual,
    renderSingleImageToCanvas: (...args: unknown[]) => renderSingleImageToCanvasMock(...args),
  };
});

vi.mock("@/lib/timestampOverlay", () => ({
  applyTimestampOverlay: (...args: unknown[]) => applyTimestampOverlayMock(...args),
}));

vi.mock("./renderGraphComposition", async () => {
  const actual =
    await vi.importActual<typeof import("./renderGraphComposition")>("./renderGraphComposition");
  return {
    ...actual,
    composeRenderGraphToCanvas: (...args: unknown[]) => composeRenderGraphToCanvasMock(...args),
  };
});

const createAsset = (id: string): Asset => ({
  id,
  name: `${id}.jpg`,
  type: "image/jpeg" as const,
  size: 1024,
  createdAt: "2026-03-16T00:00:00.000Z",
  objectUrl: `blob:${id}`,
  adjustments: createDefaultAdjustments(),
  filmProfile: undefined,
  layers: [],
});

describe("renderDocumentToCanvas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => null),
      })),
    });
    renderSingleImageToCanvasMock.mockResolvedValue({ revisionKey: "revision-1" });
    composeRenderGraphToCanvasMock.mockResolvedValue(true);
  });

  it("routes multi-layer documents through the shared composite backend seam", async () => {
    const asset = createAsset("asset-a");
    const renderDocument = createRenderDocument({
      key: "editor:asset-a:export",
      assetById: new Map([[asset.id, asset]]),
      documentAsset: asset,
      layers: [
        {
          id: "top",
          name: "Top",
          type: "adjustment",
          visible: true,
          opacity: 75,
          blendMode: "screen",
          adjustments: createDefaultAdjustments(),
        },
        {
          id: "base",
          name: "Base",
          type: "base",
          visible: true,
          opacity: 100,
          blendMode: "normal",
          adjustments: createDefaultAdjustments(),
        },
      ],
      adjustments: createDefaultAdjustments(),
      filmProfile: undefined,
    });
    const canvas = globalThis.document.createElement("canvas");

    await renderDocumentToCanvas({
      canvas,
      document: renderDocument,
      intent: "export-full",
      targetSize: {
        width: 800,
        height: 600,
      },
      timestampText: "2026.03.28",
    });

    expect(composeRenderGraphToCanvasMock).toHaveBeenCalledTimes(1);
    expect(composeRenderGraphToCanvasMock.mock.calls[0]?.[0]).toMatchObject({
      targetCanvas: canvas,
      renderGraph: renderDocument.renderGraph,
      backend: {
        id: "canvas2d",
      },
      targetSize: {
        width: 800,
        height: 600,
      },
    });
    expect(renderSingleImageToCanvasMock).not.toHaveBeenCalled();
  });

  it("provides distinct layer surfaces to deferred multi-layer composition", async () => {
    const asset = createAsset("asset-a");
    const adjustments = createDefaultAdjustments();
    adjustments.timestampEnabled = true;
    adjustments.timestampPosition = "top-left";
    adjustments.timestampSize = 18;
    adjustments.timestampOpacity = 70;
    const renderDocument = createRenderDocument({
      key: "editor:asset-a:export",
      assetById: new Map([[asset.id, asset]]),
      documentAsset: asset,
      layers: [
        {
          id: "top",
          name: "Top",
          type: "adjustment",
          visible: true,
          opacity: 75,
          blendMode: "screen",
          adjustments: createDefaultAdjustments(),
        },
        {
          id: "base",
          name: "Base",
          type: "base",
          visible: true,
          opacity: 100,
          blendMode: "normal",
          adjustments: createDefaultAdjustments(),
        },
      ],
      adjustments,
      filmProfile: undefined,
    });
    const canvas = globalThis.document.createElement("canvas");
    const renderedLayerCanvases: HTMLCanvasElement[] = [];

    composeRenderGraphToCanvasMock.mockImplementationOnce(
      async ({
        renderGraph,
        workspace,
        targetSize,
        renderLayerNode,
      }: {
        renderGraph: typeof renderDocument.renderGraph;
        workspace: {
          getLayerSurface: (layerId: string) => ReturnType<typeof createCanvasCompositeLayerSurface>;
          getLayerRenderTarget: (layerId: string) => HTMLCanvasElement;
        };
        targetSize: {
          width: number;
          height: number;
        };
        renderLayerNode: (
          node: (typeof renderDocument.renderGraph.layers)[number],
          canvas: HTMLCanvasElement,
          layerIndex: number
        ) => Promise<void>;
      }) => {
        const layersBottomToTop = [...renderGraph.layers].reverse();
        for (let layerIndex = 0; layerIndex < layersBottomToTop.length; layerIndex += 1) {
          const layerNode = layersBottomToTop[layerIndex]!;
          const layerSurface = workspace.getLayerSurface(layerNode.id);
          const layerCanvas = workspace.getLayerRenderTarget(layerNode.id);
          layerCanvas.width = targetSize.width;
          layerCanvas.height = targetSize.height;
          layerSurface.width = targetSize.width;
          layerSurface.height = targetSize.height;
          renderedLayerCanvases.push(layerCanvas);
          await renderLayerNode(layerNode, layerCanvas, layerIndex);
        }
        return true;
      }
    );

    await renderDocumentToCanvas({
      canvas,
      document: renderDocument,
      intent: "export-full",
      targetSize: {
        width: 800,
        height: 600,
      },
      timestampText: "2026.03.28",
    });

    expect(renderedLayerCanvases).toHaveLength(2);
    expect(renderedLayerCanvases[0]).not.toBe(renderedLayerCanvases[1]);
    expect(renderSingleImageToCanvasMock).toHaveBeenCalledTimes(2);
    expect(renderSingleImageToCanvasMock.mock.calls[0]?.[0]).toMatchObject({
      canvas: renderedLayerCanvases[0],
      request: {
        intent: "export",
        quality: "full",
        targetSize: {
          width: 800,
          height: 600,
        },
        timestampText: null,
        strictErrors: true,
      },
    });
    expect(applyTimestampOverlayMock).toHaveBeenCalledTimes(1);
    expect(applyTimestampOverlayMock.mock.calls[0]?.[2]).toEqual("2026.03.28");
  });

  it("keeps single-layer documents on the direct render fast path", async () => {
    const asset = createAsset("asset-a");
    const renderDocument = createRenderDocument({
      key: "editor:asset-a:export",
      assetById: new Map([[asset.id, asset]]),
      documentAsset: asset,
      layers: [
        {
          id: "base",
          name: "Base",
          type: "base",
          visible: true,
          opacity: 100,
          blendMode: "normal",
          adjustments: createDefaultAdjustments(),
        },
      ],
      adjustments: createDefaultAdjustments(),
      filmProfile: undefined,
    });
    const canvas = globalThis.document.createElement("canvas");

    await renderDocumentToCanvas({
      canvas,
      document: renderDocument,
      intent: "export-full",
      targetSize: {
        width: 800,
        height: 600,
      },
      timestampText: "2026.03.28",
    });

    expect(composeRenderGraphToCanvasMock).not.toHaveBeenCalled();
    expect(renderSingleImageToCanvasMock).toHaveBeenCalledTimes(1);
    expect(renderSingleImageToCanvasMock.mock.calls[0]?.[0]).toMatchObject({
      canvas,
      request: {
        intent: "export",
        quality: "full",
        targetSize: {
          width: 800,
          height: 600,
        },
        renderSlotId: expect.stringContaining(":single"),
      },
    });
  });

  it("passes strict thumbnail failures through the single-image request bridge", async () => {
    const asset = createAsset("asset-a");
    const renderDocument = createRenderDocument({
      key: "editor:asset-a:thumbnail",
      assetById: new Map([[asset.id, asset]]),
      documentAsset: asset,
      layers: [
        {
          id: "base",
          name: "Base",
          type: "base",
          visible: true,
          opacity: 100,
          blendMode: "normal",
          adjustments: createDefaultAdjustments(),
        },
      ],
      adjustments: createDefaultAdjustments(),
      filmProfile: asset.filmProfile,
    });
    const canvas = globalThis.document.createElement("canvas");

    await renderDocumentToCanvas({
      canvas,
      document: renderDocument,
      intent: "thumbnail",
      targetSize: {
        width: 800,
        height: 600,
      },
      timestampText: "2026.03.28",
      strictErrors: true,
    });

    expect(renderSingleImageToCanvasMock).toHaveBeenCalledTimes(1);
    expect(renderSingleImageToCanvasMock.mock.calls[0]?.[0]).toMatchObject({
      canvas,
      request: {
        intent: "preview",
        quality: "full",
        strictErrors: true,
        timestampText: "2026.03.28",
      },
    });
    expect(applyTimestampOverlayMock).not.toHaveBeenCalled();
  });
});
