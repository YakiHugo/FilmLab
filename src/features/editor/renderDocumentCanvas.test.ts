import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { createCanvasCompositeLayerSurface } from "./compositeBackend";
import { createRenderDocument } from "./document";
import { renderDocumentToCanvas } from "./renderDocumentCanvas";

const renderImageToCanvasMock = vi.fn();
const renderDevelopBaseToCanvasMock = vi.fn();
const composeRenderGraphToCanvasMock = vi.fn();
const applyTimestampOverlayMock = vi.fn();

vi.mock("@/lib/imageProcessing", () => ({
  renderImageToCanvas: (...args: unknown[]) => renderImageToCanvasMock(...args),
  renderDevelopBaseToCanvas: (...args: unknown[]) => renderDevelopBaseToCanvasMock(...args),
}));

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

const createAsset = (id: string) => ({
  id,
  name: `${id}.jpg`,
  type: "image/jpeg" as const,
  size: 1024,
  createdAt: "2026-03-16T00:00:00.000Z",
  objectUrl: `blob:${id}`,
  adjustments: createDefaultAdjustments(),
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
    renderImageToCanvasMock.mockResolvedValue(undefined);
    renderDevelopBaseToCanvasMock.mockResolvedValue(undefined);
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
    expect(renderImageToCanvasMock).not.toHaveBeenCalled();
  });

  it("provides distinct layer surfaces to deferred multi-layer composition", async () => {
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
    });

    expect(renderedLayerCanvases).toHaveLength(2);
    expect(renderedLayerCanvases[0]).not.toBe(renderedLayerCanvases[1]);
    expect(renderImageToCanvasMock).toHaveBeenCalledTimes(2);
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
    });

    expect(composeRenderGraphToCanvasMock).not.toHaveBeenCalled();
    expect(renderImageToCanvasMock).toHaveBeenCalledTimes(1);
    expect(renderImageToCanvasMock.mock.calls[0]?.[0]).toMatchObject({
      canvas,
      targetSize: {
        width: 800,
        height: 600,
      },
      renderSlot: expect.stringContaining(":single"),
    });
  });

  it("routes develop-base single-layer renders through the pre-film helper without timestamp overlay", async () => {
    const asset = createAsset("asset-a");
    const renderDocument = createRenderDocument({
      key: "editor:asset-a:develop-base",
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
      intent: "export-full",
      targetSize: {
        width: 800,
        height: 600,
      },
      stage: "develop-base",
      timestampText: "2026.03.28",
    });

    expect(renderDevelopBaseToCanvasMock).toHaveBeenCalledTimes(1);
    expect(renderDevelopBaseToCanvasMock.mock.calls[0]?.[0]).toMatchObject({
      canvas,
      filmProfile: undefined,
      timestampText: null,
      targetSize: {
        width: 800,
        height: 600,
      },
    });
    expect(renderImageToCanvasMock).not.toHaveBeenCalled();
    expect(applyTimestampOverlayMock).not.toHaveBeenCalled();
  });
});
