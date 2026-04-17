import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sha256FromCanvas } from "@/lib/hash";
import { createDefaultCanvasImageRenderState } from "./stateCompiler";
import { createImageRenderDocument } from "./types";
import { renderSingleImageToCanvas } from "./renderSingleImage";

const renderDevelopBaseToSurfaceMock = vi.fn();
const renderFilmStageToSurfaceMock = vi.fn();
const renderImageToSurfaceMock = vi.fn();
const applyImageCarrierTransformsMock = vi.fn();
const applyImageEffectsMock = vi.fn();
const applyImageOverlaysMock = vi.fn();

vi.mock("@/lib/imageProcessing", () => ({
  renderDevelopBaseToSurface: (...args: unknown[]) =>
    Reflect.apply(renderDevelopBaseToSurfaceMock, undefined, args),
  renderFilmStageToSurface: (...args: unknown[]) =>
    Reflect.apply(renderFilmStageToSurfaceMock, undefined, args),
  renderImageToSurface: (...args: unknown[]) =>
    Reflect.apply(renderImageToSurfaceMock, undefined, args),
}));

vi.mock("./asciiEffect", () => ({
  applyImageCarrierTransforms: (...args: unknown[]) =>
    Reflect.apply(applyImageCarrierTransformsMock, undefined, args),
}));

vi.mock("./effectExecution", () => ({
  applyImageEffects: (...args: unknown[]) =>
    Reflect.apply(applyImageEffectsMock, undefined, args),
}));

