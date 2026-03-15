import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { createRenderDocument } from "./document";
import { renderDocumentToCanvas } from "./renderDocumentCanvas";

const renderImageToCanvasMock = vi.fn();
const composeRenderGraphToCanvasMock = vi.fn();

vi.mock("@/lib/imageProcessing", () => ({
  renderImageToCanvas: (...args: unknown[]) => renderImageToCanvasMock(...args),
}));

vi.mock("@/lib/timestampOverlay", () => ({
  applyTimestampOverlay: vi.fn(),
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
});
