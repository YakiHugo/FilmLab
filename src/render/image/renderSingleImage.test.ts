import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultCanvasImageRenderState } from "./stateCompiler";
import { createImageRenderDocument } from "./types";
import { renderSingleImageToCanvas } from "./renderSingleImage";

const renderDevelopBaseToCanvasMock = vi.fn();
const renderFilmStageToCanvasMock = vi.fn();
const renderImageToCanvasMock = vi.fn();
const applyImageAsciiEffectMock = vi.fn();
const applyTimestampOverlayMock = vi.fn();
const applyFilter2dPostProcessingMock = vi.fn();
const buildImageRenderMaskRevisionKeyMock = vi.fn(() => "mask-revision");
const renderImageEffectMaskToCanvasMock = vi.fn(({ targetCanvas }) => targetCanvas ?? createSnapshotCanvas());

vi.mock("@/lib/imageProcessing", () => ({
  renderDevelopBaseToCanvas: (...args: unknown[]) => renderDevelopBaseToCanvasMock(...args),
  renderFilmStageToCanvas: (...args: unknown[]) => renderFilmStageToCanvasMock(...args),
  renderImageToCanvas: (...args: unknown[]) => renderImageToCanvasMock(...args),
}));

vi.mock("./asciiEffect", () => ({
  applyImageAsciiEffect: (...args: unknown[]) => applyImageAsciiEffectMock(...args),
}));

vi.mock("@/lib/timestampOverlay", () => ({
  applyTimestampOverlay: (...args: unknown[]) => applyTimestampOverlayMock(...args),
}));

vi.mock("@/lib/filter2dPostProcessing", () => ({
  applyFilter2dPostProcessing: (...args: unknown[]) => applyFilter2dPostProcessingMock(...args),
}));

vi.mock("./effectMask", () => ({
  buildImageRenderMaskRevisionKey: (...args: unknown[]) => buildImageRenderMaskRevisionKeyMock(...args),
  renderImageEffectMaskToCanvas: (...args: unknown[]) => renderImageEffectMaskToCanvasMock(...args),
}));

const createCanvas = () =>
  ({
    width: 400,
    height: 225,
    getContext: vi.fn(() => null),
  }) as unknown as HTMLCanvasElement;

const createSnapshotCanvas = () =>
  ({
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({
      createImageData: vi.fn((width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      })),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn((x: number, y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      })),
      putImageData: vi.fn(),
    })),
  }) as unknown as HTMLCanvasElement;

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