vi.mock("./overlayExecution", async () => {
  const actual = await vi.importActual<typeof import("./overlayExecution")>(
    "./overlayExecution"
  );
  return {
    ...actual,
    applyImageOverlays: (...args: unknown[]) =>
      Reflect.apply(applyImageOverlaysMock, undefined, args),
  };
});

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
            customCharset: null,
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
    renderDevelopBaseToSurfaceMock.mockResolvedValue(createStageResult("develop-base"));
    renderFilmStageToSurfaceMock.mockResolvedValue(createStageResult("film-stage"));
    renderImageToSurfaceMock.mockResolvedValue(createStageResult("full"));
    applyImageCarrierTransformsMock.mockImplementation(async ({ surface }) => surface);
    applyImageEffectsMock.mockImplementation(async ({ surface }) => surface);
    applyImageOverlaysMock.mockImplementation(async ({ surface }) => surface);
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
    expect(applyImageOverlaysMock).toHaveBeenCalledTimes(1);
    expect(applyImageEffectsMock).toHaveBeenCalledTimes(1);
    expect(applyImageOverlaysMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      applyImageCarrierTransformsMock.mock.invocationCallOrder[0]
    );
    expect(applyImageEffectsMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      applyImageOverlaysMock.mock.invocationCallOrder[0]
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

  it("awaits the overlay stage before running finalize effects and resolving", async () => {
    const deferred = createDeferred<{ surface: unknown }>();
    applyImageOverlaysMock.mockImplementationOnce(async ({ surface }) => {
      await deferred.promise;
      return surface;
    });
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
      expect(applyImageOverlaysMock).toHaveBeenCalledTimes(1);
    });
    expect(applyImageEffectsMock).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    deferred.resolve({ surface: null });
    await renderPromise;

    expect(applyImageEffectsMock).toHaveBeenCalledTimes(1);
    expect(settled).toBe(true);
  });

  it("reports a single canvas materialization and no orchestrator clones on the unmasked finalize path", async () => {
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

    expect(applyImageOverlaysMock).toHaveBeenCalledTimes(1);
    expect(applyImageEffectsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        effects: document.effects,
      })
    );
    expect(result.debug?.boundaries).toEqual(
      expect.objectContaining({
        canvasMaterializations: 1,
        canvasClones: 0,
      })
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
    expect(applyImageEffectsMock).toHaveBeenCalledTimes(2);
    expect(applyImageCarrierTransformsMock).toHaveBeenCalledTimes(1);
    expect(applyImageEffectsMock.mock.invocationCallOrder[0]).toBeLessThan(
      renderFilmStageToSurfaceMock.mock.invocationCallOrder[0]
    );
    expect(applyImageCarrierTransformsMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      renderFilmStageToSurfaceMock.mock.invocationCallOrder[0]
    );
    expect(applyImageEffectsMock.mock.invocationCallOrder[1]).toBeGreaterThan(
      applyImageCarrierTransformsMock.mock.invocationCallOrder[0]
    );
  });

  it("passes the post-develop surface into the film stage source", async () => {
    const developFilteredSurface = createStageResult("full", createSnapshotCanvas()).surface;
    applyImageEffectsMock.mockImplementationOnce(async () => developFilteredSurface);
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

    expect(applyImageEffectsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: expect.objectContaining({
          slotId: "slot:develop-base",
        }),
        effects: document.effects,
      })
    );
    expect(renderFilmStageToSurfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: developFilteredSurface.sourceCanvas,
      })
    );
    expect(result.debug?.boundaries).toEqual(
      expect.objectContaining({
        canvasMaterializations: 1,
        canvasClones: 0,
      })
    );
  });

  it("chains unmasked style filter2d effects onto the full render surface", async () => {
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

    expect(applyImageEffectsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: expect.objectContaining({
          slotId: "slot:full",
        }),
        effects: document.effects,
      })
    );
  });

  it("chains style filter2d after the carrier surface", async () => {
    const carrierSurface = createStageResult("full", createSnapshotCanvas()).surface;
    applyImageCarrierTransformsMock.mockResolvedValueOnce(carrierSurface);
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

    expect(applyImageCarrierTransformsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: expect.objectContaining({
          slotId: "slot:full",
        }),
        carrierTransforms: document.carrierTransforms,
      })
    );
    expect(applyImageEffectsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: carrierSurface,
        effects: document.effects,
      })
    );
    expect(result.debug?.boundaries).toEqual(
      expect.objectContaining({
        canvasMaterializations: 1,
        canvasClones: 1,
      })
    );
  });

  it("clones a carrier analysis snapshot for masked carriers", async () => {
    const baseDocument = createDocument();
    const maskedCarrier = {
      ...getAsciiCarrierTransform(baseDocument),
      maskId: "mask-1",
    };
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

    expect(applyImageCarrierTransformsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: expect.objectContaining({
          slotId: "slot:full",
        }),
        carrierTransforms: document.carrierTransforms,
        stageReferenceCanvas: expect.any(Object),
      })
    );
    expect(result.debug?.boundaries).toEqual(
      expect.objectContaining({
        canvasMaterializations: 1,
        canvasClones: 1,
      })
    );
  });

  it("clones a develop snapshot for masked develop effects before the film stage", async () => {
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

    expect(applyImageEffectsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        effects: document.effects,
        stageReferenceCanvas: expect.any(Object),
      })
    );
    expect(result.debug?.boundaries).toEqual(
      expect.objectContaining({
        canvasMaterializations: 1,
        canvasClones: 1,
      })
    );
  });

  it("clones a style snapshot for masked style effects", async () => {
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

    expect(applyImageEffectsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        effects: document.effects,
        stageReferenceCanvas: expect.any(Object),
      })
    );
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
    applyImageCarrierTransformsMock.mockImplementation(async ({ surface }) => surface);
    applyImageEffectsMock.mockImplementation(async ({ surface }) => surface);
    applyImageOverlaysMock.mockImplementation(async ({ surface }) => surface);

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

  it("reuses a stable stageReferenceCanvas for masked effects in the same placement bucket", async () => {
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

    const styleCall = applyImageEffectsMock.mock.calls.find(([args]) =>
      args?.effects?.some?.((effect: { placement?: string }) => effect.placement === "style")
    );
    expect(styleCall?.[0]?.effects).toHaveLength(2);
    expect(styleCall?.[0]?.stageReferenceCanvas).toBeDefined();
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
