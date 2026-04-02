import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultCanvasImageRenderState,
  createImageRenderDocument,
  extractImageProcessState,
} from "@/render/image";

const renderMock = vi.fn();
const updateSourceMock = vi.fn();
const disposeMock = vi.fn();

class MockCanvasElement {
  width = 0;
  height = 0;

  private readonly context2d = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    getImageData: vi.fn((_: number, __: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(Math.max(1, width) * Math.max(1, height) * 4),
      width,
      height,
    })),
    putImageData: vi.fn(),
    createImageData: vi.fn((width: number, height: number) => ({
      data: new Uint8ClampedArray(Math.max(1, width) * Math.max(1, height) * 4),
      width,
      height,
    })),
  };

  getContext(type: string) {
    if (type === "2d") {
      return this.context2d;
    }
    if (type === "webgl2") {
      return {
        MAX_TEXTURE_SIZE: 0x0d33,
        getParameter: vi.fn(() => 8192),
        getExtension: vi.fn(() => ({
          loseContext: vi.fn(),
        })),
      };
    }
    return null;
  }
}

const createPipelineMetrics = () => ({
  totalMs: 4,
  updateUniformsMs: 1,
  filterChainMs: 2,
  drawMs: 1,
  passCpuMs: {
    geometry: 0.5,
    master: 0.75,
    hsl: 0,
    curve: 0,
    detail: 0,
    film: 0.5,
    optics: 0.25,
  },
  activePasses: ["geometry", "master", "film", "optics"],
});

vi.mock("@/lib/film", () => ({
  resolveRenderProfileFromState: vi.fn(() => ({
    mode: "v3",
    source: null,
    v3: {},
    lut: null,
    lutBlend: null,
    customLut: null,
    printLut: null,
    pushPull: {
      enabled: false,
      ev: 0,
      source: "none",
      selectedStop: null,
    },
  })),
}));

vi.mock("@/lib/renderer/uniformResolvers", () => ({
  resolveMasterUniforms: vi.fn(() => ({})),
  resolveHslUniformsFromState: vi.fn(() => ({})),
  resolveCurveUniformsFromState: vi.fn(() => ({})),
  resolveDetailUniformsFromState: vi.fn(() => ({})),
  resolveFilmUniformsV3: vi.fn(() => ({
    u_lutEnabled: false,
    u_lutIntensity: 0,
    u_lutMixEnabled: false,
    u_lutMixFactor: 0,
    u_customLutEnabled: false,
    u_customLutIntensity: 0,
    u_printLutEnabled: false,
    u_printLutIntensity: 0,
  })),
  resolveHalationBloomUniformsV3: vi.fn(() => ({})),
}));

vi.mock("@/lib/renderer/RenderManager", () => {
  type FrameState = {
    sourceKey: string | null;
    geometryKey: string | null;
    masterKey: string | null;
    hslKey: string | null;
    curveKey: string | null;
    detailKey: string | null;
    filmKey: string | null;
    opticsKey: string | null;
    pipelineKey: string | null;
    outputKey: string | null;
    tilePlanKey: string | null;
    uploadedGeometryKey: string | null;
    geometryCanvas: MockCanvasElement | null;
    localMaskCanvas: MockCanvasElement | null;
    localBlendCanvas: MockCanvasElement | null;
    lastRenderError: string | null;
  };

  const frameStates = new Map<string, FrameState>();

  const createFrameState = (): FrameState => ({
    sourceKey: null,
    geometryKey: null,
    masterKey: null,
    hslKey: null,
    curveKey: null,
    detailKey: null,
    filmKey: null,
    opticsKey: null,
    pipelineKey: null,
    outputKey: null,
    tilePlanKey: null,
    uploadedGeometryKey: null,
    geometryCanvas: null,
    localMaskCanvas: null,
    localBlendCanvas: null,
    lastRenderError: null,
  });

  class MockPipelineRenderer {
    canvas = new MockCanvasElement() as unknown as HTMLCanvasElement;
    isWebGL2 = true;
    isContextLost = false;
    maxTextureSize = 8192;

    updateSource = (...args: unknown[]) => Reflect.apply(updateSourceMock, this, args);

    render = (...args: unknown[]) => Reflect.apply(renderMock, this, args);

    dispose = (...args: unknown[]) => Reflect.apply(disposeMock, this, args);

    consumeCapturedLinearResult() {
      return null;
    }

    borrowCapturedLinearResult() {
      return null;
    }
  }

  return {
    RenderManager: class MockRenderManager {
      getRenderer() {
        return new MockPipelineRenderer();
      }

      getFrameState(mode: string, slotId?: string) {
        const key = `${mode}:${slotId ?? "default"}`;
        const existing = frameStates.get(key);
        if (existing) {
          return existing;
        }
        const created = createFrameState();
        frameStates.set(key, created);
        return created;
      }

      getMaxTextureSize() {
        return 8192;
      }

      dispose() {
        disposeMock();
      }

      disposeAll() {
        disposeMock();
      }
    },
  };
});