const createDocument = ({
  effects,
  masks,
  output,
}: {
  effects?: ReturnType<typeof createImageRenderDocument>["effects"];
  masks?: ReturnType<typeof createImageRenderDocument>["masks"];
  output?: ReturnType<typeof createImageRenderDocument>["output"];
} = {}) =>
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
    ...createDefaultCanvasImageRenderState(),
    masks:
      masks ??
      {
        byId: {},
      },
    effects:
      effects ??
      [
        {
          id: "legacy-ascii",
          type: "ascii",
          enabled: true,
          placement: "style",
          analysisSource: "style",
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
          placement: "finalize",
          params: {
            brightness: 12,
            hue: -20,
            blur: 18,
            dilate: 6,
          },
        },
      ],
    output:
      output ?? {
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
    renderDevelopBaseToCanvasMock.mockResolvedValue(undefined);
    renderFilmStageToCanvasMock.mockResolvedValue(undefined);
    renderImageToCanvasMock.mockResolvedValue(undefined);
    applyTimestampOverlayMock.mockResolvedValue(undefined);
    buildImageRenderMaskRevisionKeyMock.mockReturnValue("mask-revision");
    renderImageEffectMaskToCanvasMock.mockImplementation(({ targetCanvas }) => targetCanvas ?? createSnapshotCanvas());
    vi.stubGlobal("document", {
      createElement: vi.fn(() => createSnapshotCanvas()),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders through the image-processing bridge and preserves legacy effect order", async () => {
    const document = createDocument();
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
    });

    expect(renderImageToCanvasMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canvas,
        intent: "export-full",
        renderSlot: "board-export:base-film",
        state: expect.objectContaining({
          geometry: document.geometry,
          develop: document.develop,
          film: document.film,
          masks: document.masks,
        }),
        targetSize: {
          width: 400,
          height: 225,
        },
      })
    );
    expect(renderDevelopBaseToCanvasMock).not.toHaveBeenCalled();
    expect(applyImageAsciiEffectMock).toHaveBeenCalledTimes(1);
    expect(applyTimestampOverlayMock).toHaveBeenCalledTimes(1);
    expect(applyFilter2dPostProcessingMock).toHaveBeenCalledTimes(1);
    expect(applyTimestampOverlayMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        timestampEnabled: true,
        timestampPosition: "top-left",
        timestampSize: 18,
        timestampOpacity: 70,
      })
    );
    expect(applyTimestampOverlayMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      applyImageAsciiEffectMock.mock.invocationCallOrder[0]
    );
    expect(applyFilter2dPostProcessingMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      applyTimestampOverlayMock.mock.invocationCallOrder[0]
    );
    expect(applyImageAsciiEffectMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        targetCanvas: canvas,
      })
    );
    expect(applyImageAsciiEffectMock.mock.calls[0]?.[0]?.sourceCanvas).not.toBe(canvas);
    expect(renderFilmStageToCanvasMock).not.toHaveBeenCalled();
  });

  it("uses the document source as the authoritative image source", async () => {
    const document = createDocument();
    document.source.objectUrl = "blob:document-source";

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
    });

    expect(renderImageToCanvasMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "blob:document-source",
      })
    );
  });

  it("awaits timestamp overlay before running finalize effects and resolving", async () => {
    const deferred = createDeferred<void>();
    applyTimestampOverlayMock.mockReturnValueOnce(deferred.promise);
    const document = createDocument();
    let settled = false;

    const renderPromise = renderSingleImageToCanvas({
      canvas: createCanvas(),
      document,
      request: {
        intent: "export",
        quality: "full",
        targetSize: {
          width: 400,
          height: 225,
        },
        timestampText: "2026.03.27",
      },
    }).then(() => {
      settled = true;
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(applyTimestampOverlayMock).toHaveBeenCalledTimes(1);
    expect(applyFilter2dPostProcessingMock).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    deferred.resolve();
    await renderPromise;

    expect(applyFilter2dPostProcessingMock).toHaveBeenCalledTimes(1);
    expect(settled).toBe(true);
  });

  it("maps preview requests to the correct legacy preview intent", async () => {
    const document = createDocument();

    await renderSingleImageToCanvas({
      canvas: createSnapshotCanvas(),
      document,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
      },
    });

    expect(renderImageToCanvasMock).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "preview-interactive",
      })
    );
  });

  it("renders an explicit develop snapshot when ascii analysis requests develop output", async () => {
    const base = createDocument();
    const document = createDocument({
      effects: [
        {
          ...base.effects[0],
          analysisSource: "develop",
        },
      ],
    });
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
        renderSlotId: "board-export",
      },
    });

    expect(renderDevelopBaseToCanvasMock).toHaveBeenCalledTimes(1);
    expect(renderDevelopBaseToCanvasMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        renderSlot: "board-export:analysis-develop",
      })
    );
    expect(renderImageToCanvasMock).toHaveBeenCalledTimes(1);
    expect(renderImageToCanvasMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        canvas,
        renderSlot: "board-export:base-film",
      })
    );
    expect(applyImageAsciiEffectMock.mock.calls[0]?.[0]?.sourceCanvas).not.toBe(canvas);
    expect(applyImageAsciiEffectMock.mock.calls[0]?.[0]?.sourceCanvas).not.toBe(
      renderDevelopBaseToCanvasMock.mock.calls[0]?.[0]?.canvas
    );
  });

  it("executes develop effects before film-stage rendering and style effects afterward", async () => {
    const baseDocument = createDocument();
    const document = createDocument({
      effects: [
        {
          ...baseDocument.effects[0],
          placement: "develop",
          analysisSource: "develop",
        },
        {
          ...baseDocument.effects[0],
          id: "ascii-style",
          placement: "style",
          analysisSource: "style",
        },
      ],
    });
    const canvas = createCanvas();

    await renderSingleImageToCanvas({
      canvas,
      document,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
        renderSlotId: "board-preview",
      },
    });

    expect(renderDevelopBaseToCanvasMock).toHaveBeenCalledTimes(1);
    expect(renderDevelopBaseToCanvasMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        renderSlot: "board-preview:base-develop",
      })
    );
    expect(renderFilmStageToCanvasMock).toHaveBeenCalledTimes(1);
    expect(renderFilmStageToCanvasMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        canvas,
        source: renderDevelopBaseToCanvasMock.mock.calls[0]?.[0]?.canvas,
        renderSlot: "board-preview:base-film-stage",
      })
    );
    expect(renderImageToCanvasMock).not.toHaveBeenCalled();
    expect(applyImageAsciiEffectMock).toHaveBeenCalledTimes(2);
    expect(applyImageAsciiEffectMock.mock.calls[0]?.[0]?.targetCanvas).toBe(
      renderDevelopBaseToCanvasMock.mock.calls[0]?.[0]?.canvas
    );
    expect(applyImageAsciiEffectMock.mock.calls[1]?.[0]?.targetCanvas).toBe(canvas);
    expect(applyImageAsciiEffectMock.mock.invocationCallOrder[0]).toBeLessThan(
      renderFilmStageToCanvasMock.mock.invocationCallOrder[0]
    );
    expect(applyImageAsciiEffectMock.mock.invocationCallOrder[1]).toBeGreaterThan(
      renderFilmStageToCanvasMock.mock.invocationCallOrder[0]
    );
  });

  it("keeps the film-stage seed stable between split and unsplit paths", async () => {
    const baseDocument = createDocument();

    await renderSingleImageToCanvas({
      canvas: createCanvas(),
      document: baseDocument,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
      },
    });

    const unsplitSeedKey = renderImageToCanvasMock.mock.calls[0]?.[0]?.seedKey;

    vi.clearAllMocks();
    renderDevelopBaseToCanvasMock.mockResolvedValue(undefined);
    renderFilmStageToCanvasMock.mockResolvedValue(undefined);
    renderImageToCanvasMock.mockResolvedValue(undefined);
    applyTimestampOverlayMock.mockResolvedValue(undefined);
    buildImageRenderMaskRevisionKeyMock.mockReturnValue("mask-revision");
    renderImageEffectMaskToCanvasMock.mockImplementation(({ targetCanvas }) => targetCanvas ?? createSnapshotCanvas());

    await renderSingleImageToCanvas({
      canvas: createCanvas(),
      document: createDocument({
        effects: [
          {
            ...baseDocument.effects[0],
            placement: "develop",
            analysisSource: "develop",
            params: {
              ...baseDocument.effects[0].params,
              brightness: 0,
              contrast: 1,
            },
          },
        ],
      }),
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
      },
    });

    expect(renderFilmStageToCanvasMock).toHaveBeenCalledTimes(1);
    expect(renderFilmStageToCanvasMock.mock.calls[0]?.[0]?.seedKey).toBe(unsplitSeedKey);
  });

  it("rasterizes and applies masks when a raster effect declares maskId", async () => {
    const maskedAsciiEffect = {
      ...createDocument().effects[0],
      maskId: "mask-1",
    };
    const document = createDocument({
      effects: [maskedAsciiEffect],
      masks: {
        byId: {
          "mask-1": {
            id: "mask-1",
            kind: "legacy-local-adjustment",
            sourceLocalAdjustmentId: "local-1",
            mask: {
              mode: "radial",
              centerX: 0.5,
              centerY: 0.5,
              radiusX: 0.3,
              radiusY: 0.3,
              feather: 0.2,
            },
          },
        },
      },
    });

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
    });

    expect(buildImageRenderMaskRevisionKeyMock).toHaveBeenCalledWith(document.masks.byId["mask-1"]);
    expect(renderImageEffectMaskToCanvasMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maskDefinition: document.masks.byId["mask-1"],
      })
    );
  });

  it("uses a stable stage snapshot for masked-effect gating within the same placement bucket", async () => {
    const maskDefinition = {
      id: "mask-1",
      kind: "legacy-local-adjustment" as const,
      sourceLocalAdjustmentId: "local-1",
      mask: {
        mode: "radial" as const,
        centerX: 0.5,
        centerY: 0.5,
        radiusX: 0.3,
        radiusY: 0.3,
        feather: 0.2,
        lumaMin: 0.2,
        lumaMax: 0.8,
      },
    };
    const document = createDocument({
      effects: [
        {
          id: "filter-1",
          type: "filter2d",
          enabled: true,
          placement: "style",
          maskId: "mask-1",
          params: {
            brightness: 12,
            hue: 0,
            blur: 0,
            dilate: 0,
          },
        },
        {
          id: "filter-2",
          type: "filter2d",
          enabled: true,
          placement: "style",
          maskId: "mask-1",
          params: {
            brightness: -12,
            hue: 0,
            blur: 0,
            dilate: 0,
          },
        },
      ],
      masks: {
        byId: {
          "mask-1": maskDefinition,
        },
      },
    });
    const canvas = createSnapshotCanvas();

    await renderSingleImageToCanvas({
      canvas,
      document,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
      },
    });

    expect(renderImageEffectMaskToCanvasMock).toHaveBeenCalledTimes(2);
    const firstReferenceSource =
      renderImageEffectMaskToCanvasMock.mock.calls[0]?.[0]?.referenceSource;
    const secondReferenceSource =
      renderImageEffectMaskToCanvasMock.mock.calls[1]?.[0]?.referenceSource;
    expect(firstReferenceSource).toBe(secondReferenceSource);
    expect(firstReferenceSource).not.toBe(canvas);
  });
});
