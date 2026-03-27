import { createDefaultAdjustments } from "@/lib/adjustments";
import type { Asset } from "@/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createImageRenderDocument } from "./types";
import { renderSingleImageToCanvas } from "./renderSingleImage";

const renderDocumentToCanvasMock = vi.fn();
const applyAsciiRasterEffectMock = vi.fn();
const applyTimestampOverlayMock = vi.fn();
const applyFilter2dPostProcessingMock = vi.fn();

vi.mock("@/features/editor/renderDocumentCanvas", () => ({
  renderDocumentToCanvas: (...args: unknown[]) => renderDocumentToCanvasMock(...args),
}));

vi.mock("@/lib/asciiRaster", () => ({
  applyAsciiRasterEffect: (...args: unknown[]) => applyAsciiRasterEffectMock(...args),
}));

vi.mock("@/lib/timestampOverlay", () => ({
  applyTimestampOverlay: (...args: unknown[]) => applyTimestampOverlayMock(...args),
}));

vi.mock("@/lib/filter2dPostProcessing", () => ({
  applyFilter2dPostProcessing: (...args: unknown[]) => applyFilter2dPostProcessingMock(...args),
}));

const createAsset = (): Asset => ({
  id: "asset-1",
  name: "asset-1.jpg",
  type: "image/jpeg",
  size: 2048,
  createdAt: "2026-03-27T00:00:00.000Z",
  objectUrl: "blob:asset-1",
  metadata: {
    width: 1600,
    height: 900,
  },
  adjustments: createDefaultAdjustments(),
  layers: [],
});

const createCanvas = () =>
  ({
    width: 0,
    height: 0,
    getContext: vi.fn(() => null),
  }) as unknown as HTMLCanvasElement;

const createDocument = () =>
  createImageRenderDocument({
    id: "board:element-1",
    source: {
      assetId: "asset-1",
      objectUrl: "blob:asset-1",
      contentHash: null,
      name: "asset-1.jpg",
      mimeType: "image/jpeg",
      width: 1600,
      height: 900,
    },
    geometry: {
      rotate: 0,
      rightAngleRotation: 0,
      perspectiveEnabled: false,
      perspectiveHorizontal: 0,
      perspectiveVertical: 0,
      vertical: 0,
      horizontal: 0,
      scale: 100,
      flipHorizontal: false,
      flipVertical: false,
      aspectRatio: "original",
      customAspectRatio: 4 / 3,
      opticsProfile: false,
      opticsCA: false,
      opticsDistortionK1: 0,
      opticsDistortionK2: 0,
      opticsCaAmount: 0,
      opticsVignette: 0,
      opticsVignetteMidpoint: 50,
    },
    develop: {
      adjustments: {
        ...createDefaultAdjustments(),
        timestampEnabled: false,
      },
    },
    masks: {
      byId: {},
      localAdjustments: [],
    },
    effects: [
      {
        id: "legacy-ascii",
        type: "ascii",
        enabled: true,
        placement: "afterFilm",
        analysisSource: "afterFilm",
        params: {
          renderMode: "glyph",
          preset: "blocks",
          cellSize: 10,
          characterSpacing: 1.25,
          density: 1,
          coverage: 1,
          edgeEmphasis: 0,
          brightness: 0,
          contrast: 1.6,
          dither: "floyd-steinberg",
          colorMode: "full-color",
          foregroundOpacity: 1,
          foregroundBlendMode: "source-over",
          backgroundMode: "cell-solid",
          backgroundBlur: 0,
          backgroundOpacity: 1,
          backgroundColor: "#000000",
          invert: true,
          gridOverlay: false,
        },
      },
      {
        id: "legacy-filter2d",
        type: "filter2d",
        enabled: true,
        placement: "afterOutput",
        params: {
          brightness: 12,
          hue: -20,
          blur: 18,
          dilate: 6,
        },
      },
    ],
    film: {
      profileId: null,
      profile: null,
    },
    output: {
      timestamp: {
        enabled: true,
        position: "top-left",
        size: 18,
        opacity: 70,
      },
    },
  });

describe("renderSingleImageToCanvas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renderDocumentToCanvasMock.mockResolvedValue(undefined);
  });

  it("renders through the legacy renderer and preserves legacy effect order", async () => {
    const document = createDocument();
    const asset = createAsset();
    const assetById = new Map([[asset.id, asset]]);
    const canvas = createCanvas();

    await renderSingleImageToCanvas({
      canvas,
      document,
      request: {
        intent: "export",
        quality: "full",
        targetSize: {
          width: 400,
          height: 225,
        },
        timestampText: "2026.03.27",
        renderSlotId: "board-export",
      },
      runtime: {
        asset,
        assetById,
      },
    });

    expect(renderDocumentToCanvasMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canvas,
        intent: "export-full",
        timestampText: null,
        renderSlotPrefix: "board-export",
        targetSize: {
          width: 400,
          height: 225,
        },
      })
    );
    expect(applyAsciiRasterEffectMock).toHaveBeenCalledTimes(1);
    expect(applyTimestampOverlayMock).toHaveBeenCalledTimes(1);
    expect(applyFilter2dPostProcessingMock).toHaveBeenCalledTimes(1);
    expect(applyTimestampOverlayMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      applyAsciiRasterEffectMock.mock.invocationCallOrder[0]
    );
    expect(applyFilter2dPostProcessingMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      applyTimestampOverlayMock.mock.invocationCallOrder[0]
    );
  });

  it("maps preview requests to the correct legacy preview intent", async () => {
    const document = createDocument();
    const asset = createAsset();
    const assetById = new Map([[asset.id, asset]]);

    await renderSingleImageToCanvas({
      canvas: createCanvas(),
      document,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
      },
      runtime: {
        asset,
        assetById,
      },
    });

    expect(renderDocumentToCanvasMock).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "preview-interactive",
      })
    );
  });
});
