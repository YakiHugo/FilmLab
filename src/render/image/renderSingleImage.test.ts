import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sha256FromCanvas } from "@/lib/hash";
import { createDefaultCanvasImageRenderState } from "./stateCompiler";
import { createImageRenderDocument } from "./types";
import { renderSingleImageToCanvas } from "./renderSingleImage";

const renderDevelopBaseToCanvasMock = vi.fn();
const renderDevelopBaseToSurfaceMock = vi.fn();
const renderFilmStageToCanvasMock = vi.fn();
const renderFilmStageToSurfaceMock = vi.fn();
const renderImageToCanvasMock = vi.fn();
const renderImageToSurfaceMock = vi.fn();
const applyImageCarrierTransformsMock = vi.fn();
const applyImageCarrierTransformsToSurfaceIfSupportedMock = vi.fn();
const applyTimestampOverlayMock = vi.fn();
const applyTimestampOverlayToCanvasIfSupportedMock = vi.fn();
const applyTimestampOverlayToSurfaceIfSupportedMock = vi.fn();
const blendCanvasLayerOnGpuToSurfaceMock = vi.fn();
const applyFilter2dOnGpuMock = vi.fn();
const applyFilter2dOnGpuToSurfaceMock = vi.fn();
const blendMaskedCanvasesOnGpuToSurfaceMock = vi.fn();
const blendMaskedCanvasesOnGpuMock = vi.fn();
const applyFilter2dPostProcessingMock = vi.fn();
const buildImageRenderMaskRevisionKeyMock = vi.fn(() => "mask-revision");
const renderImageEffectMaskToCanvasMock = vi.fn(
  async ({ targetCanvas }) => targetCanvas ?? createSnapshotCanvas()
);

vi.mock("@/lib/imageProcessing", () => ({
  renderDevelopBaseToCanvas: (...args: unknown[]) =>
    Reflect.apply(renderDevelopBaseToCanvasMock, undefined, args),
  renderDevelopBaseToSurface: (...args: unknown[]) =>
    Reflect.apply(renderDevelopBaseToSurfaceMock, undefined, args),
  renderFilmStageToCanvas: (...args: unknown[]) =>
    Reflect.apply(renderFilmStageToCanvasMock, undefined, args),
  renderFilmStageToSurface: (...args: unknown[]) =>
    Reflect.apply(renderFilmStageToSurfaceMock, undefined, args),
  renderImageToCanvas: (...args: unknown[]) => Reflect.apply(renderImageToCanvasMock, undefined, args),
  renderImageToSurface: (...args: unknown[]) =>
    Reflect.apply(renderImageToSurfaceMock, undefined, args),
}));

vi.mock("./asciiEffect", () => ({
  applyImageCarrierTransforms: (...args: unknown[]) =>
    Reflect.apply(applyImageCarrierTransformsMock, undefined, args),
  applyImageCarrierTransformsToSurfaceIfSupported: (...args: unknown[]) =>
    Reflect.apply(applyImageCarrierTransformsToSurfaceIfSupportedMock, undefined, args),
}));

vi.mock("@/lib/timestampOverlay", () => ({
  applyTimestampOverlay: (...args: unknown[]) =>
    Reflect.apply(applyTimestampOverlayMock, undefined, args),
  applyTimestampOverlayToCanvasIfSupported: (...args: unknown[]) =>
    Reflect.apply(applyTimestampOverlayToCanvasIfSupportedMock, undefined, args),
  applyTimestampOverlayToSurfaceIfSupported: (...args: unknown[]) =>
    Reflect.apply(applyTimestampOverlayToSurfaceIfSupportedMock, undefined, args),
}));

vi.mock("@/lib/renderer/gpuCanvasLayerBlend", () => ({
  blendCanvasLayerOnGpu: vi.fn(),
  blendCanvasLayerOnGpuToSurface: (...args: unknown[]) =>
    Reflect.apply(blendCanvasLayerOnGpuToSurfaceMock, undefined, args),
}));

vi.mock("@/lib/renderer/gpuFilter2dPostProcessing", () => ({
  applyFilter2dOnGpu: (...args: unknown[]) =>
    Reflect.apply(applyFilter2dOnGpuMock, undefined, args),
  applyFilter2dOnGpuToSurface: (...args: unknown[]) =>
    Reflect.apply(applyFilter2dOnGpuToSurfaceMock, undefined, args),
}));

vi.mock("@/lib/renderer/gpuMaskedCanvasBlend", () => ({
  blendMaskedCanvasesOnGpu: (...args: unknown[]) =>
    Reflect.apply(blendMaskedCanvasesOnGpuMock, undefined, args),
  blendMaskedCanvasesOnGpuToSurface: (...args: unknown[]) =>
    Reflect.apply(blendMaskedCanvasesOnGpuToSurfaceMock, undefined, args),
}));