const createState = () =>
  extractImageProcessState(
    createImageRenderDocument({
      id: "debug-doc",
      source: {
        assetId: "asset-1",
        objectUrl: "blob:asset-1",
        contentHash: null,
        name: "asset-1.jpg",
        mimeType: "image/jpeg",
        width: 64,
        height: 64,
      },
      ...createDefaultCanvasImageRenderState(),
    })
  );

const createCanvas = (width = 64, height = 64) => {
  const canvas = new MockCanvasElement() as unknown as HTMLCanvasElement;
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

describe("imageProcessing debug trace", () => {
  beforeEach(() => {
    vi.resetModules();
    renderMock.mockReset();
    updateSourceMock.mockReset();
    disposeMock.mockReset();
    renderMock.mockReturnValue(createPipelineMetrics());
    vi.stubGlobal("HTMLCanvasElement", MockCanvasElement);
    vi.stubGlobal("document", {
      createElement: vi.fn(() => new MockCanvasElement()),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports rendered vs reused-output for repeated renders on the same slot", async () => {
    const { renderImageToCanvas } = await import("./imageProcessing");
    const source = createCanvas();
    const output = createCanvas();
    const state = createState();

    const first = await renderImageToCanvas({
      canvas: output,
      source,
      state,
      targetSize: {
        width: 64,
        height: 64,
      },
      mode: "preview",
      qualityProfile: "interactive",
      renderSlot: "debug-slot",
      seedKey: "stable-seed",
      debug: {
        trace: true,
      },
    });
    const second = await renderImageToCanvas({
      canvas: output,
      source,
      state,
      targetSize: {
        width: 64,
        height: 64,
      },
      mode: "preview",
      qualityProfile: "interactive",
      renderSlot: "debug-slot",
      seedKey: "stable-seed",
      debug: {
        trace: true,
      },
    });

    expect(first.debug).toEqual(
      expect.objectContaining({
        status: "rendered",
        pipelineRendered: true,
        activePasses: ["geometry", "master", "film", "optics"],
      })
    );
    expect(second.debug).toEqual(
      expect.objectContaining({
        status: "reused-output",
        pipelineRendered: false,
        activePasses: [],
      })
    );
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it("reports preview-frame reuse when a preview rerender fails after a successful frame", async () => {
    const { renderImageToCanvas } = await import("./imageProcessing");
    const source = createCanvas();
    const output = createCanvas();
    const firstState = createState();
    const changedState = createState();
    changedState.develop.tone.exposure = 12;

    renderMock
      .mockReturnValueOnce(createPipelineMetrics())
      .mockImplementationOnce(() => {
        throw new Error("gpu exploded");
      });

    await renderImageToCanvas({
      canvas: output,
      source,
      state: firstState,
      targetSize: {
        width: 64,
        height: 64,
      },
      mode: "preview",
      qualityProfile: "interactive",
      renderSlot: "preview-fallback-slot",
      seedKey: "stable-seed:first",
      debug: {
        trace: true,
      },
    });

    const fallback = await renderImageToCanvas({
      canvas: output,
      source,
      state: changedState,
      targetSize: {
        width: 64,
        height: 64,
      },
      mode: "preview",
      qualityProfile: "interactive",
      renderSlot: "preview-fallback-slot",
      seedKey: "stable-seed:changed",
      debug: {
        trace: true,
      },
    });

    expect(fallback.debug).toEqual(
      expect.objectContaining({
        status: "reused-preview-frame",
        pipelineRendered: false,
        error: expect.stringContaining("gpu exploded"),
      })
    );
  });

  it("reports geometry fallback when no preview frame is available to reuse", async () => {
    const { renderImageToCanvas } = await import("./imageProcessing");
    const source = createCanvas();
    const output = createCanvas();
    const state = createState();
    let tick = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => {
      tick += 1;
      return tick;
    });

    renderMock.mockImplementationOnce(() => {
      throw new Error("first frame failed");
    });

    const fallback = await renderImageToCanvas({
      canvas: output,
      source,
      state,
      targetSize: {
        width: 64,
        height: 64,
      },
      mode: "preview",
      qualityProfile: "interactive",
      renderSlot: "geometry-fallback-slot",
      seedKey: "stable-seed:first",
      debug: {
        trace: true,
      },
    });
    nowSpy.mockRestore();

    expect(fallback.debug).toEqual(
      expect.objectContaining({
        status: "geometry-fallback",
        pipelineRendered: false,
        usedCpuGeometry: true,
        error: expect.stringContaining("first frame failed"),
      })
    );
    expect(fallback.debug?.timings.pipelineMs).toBeGreaterThan(0);
  });

  it("lets debug overrides disable preview-frame reuse fallback", async () => {
    const { renderImageToCanvas } = await import("./imageProcessing");
    const source = createCanvas();
    const output = createCanvas();
    const firstState = createState();
    const changedState = createState();
    changedState.develop.tone.exposure = 12;

    renderMock
      .mockReturnValueOnce(createPipelineMetrics())
      .mockImplementationOnce(() => {
        throw new Error("gpu exploded");
      });

    await renderImageToCanvas({
      canvas: output,
      source,
      state: firstState,
      targetSize: {
        width: 64,
        height: 64,
      },
      mode: "preview",
      qualityProfile: "interactive",
      renderSlot: "preview-no-reuse-slot",
      seedKey: "stable-seed:first",
      debug: {
        trace: true,
      },
    });

    const fallback = await renderImageToCanvas({
      canvas: output,
      source,
      state: changedState,
      targetSize: {
        width: 64,
        height: 64,
      },
      mode: "preview",
      qualityProfile: "interactive",
      renderSlot: "preview-no-reuse-slot",
      seedKey: "stable-seed:changed",
      debug: {
        trace: true,
        pipelineOverrides: {
          keepLastPreviewFrameOnError: false,
        },
      },
    });

    expect(fallback.debug).toEqual(
      expect.objectContaining({
        status: "geometry-fallback",
        pipelineRendered: false,
        error: expect.stringContaining("gpu exploded"),
      })
    );
  });

  it("reports no CPU geometry when a film-stage fallback bypasses geometry work", async () => {
    const { renderFilmStageToCanvas } = await import("./imageProcessing");
    const source = createCanvas();
    const output = createCanvas();
    const state = createState();

    renderMock.mockImplementationOnce(() => {
      throw new Error("film stage failed");
    });

    const fallback = await renderFilmStageToCanvas({
      canvas: output,
      source,
      state,
      targetSize: {
        width: 64,
        height: 64,
      },
      mode: "preview",
      qualityProfile: "interactive",
      renderSlot: "film-stage-fallback-slot",
      seedKey: "stable-seed:film",
      debug: {
        trace: true,
      },
    });

    expect(fallback.debug).toEqual(
      expect.objectContaining({
        status: "geometry-fallback",
        pipelineRendered: false,
        usedCpuGeometry: false,
        error: expect.stringContaining("film stage failed"),
      })
    );
  });

  it("reports tiled export trace details when export size exceeds max texture size", async () => {
    const { renderImageToCanvas } = await import("./imageProcessing");
    const source = createCanvas();
    const output = createCanvas();
    const state = createState();

    const result = await renderImageToCanvas({
      canvas: output,
      source,
      state,
      targetSize: {
        width: 9000,
        height: 9000,
      },
      mode: "export",
      qualityProfile: "full",
      renderSlot: "tiled-export-slot",
      seedKey: "stable-seed:export",
      debug: {
        trace: true,
      },
    });

    expect(result.debug).toEqual(
      expect.objectContaining({
        status: "rendered",
        usedTiledPipeline: true,
        tileCount: expect.any(Number),
      })
    );
    expect(result.debug?.tileCount).toBeGreaterThan(1);
  });

  it("keeps fallback cache snapshots coherent when tiled export falls back", async () => {
    const { renderImageToCanvas } = await import("./imageProcessing");
    const source = createCanvas();
    const output = createCanvas();
    const state = createState();
    let tick = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => {
      tick += 1;
      return tick;
    });

    renderMock.mockImplementation(() => {
      throw new Error("tile render failed");
    });

    const result = await renderImageToCanvas({
      canvas: output,
      source,
      state,
      targetSize: {
        width: 9000,
        height: 9000,
      },
      mode: "export",
      qualityProfile: "full",
      strictErrors: false,
      renderSlot: "tiled-export-fallback-slot",
      seedKey: "stable-seed:export-fallback",
      debug: {
        trace: true,
      },
    });
    nowSpy.mockRestore();

    expect(result.debug).toEqual(
      expect.objectContaining({
        status: "geometry-fallback",
        usedTiledPipeline: true,
        error: expect.stringContaining("tile render failed"),
        cache: expect.objectContaining({
          sourceKey: expect.any(String),
          geometryKey: expect.any(String),
          pipelineKey: expect.stringContaining("fallback:tiled:"),
          outputKey: expect.any(String),
        }),
      })
    );
    expect(result.debug?.timings.pipelineMs).toBeGreaterThan(0);
    expect(result.debug?.timings.composeMs).toBeGreaterThan(0);
    expect(result.debug?.timings.totalMs).toBeGreaterThan(0);
  });

  it("accumulates compose timing when tiled local-adjustment work fails before fallback", async () => {
    const { renderImageToCanvas } = await import("./imageProcessing");
    const { createTilePlan } = await import("@/lib/renderer/gpu/TiledRenderer");
    const source = createCanvas();
    const output = createCanvas();
    const state = createState();
    state.develop.regions = [
      {
        id: "local-1",
        enabled: true,
        amount: 100,
        maskId: "mask-1",
        adjustments: {
          exposure: 12,
        },
      },
    ];
    state.masks.byId["mask-1"] = {
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
    };

    const baseTileCount = createTilePlan({
      width: 9000,
      height: 9000,
      tileSize: 8064,
      overlap: 64,
    }).length;

    let renderCallCount = 0;
    renderMock.mockImplementation(() => {
      renderCallCount += 1;
      if (renderCallCount === baseTileCount + 1) {
        throw new Error("local tiled layer failed");
      }
      return createPipelineMetrics();
    });

    let tick = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => {
      tick += 1;
      return tick;
    });

    const result = await renderImageToCanvas({
      canvas: output,
      source,
      state,
      targetSize: {
        width: 9000,
        height: 9000,
      },
      mode: "export",
      qualityProfile: "full",
      strictErrors: false,
      renderSlot: "tiled-export-local-fallback-slot",
      seedKey: "stable-seed:export-local-fallback",
      debug: {
        trace: true,
      },
    });
    nowSpy.mockRestore();

    expect(result.debug).toEqual(
      expect.objectContaining({
        status: "geometry-fallback",
        usedTiledPipeline: true,
        error: expect.stringContaining("local tiled layer failed"),
      })
    );
    expect(result.debug?.timings.composeMs).toBeGreaterThan(1);
  });
});