vi.mock("@/lib/filter2dPostProcessing", () => ({
  applyFilter2dPostProcessing: (...args: unknown[]) =>
    Reflect.apply(applyFilter2dPostProcessingMock, undefined, args),
}));

vi.mock("./effectMask", () => ({
  buildImageRenderMaskRevisionKey: (...args: unknown[]) =>
    Reflect.apply(buildImageRenderMaskRevisionKeyMock, undefined, args),
  renderImageEffectMaskToCanvas: (...args: unknown[]) =>
    Reflect.apply(renderImageEffectMaskToCanvasMock, undefined, args),
}));

const createCanvas = () =>
  ({
    width: 400,
    height: 225,
    getContext: vi.fn(() => null),
  }) as unknown as HTMLCanvasElement;

const createMutableHashableCanvas = ({
  width = 2,
  height = 2,
  initialBytes,
}: {
  width?: number;
  height?: number;
  initialBytes?: number[];
} = {}) => {
  let currentBytes = Uint8ClampedArray.from(initialBytes ?? new Array(16).fill(0));
  return {
    width,
    height,
    __setBytes(nextBytes: number[]) {
      currentBytes = Uint8ClampedArray.from(nextBytes);
    },
    __getBytes() {
      return [...currentBytes];
    },
    getContext: vi.fn(() => ({
      getImageData: vi.fn(() => ({
        data: currentBytes,
        width,
        height,
      })),
    })),
  } as unknown as HTMLCanvasElement & {
    __setBytes: (nextBytes: number[]) => void;
    __getBytes: () => number[];
  };
};

const createSnapshotCanvas = () => {
  let currentBytes = new Uint8ClampedArray(16);
  return {
    width: 0,
    height: 0,
    __setBytes(nextBytes: number[]) {
      currentBytes = Uint8ClampedArray.from(nextBytes);
    },
    __getBytes() {
      return [...currentBytes];
    },
    getContext: vi.fn(() => ({
      createImageData: vi.fn((width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      })),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn((_: number, __: number, width: number, height: number) => ({
        data: currentBytes.length === width * height * 4 ? currentBytes : new Uint8ClampedArray(width * height * 4),
        width,
        height,
      })),
      putImageData: vi.fn((imageData: { data: Uint8ClampedArray }) => {
        currentBytes = new Uint8ClampedArray(imageData.data);
      }),
    })),
  } as unknown as HTMLCanvasElement & {
    __setBytes: (nextBytes: number[]) => void;
    __getBytes: () => number[];
  };
};

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

const createStageResult = (
  stageId: "develop-base" | "film-stage" | "full",
  sourceCanvas = createSnapshotCanvas()
) => ({
  stageId,
  surface: {
    kind: "renderer-slot",
    mode: "preview",
    slotId: `slot:${stageId}`,
    width: 400,
    height: 225,
    sourceCanvas,
    materializeToCanvas: vi.fn((targetCanvas?: HTMLCanvasElement | null) => {
      const outputCanvas = targetCanvas ?? createSnapshotCanvas();
      const bytes =
        "__getBytes" in (sourceCanvas as object)
          ? (sourceCanvas as HTMLCanvasElement & { __getBytes: () => number[] }).__getBytes()
          : [];
      if ("__setBytes" in (outputCanvas as object)) {
        (outputCanvas as HTMLCanvasElement & { __setBytes: (nextBytes: number[]) => void }).__setBytes(
          bytes
        );
      }
      return outputCanvas;
    }),
    cloneToCanvas: vi.fn((targetCanvas?: HTMLCanvasElement | null) => {
      const outputCanvas = targetCanvas ?? createSnapshotCanvas();
      const bytes =
        "__getBytes" in (sourceCanvas as object)
          ? (sourceCanvas as HTMLCanvasElement & { __getBytes: () => number[] }).__getBytes()
          : [];
      if ("__setBytes" in (outputCanvas as object)) {
        (outputCanvas as HTMLCanvasElement & { __setBytes: (nextBytes: number[]) => void }).__setBytes(
          bytes
        );
      }
      return outputCanvas;
    }),
  },
});

const createStageDebug = (stageId: "develop-base" | "film-stage" | "full", status: string) => ({
  stageId,
  mode: "preview",
  slotId: `slot:${stageId}`,
  status,
  dirty: {
    sourceDirty: true,
    geometryDirty: stageId !== "film-stage",
    masterDirty: stageId !== "film-stage",
    hslDirty: false,
    curveDirty: false,
    detailDirty: false,
    filmDirty: stageId !== "develop-base",
    opticsDirty: stageId === "full" || stageId === "film-stage",
    outputDirty: true,
  },
  timings: {
    decodeMs: 1,
    geometryMs: 2,
    pipelineMs: 3,
    composeMs: 4,
    totalMs: 10,
  },
  cache: {
    sourceKey: "source",
    geometryKey: "geometry",
    pipelineKey: `pipeline:${stageId}`,
    outputKey: `output:${stageId}`,
    tilePlanKey: null,
  },
  activePasses: stageId === "develop-base" ? ["geometry", "master"] : ["film", "optics"],
  pipelineRendered: status === "rendered",
  usedCpuGeometry: stageId !== "film-stage",
  usedViewportRoi: false,
  usedTiledPipeline: false,
  tileCount: 0,
  error: null,
});

const getAsciiCarrierTransform = <T extends { carrierTransforms: readonly { type: string }[] }>(
  document: T
): Extract<T["carrierTransforms"][number], { type: "ascii" }> => {
  const transform = document.carrierTransforms.find(
    (candidate): candidate is Extract<T["carrierTransforms"][number], { type: "ascii" }> =>
      candidate.type === "ascii"
  );
  if (!transform) {
    throw new Error("Missing ascii carrier transform.");
  }
  return transform;
};

const createDocument = ({
  carrierTransforms,
  effects,
  masks,
  output,
}: {
  carrierTransforms?: ReturnType<typeof createImageRenderDocument>["carrierTransforms"];
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
    carrierTransforms:
      carrierTransforms ??
      [
        {
          id: "ascii-primary",
          type: "ascii",
          enabled: true,
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
      ],
    effects:
      effects ??
      [
        {
          id: "filter2d-primary",
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
    renderDevelopBaseToCanvasMock.mockResolvedValue(createStageResult("develop-base"));
    renderDevelopBaseToSurfaceMock.mockResolvedValue(createStageResult("develop-base"));
    renderFilmStageToCanvasMock.mockResolvedValue(createStageResult("film-stage"));
    renderFilmStageToSurfaceMock.mockResolvedValue(createStageResult("film-stage"));
    renderImageToCanvasMock.mockResolvedValue(createStageResult("full"));
    renderImageToSurfaceMock.mockResolvedValue(createStageResult("full"));
    applyImageCarrierTransformsMock.mockResolvedValue(undefined);
    applyImageCarrierTransformsToSurfaceIfSupportedMock.mockResolvedValue(null);
    applyTimestampOverlayMock.mockResolvedValue(undefined);
    applyTimestampOverlayToCanvasIfSupportedMock.mockResolvedValue(false);
    applyTimestampOverlayToSurfaceIfSupportedMock.mockResolvedValue(null);
    blendCanvasLayerOnGpuToSurfaceMock.mockResolvedValue(null);
    applyFilter2dOnGpuMock.mockResolvedValue(false);
    applyFilter2dOnGpuToSurfaceMock.mockResolvedValue(null);
    blendMaskedCanvasesOnGpuMock.mockResolvedValue(false);
    blendMaskedCanvasesOnGpuToSurfaceMock.mockResolvedValue(null);
    buildImageRenderMaskRevisionKeyMock.mockReturnValue("mask-revision");
    renderImageEffectMaskToCanvasMock.mockImplementation(
      async ({ targetCanvas }) => targetCanvas ?? createSnapshotCanvas()
    );
    vi.stubGlobal("document", {
      createElement: vi.fn(() => createSnapshotCanvas()),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders through the image-processing bridge and preserves carrier -> overlay -> finalize order", async () => {
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

    expect(renderImageToSurfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
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
    expect(renderDevelopBaseToSurfaceMock).not.toHaveBeenCalled();
    expect(applyImageCarrierTransformsMock).toHaveBeenCalledTimes(1);
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
      applyImageCarrierTransformsMock.mock.invocationCallOrder[0]
    );
    expect(applyFilter2dPostProcessingMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      applyTimestampOverlayMock.mock.invocationCallOrder[0]
    );
    expect(renderFilmStageToSurfaceMock).not.toHaveBeenCalled();
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

    expect(renderImageToSurfaceMock).toHaveBeenCalledWith(
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

    await vi.waitFor(() => {
      expect(applyTimestampOverlayMock).toHaveBeenCalledTimes(1);
    });
    expect(applyFilter2dPostProcessingMock).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    deferred.resolve();
    await renderPromise;

    expect(applyFilter2dPostProcessingMock).toHaveBeenCalledTimes(1);
    expect(settled).toBe(true);
  });

  it("keeps finalize overlays and finalize filter2d effects on surfaces when supported", async () => {
    const overlaySurface = createStageResult("full", createSnapshotCanvas()).surface;
    const finalizeSurface = createStageResult("full", createSnapshotCanvas()).surface;
    blendCanvasLayerOnGpuToSurfaceMock.mockResolvedValueOnce(overlaySurface);
    applyFilter2dOnGpuToSurfaceMock.mockResolvedValueOnce(finalizeSurface);
    const document = createDocument({
      carrierTransforms: [],
      effects: [
        {
          id: "finalize-filter",
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
      output: {
        timestamp: {
          enabled: true,
          position: "top-left",
          size: 18,
          opacity: 70,
        },
      },
    });

    const result = await renderSingleImageToCanvas({
      canvas: createCanvas(),
      document,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
        timestampText: "2026.03.27",
        debug: {
          trace: true,
        },
      },
    });

    expect(applyTimestampOverlayMock).toHaveBeenCalledTimes(1);
    expect(blendCanvasLayerOnGpuToSurfaceMock).toHaveBeenCalledTimes(1);
    expect(applyFilter2dOnGpuToSurfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: overlaySurface,
        slotId: "filter2d:finalize-filter",
      })
    );
    expect(applyFilter2dPostProcessingMock).not.toHaveBeenCalled();
    expect(result.debug?.boundaries).toEqual(
      expect.objectContaining({
        canvasMaterializations: 1,
        canvasClones: 0,
      })
    );
  });

  it("prefers direct GPU timestamp overlays on surfaces before raster fallback", async () => {
    const overlaySurface = createStageResult("full", createSnapshotCanvas()).surface;
    applyTimestampOverlayToSurfaceIfSupportedMock.mockResolvedValueOnce(overlaySurface);
    const document = createDocument({
      carrierTransforms: [],
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
        timestampText: "2026.03.27",
      },
    });

    expect(applyTimestampOverlayToSurfaceIfSupportedMock).toHaveBeenCalledTimes(1);
    expect(applyTimestampOverlayMock).not.toHaveBeenCalled();
    expect(blendCanvasLayerOnGpuToSurfaceMock).not.toHaveBeenCalled();
  });

  it("keeps finalize effects behind canvas overlays when overlays cannot stay on surfaces", async () => {
    applyTimestampOverlayToSurfaceIfSupportedMock.mockResolvedValueOnce(null);
    blendCanvasLayerOnGpuToSurfaceMock.mockResolvedValueOnce(null);
    applyTimestampOverlayToCanvasIfSupportedMock.mockResolvedValueOnce(true);
    const document = createDocument({
      carrierTransforms: [],
      effects: [
        {
          id: "finalize-filter",
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
      output: {
        timestamp: {
          enabled: true,
          position: "top-left",
          size: 18,
          opacity: 70,
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
        timestampText: "2026.03.27",
      },
    });

    expect(applyTimestampOverlayToCanvasIfSupportedMock).toHaveBeenCalledTimes(1);
    expect(applyFilter2dOnGpuToSurfaceMock).not.toHaveBeenCalled();
    expect(applyFilter2dPostProcessingMock).toHaveBeenCalledTimes(1);
    expect(applyFilter2dPostProcessingMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      applyTimestampOverlayToCanvasIfSupportedMock.mock.invocationCallOrder[0]
    );
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

    expect(renderImageToSurfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "preview-interactive",
      })
    );
  });

  it("renders an explicit develop snapshot when carrier analysis requests develop output", async () => {
    const base = createDocument();
    const asciiCarrier = getAsciiCarrierTransform(base);
    const document = createDocument({
      carrierTransforms: [
        {
          ...asciiCarrier,
          analysisSource: "develop",
        },
      ],
      effects: [],
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

    expect(renderDevelopBaseToSurfaceMock).toHaveBeenCalledTimes(1);
    expect(renderDevelopBaseToSurfaceMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        renderSlot: "board-export:analysis-develop",
      })
    );
    expect(renderImageToSurfaceMock).toHaveBeenCalledTimes(1);
    expect(applyImageCarrierTransformsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshots: expect.objectContaining({
          develop: expect.any(Object),
          style: expect.any(Object),
        }),
      })
    );
    expect(applyImageCarrierTransformsMock.mock.calls[0]?.[0]?.snapshots.develop).not.toBeNull();
    expect(applyImageCarrierTransformsMock.mock.calls[0]?.[0]?.snapshots.style).not.toBe(canvas);
  });

  it("runs develop-stage raster effects before film-stage and carrier transforms before style effects", async () => {
    const baseDocument = createDocument();
    const asciiCarrier = getAsciiCarrierTransform(baseDocument);
    const document = createDocument({
      carrierTransforms: [asciiCarrier],
      effects: [
        {
          id: "develop-filter",
          type: "filter2d",
          enabled: true,
          placement: "develop",
          params: {
            brightness: 12,
            hue: 0,
            blur: 0,
            dilate: 0,
          },
        },
        {
          id: "style-filter",
          type: "filter2d",
          enabled: true,
          placement: "style",
          params: {
            brightness: -12,
            hue: 0,
            blur: 0,
            dilate: 0,
          },
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

    expect(renderDevelopBaseToSurfaceMock).toHaveBeenCalledTimes(1);
    expect(renderDevelopBaseToSurfaceMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        renderSlot: "board-preview:base-develop",
      })
    );
    expect(renderFilmStageToSurfaceMock).toHaveBeenCalledTimes(1);
    expect(renderFilmStageToSurfaceMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        renderSlot: "board-preview:base-film-stage",
      })
    );
    expect(renderImageToSurfaceMock).not.toHaveBeenCalled();
    expect(applyFilter2dPostProcessingMock).toHaveBeenCalledTimes(2);
    expect(applyImageCarrierTransformsMock).toHaveBeenCalledTimes(1);
    expect(applyFilter2dPostProcessingMock.mock.invocationCallOrder[0]).toBeLessThan(
      renderFilmStageToSurfaceMock.mock.invocationCallOrder[0]
    );
    expect(applyImageCarrierTransformsMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      renderFilmStageToSurfaceMock.mock.invocationCallOrder[0]
    );
    expect(applyFilter2dPostProcessingMock.mock.invocationCallOrder[1]).toBeGreaterThan(
      applyImageCarrierTransformsMock.mock.invocationCallOrder[0]
    );
  });

  it("keeps unmasked develop filter2d effects on surfaces before film stage when supported", async () => {
    const developFilteredSurface = createStageResult("full", createSnapshotCanvas()).surface;
    applyFilter2dOnGpuToSurfaceMock.mockResolvedValueOnce(developFilteredSurface);
    const document = createDocument({
      carrierTransforms: [],
      effects: [
        {
          id: "develop-filter",
          type: "filter2d",
          enabled: true,
          placement: "develop",
          params: {
            brightness: 12,
            hue: 0,
            blur: 0,
            dilate: 0,
          },
        },
      ],
      output: {
        timestamp: {
          enabled: false,
          position: "top-left",
          size: 18,
          opacity: 70,
        },
      },
    });

    const result = await renderSingleImageToCanvas({
      canvas: createCanvas(),
      document,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
        renderSlotId: "board-preview",
        debug: {
          trace: true,
        },
      },
    });

    expect(applyFilter2dOnGpuToSurfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: expect.objectContaining({
          slotId: "slot:develop-base",
        }),
        slotId: "filter2d:develop-filter",
      })
    );
    expect(renderFilmStageToSurfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: developFilteredSurface.sourceCanvas,
      })
    );
    expect(applyFilter2dPostProcessingMock).not.toHaveBeenCalled();
    expect(result.debug?.boundaries).toEqual(
      expect.objectContaining({
        canvasMaterializations: 1,
        canvasClones: 0,
      })
    );
  });

  it("keeps unmasked style filter2d effects on surfaces when there is no carrier stage", async () => {
    const styleFilteredSurface = createStageResult("full", createSnapshotCanvas()).surface;
    applyFilter2dOnGpuToSurfaceMock.mockResolvedValueOnce(styleFilteredSurface);
    const document = createDocument({
      carrierTransforms: [],
      effects: [
        {
          id: "style-filter",
          type: "filter2d",
          enabled: true,
          placement: "style",
          params: {
            brightness: -12,
            hue: 0,
            blur: 0,
            dilate: 0,
          },
        },
      ],
      output: {
        timestamp: {
          enabled: false,
          position: "top-left",
          size: 18,
          opacity: 70,
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

    expect(applyFilter2dOnGpuToSurfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: expect.objectContaining({
          slotId: "slot:full",
        }),
        slotId: "filter2d:style-filter",
      })
    );
    expect(applyFilter2dPostProcessingMock).not.toHaveBeenCalled();
    expect(applyFilter2dOnGpuMock).not.toHaveBeenCalled();
  });

  it("keeps unmasked ascii carrier output on surfaces and chains style filter2d after it", async () => {
    const carrierSurface = createStageResult("full", createSnapshotCanvas()).surface;
    const styleFilteredSurface = createStageResult("full", createSnapshotCanvas()).surface;
    applyImageCarrierTransformsToSurfaceIfSupportedMock.mockResolvedValueOnce(carrierSurface);
    applyFilter2dOnGpuToSurfaceMock.mockResolvedValueOnce(styleFilteredSurface);
    const document = createDocument({
      effects: [
        {
          id: "style-filter",
          type: "filter2d",
          enabled: true,
          placement: "style",
          params: {
            brightness: -12,
            hue: 0,
            blur: 0,
            dilate: 0,
          },
        },
      ],
      output: {
        timestamp: {
          enabled: false,
          position: "top-left",
          size: 18,
          opacity: 70,
        },
      },
    });

    const result = await renderSingleImageToCanvas({
      canvas: createCanvas(),
      document,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
        renderSlotId: "board-preview",
        debug: {
          trace: true,
        },
      },
    });

    expect(applyImageCarrierTransformsToSurfaceIfSupportedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: expect.objectContaining({
          slotId: "slot:full",
        }),
        carrierTransforms: document.carrierTransforms,
      })
    );
    expect(applyImageCarrierTransformsMock).not.toHaveBeenCalled();
    expect(applyFilter2dOnGpuToSurfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: carrierSurface,
        slotId: "filter2d:style-filter",
      })
    );
    expect(applyFilter2dPostProcessingMock).not.toHaveBeenCalled();
    expect(result.debug?.boundaries).toEqual(
      expect.objectContaining({
        canvasMaterializations: 1,
        canvasClones: 1,
      })
    );
  });

  it("keeps masked ascii carrier output on surfaces when the carrier surface path succeeds", async () => {
    const baseDocument = createDocument();
    const maskedCarrier = {
      ...getAsciiCarrierTransform(baseDocument),
      maskId: "mask-1",
    };
    const carrierSurface = createStageResult("full", createSnapshotCanvas()).surface;
    applyImageCarrierTransformsToSurfaceIfSupportedMock.mockResolvedValueOnce(carrierSurface);
    const document = createDocument({
      carrierTransforms: [maskedCarrier],
      effects: [],
      masks: {
        byId: {
          "mask-1": {
            id: "mask-1",
            kind: "local-adjustment",
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
      output: {
        timestamp: {
          enabled: false,
          position: "top-left",
          size: 18,
          opacity: 70,
        },
      },
    });

    const result = await renderSingleImageToCanvas({
      canvas: createCanvas(),
      document,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
        renderSlotId: "board-preview",
        debug: {
          trace: true,
        },
      },
    });

    expect(applyImageCarrierTransformsToSurfaceIfSupportedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: expect.objectContaining({
          slotId: "slot:full",
        }),
        carrierTransforms: document.carrierTransforms,
        stageReferenceCanvas: expect.any(Object),
      })
    );
    expect(applyImageCarrierTransformsMock).not.toHaveBeenCalled();
    expect(applyFilter2dPostProcessingMock).not.toHaveBeenCalled();
    expect(result.debug?.boundaries).toEqual(
      expect.objectContaining({
        canvasMaterializations: 1,
        canvasClones: 1,
      })
    );
  });

  it("keeps masked develop filter2d effects on surfaces before film stage when supported", async () => {
    const effectSurface = createStageResult("full", createSnapshotCanvas()).surface;
    const blendedSurface = createStageResult("full", createSnapshotCanvas()).surface;
    applyFilter2dOnGpuToSurfaceMock.mockResolvedValueOnce(effectSurface);
    blendMaskedCanvasesOnGpuToSurfaceMock.mockResolvedValueOnce(blendedSurface);
    const document = createDocument({
      carrierTransforms: [],
      effects: [
        {
          id: "develop-filter-masked",
          type: "filter2d",
          enabled: true,
          placement: "develop",
          maskId: "mask-1",
          params: {
            brightness: 12,
            hue: 0,
            blur: 0,
            dilate: 0,
          },
        },
      ],
      masks: {
        byId: {
          "mask-1": {
            id: "mask-1",
            kind: "local-adjustment",
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
      output: {
        timestamp: {
          enabled: false,
          position: "top-left",
          size: 18,
          opacity: 70,
        },
      },
    });

    const result = await renderSingleImageToCanvas({
      canvas: createCanvas(),
      document,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
        debug: {
          trace: true,
        },
      },
    });

    expect(renderFilmStageToSurfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: blendedSurface.sourceCanvas,
      })
    );
    expect(renderImageEffectMaskToCanvasMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maskDefinition: document.masks.byId["mask-1"],
      })
    );
    expect(blendMaskedCanvasesOnGpuToSurfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slotId: "effect-mask-blend:develop-filter-masked",
      })
    );
    expect(applyFilter2dPostProcessingMock).not.toHaveBeenCalled();
    expect(result.debug?.boundaries).toEqual(
      expect.objectContaining({
        canvasMaterializations: 1,
        canvasClones: 1,
      })
    );
  });

  it("keeps masked style filter2d effects on surfaces when there is no carrier stage", async () => {
    const effectSurface = createStageResult("full", createSnapshotCanvas()).surface;
    const blendedSurface = createStageResult("full", createSnapshotCanvas()).surface;
    applyFilter2dOnGpuToSurfaceMock.mockResolvedValueOnce(effectSurface);
    blendMaskedCanvasesOnGpuToSurfaceMock.mockResolvedValueOnce(blendedSurface);
    const document = createDocument({
      carrierTransforms: [],
      effects: [
        {
          id: "style-filter-masked",
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
          "mask-1": {
            id: "mask-1",
            kind: "local-adjustment",
            sourceLocalAdjustmentId: "local-1",
            mask: {
              mode: "linear",
              startX: 0,
              startY: 0,
              endX: 1,
              endY: 1,
              feather: 0.2,
            },
          },
        },
      },
      output: {
        timestamp: {
          enabled: false,
          position: "top-left",
          size: 18,
          opacity: 70,
        },
      },
    });

    const result = await renderSingleImageToCanvas({
      canvas: createCanvas(),
      document,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
        debug: {
          trace: true,
        },
      },
    });

    expect(blendMaskedCanvasesOnGpuToSurfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slotId: "effect-mask-blend:style-filter-masked",
      })
    );
    expect(applyFilter2dPostProcessingMock).not.toHaveBeenCalled();
    expect(applyFilter2dOnGpuMock).not.toHaveBeenCalled();
    expect(result.debug?.boundaries).toEqual(
      expect.objectContaining({
        canvasMaterializations: 1,
        canvasClones: 1,
      })
    );
  });

  it("binds style analysis to the post-film pre-carrier snapshot", async () => {
    const document = createDocument({
      effects: [],
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
        renderSlotId: "board-preview",
      },
    });

    const call = applyImageCarrierTransformsMock.mock.calls[0]?.[0];
    expect(call?.snapshots.style).toBe(call?.stageReferenceCanvas);
    expect(call?.snapshots.style).not.toBe(call?.canvas);
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

    const unsplitSeedKey = renderImageToSurfaceMock.mock.calls[0]?.[0]?.seedKey;

    vi.clearAllMocks();
    renderDevelopBaseToSurfaceMock.mockResolvedValue(createStageResult("develop-base"));
    renderFilmStageToSurfaceMock.mockResolvedValue(createStageResult("film-stage"));
    renderImageToSurfaceMock.mockResolvedValue(createStageResult("full"));
    applyImageCarrierTransformsMock.mockResolvedValue(undefined);
    applyTimestampOverlayMock.mockResolvedValue(undefined);
    buildImageRenderMaskRevisionKeyMock.mockReturnValue("mask-revision");
    renderImageEffectMaskToCanvasMock.mockImplementation(
      async ({ targetCanvas }) => targetCanvas ?? createSnapshotCanvas()
    );

    await renderSingleImageToCanvas({
      canvas: createCanvas(),
      document: createDocument({
        effects: [
          {
            id: "develop-filter",
            type: "filter2d",
            enabled: true,
            placement: "develop",
            params: {
              brightness: 12,
              hue: 0,
              blur: 0,
              dilate: 0,
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

    expect(renderFilmStageToSurfaceMock).toHaveBeenCalledTimes(1);
    expect(renderFilmStageToSurfaceMock.mock.calls[0]?.[0]?.seedKey).toBe(unsplitSeedKey);
  });

  it("rasterizes carrier masks when a carrier transform declares maskId", async () => {
    const maskedCarrier = {
      ...getAsciiCarrierTransform(createDocument()),
      maskId: "mask-1",
    };
    applyImageCarrierTransformsMock.mockImplementation(async ({ carrierTransforms, document, stageReferenceCanvas }) => {
      const transform = carrierTransforms[0];
      if (!transform?.maskId) {
        return;
      }
      const { applyMaskedStageOperation } = await import("./stageMaskComposite");
      await applyMaskedStageOperation({
        canvas: createSnapshotCanvas(),
        maskDefinition: document.masks.byId[transform.maskId] ?? null,
        maskReferenceCanvas: stageReferenceCanvas,
        applyOperation: () => undefined,
      });
    });
    const document = createDocument({
      carrierTransforms: [maskedCarrier],
      effects: [],
      masks: {
        byId: {
          "mask-1": {
            id: "mask-1",
            kind: "local-adjustment",
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

  it("uses a stable stage snapshot for masked raster effects within the same placement bucket", async () => {
    const maskDefinition = {
      id: "mask-1",
      kind: "local-adjustment" as const,
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

  it("assembles an opt-in agent trace in execution order", async () => {
    renderDevelopBaseToSurfaceMock.mockResolvedValueOnce({
      stageId: "develop-base",
      surface: createStageResult("develop-base").surface,
      debug: createStageDebug("develop-base", "rendered"),
    });
    renderFilmStageToSurfaceMock.mockResolvedValueOnce({
      stageId: "film-stage",
      surface: createStageResult("film-stage").surface,
      debug: createStageDebug("film-stage", "rendered"),
    });

    const baseDocument = createDocument();
    const asciiCarrier = getAsciiCarrierTransform(baseDocument);
    const document = createDocument({
      carrierTransforms: [asciiCarrier],
      effects: [
        {
          id: "develop-filter",
          type: "filter2d",
          enabled: true,
          placement: "develop",
          params: {
            brightness: 12,
            hue: 0,
            blur: 0,
            dilate: 0,
          },
        },
        {
          id: "style-filter",
          type: "filter2d",
          enabled: true,
          placement: "style",
          params: {
            brightness: -12,
            hue: 0,
            blur: 0,
            dilate: 0,
          },
        },
        {
          id: "finalize-filter",
          type: "filter2d",
          enabled: true,
          placement: "finalize",
          params: {
            brightness: 0,
            hue: 12,
            blur: 0,
            dilate: 0,
          },
        },
      ],
    });

    const result = await renderSingleImageToCanvas({
      canvas: createSnapshotCanvas(),
      document,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
        debug: {
          trace: true,
        },
      },
    });

    expect(result.debug?.stages?.map((stage) => stage.id)).toEqual([
      "develop",
      "style",
      "overlay",
      "finalize",
    ]);
    expect(result.debug?.stages?.[0]).toEqual(
      expect.objectContaining({
        id: "develop",
        operations: [
          expect.objectContaining({
            kind: "low-level",
            internalStageId: "develop-base",
            lowLevel: expect.objectContaining({
              status: "rendered",
              activePasses: ["geometry", "master"],
            }),
          }),
          expect.objectContaining({
            kind: "effects",
            effectPlacement: "develop",
            effectCount: 1,
          }),
          expect.objectContaining({
            kind: "low-level",
            internalStageId: "film-stage",
            lowLevel: expect.objectContaining({
              status: "rendered",
              activePasses: ["film", "optics"],
            }),
          }),
        ],
      })
    );
    expect(result.debug?.stages?.[1]).toEqual(
      expect.objectContaining({
        id: "style",
        operations: [
          expect.objectContaining({
            kind: "carrier",
            carrierCount: 1,
          }),
          expect.objectContaining({
            kind: "effects",
            effectPlacement: "style",
            effectCount: 1,
          }),
        ],
      })
    );
    expect(result.debug?.boundaries).toEqual(
      expect.objectContaining({
        canvasMaterializations: expect.any(Number),
        canvasClones: expect.any(Number),
      })
    );
  });

  it("computes stable output hashes only when requested", async () => {
    renderImageToSurfaceMock.mockImplementation(async ({ state }) => {
      const value = Math.max(0, Math.min(255, Math.round(state.develop.tone.exposure)));
      const sourceCanvas = createSnapshotCanvas();
      sourceCanvas.__setBytes(new Array(16).fill(value));
      return createStageResult("full", sourceCanvas);
    });

    const baseDocument = createDocument();
    const changedDocument = createDocument();
    changedDocument.develop.tone.exposure = 18;

    const firstCanvas = createMutableHashableCanvas();
    const secondCanvas = createMutableHashableCanvas();
    const changedCanvas = createMutableHashableCanvas();

    const first = await renderSingleImageToCanvas({
      canvas: firstCanvas,
      document: baseDocument,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
        debug: {
          outputHash: true,
        },
      },
    });
    const second = await renderSingleImageToCanvas({
      canvas: secondCanvas,
      document: baseDocument,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
        debug: {
          outputHash: true,
        },
      },
    });
    const changed = await renderSingleImageToCanvas({
      canvas: changedCanvas,
      document: changedDocument,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
        debug: {
          outputHash: true,
        },
      },
    });

    const expectedBaseHash = await sha256FromCanvas(firstCanvas);
    const expectedChangedHash = await sha256FromCanvas(changedCanvas);

    expect(first.debug?.outputHash).toBe(expectedBaseHash);
    expect(second.debug?.outputHash).toBe(expectedBaseHash);
    expect(changed.debug?.outputHash).toBe(expectedChangedHash);
    expect(first.debug?.outputHash).not.toBe(changed.debug?.outputHash);
  });

  it("includes canvas dimensions in the optional output hash", async () => {
    renderImageToSurfaceMock.mockImplementation(async () => {
      const sourceCanvas = createSnapshotCanvas();
      sourceCanvas.__setBytes(new Array(16).fill(42));
      return createStageResult("full", sourceCanvas);
    });

    const document = createDocument();
    const squareCanvas = createMutableHashableCanvas({ width: 2, height: 2 });
    const wideCanvas = createMutableHashableCanvas({ width: 1, height: 4 });

    const square = await renderSingleImageToCanvas({
      canvas: squareCanvas,
      document,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
        debug: {
          outputHash: true,
        },
      },
    });
    const wide = await renderSingleImageToCanvas({
      canvas: wideCanvas,
      document,
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 256,
          height: 144,
        },
        debug: {
          outputHash: true,
        },
      },
    });

    expect(square.debug?.outputHash).not.toBe(wide.debug?.outputHash);
  });
});
