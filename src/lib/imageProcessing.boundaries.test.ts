import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultCanvasImageRenderState } from "@/render/image/stateCompiler";
import { createImageRenderDocument } from "@/render/image/types";
import type {
  ImageRenderDocument,
  ImageRenderRequest,
} from "@/render/image/types";
import { renderSingleImageToCanvas } from "@/render/image/renderSingleImage";
import type { RenderBoundaryMetrics } from "@/lib/renderSurfaceHandle";

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

vi.mock("@/render/image/asciiEffect", () => ({
  applyImageCarrierTransforms: (...args: unknown[]) =>
    Reflect.apply(applyImageCarrierTransformsMock, undefined, args),
}));

vi.mock("@/render/image/effectExecution", () => ({
  applyImageEffects: (...args: unknown[]) =>
    Reflect.apply(applyImageEffectsMock, undefined, args),
}));

vi.mock("@/render/image/overlayExecution", async () => {
  const actual = await vi.importActual<typeof import("@/render/image/overlayExecution")>(
    "@/render/image/overlayExecution"
  );
  return {
    ...actual,
    applyImageOverlays: (...args: unknown[]) =>
      Reflect.apply(applyImageOverlaysMock, undefined, args),
  };
});

const createCanvas = (width = 400, height = 225) =>
  ({
    width,
    height,
    getContext: vi.fn(() => null),
  }) as unknown as HTMLCanvasElement;

const createSnapshotCanvas = (width = 400, height = 225) =>
  ({
    width,
    height,
    getContext: vi.fn(() => ({
      createImageData: vi.fn((w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      })),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn((_: number, __: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      })),
      putImageData: vi.fn(),
    })),
  }) as unknown as HTMLCanvasElement;

const createStageBoundaries = (
  overrides: Partial<RenderBoundaryMetrics> = {}
): RenderBoundaryMetrics => ({
  textureUploads: 1,
  canvasMaterializations: 0,
  canvasClones: 0,
  cpuPixelReads: 0,
  ...overrides,
});

const createStageDebug = (
  stageId: "develop-base" | "film-stage" | "full",
  boundaries: RenderBoundaryMetrics
) => ({
  stageId,
  mode: "preview" as const,
  slotId: `slot:${stageId}`,
  status: "rendered" as const,
  dirty: {
    sourceDirty: true,
    geometryDirty: true,
    masterDirty: true,
    hslDirty: false,
    curveDirty: false,
    detailDirty: false,
    filmDirty: true,
    opticsDirty: true,
    outputDirty: true,
  },
  timings: {
    decodeMs: 0,
    geometryMs: 0,
    pipelineMs: 0,
    composeMs: 0,
    totalMs: 0,
  },
  cache: {
    sourceKey: "source",
    geometryKey: "geometry",
    pipelineKey: `pipeline:${stageId}`,
    outputKey: `output:${stageId}`,
    tilePlanKey: null,
  },
  activePasses: [],
  pipelineRendered: true,
  outputKind: "renderer-slot" as const,
  boundaries,
  usedCpuGeometry: false,
  usedViewportRoi: false,
  usedTiledPipeline: false,
  tileCount: 0,
  error: null,
});

const createStageResult = (
  stageId: "develop-base" | "film-stage" | "full",
  boundaries: RenderBoundaryMetrics = createStageBoundaries()
) => {
  const sourceCanvas = createSnapshotCanvas();
  return {
    stageId,
    debug: createStageDebug(stageId, boundaries),
    surface: {
      kind: "renderer-slot" as const,
      mode: "preview" as const,
      slotId: `slot:${stageId}`,
      width: 400,
      height: 225,
      sourceCanvas,
      materializeToCanvas: vi.fn((target?: HTMLCanvasElement | null) => target ?? sourceCanvas),
      cloneToCanvas: vi.fn((target?: HTMLCanvasElement | null) => target ?? createSnapshotCanvas()),
    },
  };
};

const presets = {
  default: {
    carrierTransforms: [],
    effects: [
      {
        id: "finalize-filter",
        type: "filter2d" as const,
        enabled: true,
        placement: "finalize" as const,
        params: { brightness: 0, hue: 0, blur: 0, dilate: 0 },
      },
    ],
  },
  ascii: {
    carrierTransforms: [
      {
        id: "ascii-primary",
        type: "ascii" as const,
        enabled: true,
        analysisSource: "style" as const,
        params: {
          renderMode: "glyph" as const,
          preset: "blocks" as const,
          customCharset: null,
          cellSize: 10,
          characterSpacing: 1.25,
          density: 1,
          coverage: 1,
          edgeEmphasis: 0,
          brightness: 0,
          contrast: 1.6,
          dither: "floyd-steinberg" as const,
          colorMode: "full-color" as const,
          foregroundOpacity: 1,
          foregroundBlendMode: "source-over" as const,
          backgroundMode: "cell-solid" as const,
          backgroundBlur: 0,
          backgroundOpacity: 1,
          backgroundColor: "#000000",
          invert: false,
          gridOverlay: false,
        },
      },
    ],
    effects: [],
  },
  film: {
    carrierTransforms: [],
    effects: [
      {
        id: "develop-filter",
        type: "filter2d" as const,
        enabled: true,
        placement: "develop" as const,
        params: { brightness: 4, hue: 0, blur: 0, dilate: 0 },
      },
    ],
  },
} as const;

type PresetName = keyof typeof presets;

const assets = {
  small: { assetId: "asset-small", width: 400, height: 225, name: "asset-small.jpg" },
  wide: { assetId: "asset-wide", width: 1600, height: 900, name: "asset-wide.jpg" },
} as const;

type AssetName = keyof typeof assets;

const createDocument = (assetName: AssetName, presetName: PresetName): ImageRenderDocument => {
  const asset = assets[assetName];
  const preset = presets[presetName];
  return createImageRenderDocument({
    id: `board:${assetName}:${presetName}`,
    source: {
      assetId: asset.assetId,
      objectUrl: `blob:${asset.assetId}`,
      contentHash: null,
      name: asset.name,
      mimeType: "image/jpeg",
      width: asset.width,
      height: asset.height,
    },
    ...createDefaultCanvasImageRenderState(),
    masks: { byId: {} },
    carrierTransforms: [...preset.carrierTransforms],
    effects: [...preset.effects],
    output: {
      timestamp: { enabled: false, position: "top-left", size: 18, opacity: 70 },
    },
  });
};

const request = (): ImageRenderRequest => ({
  qualityTier: "interactive",
  targetSize: { width: 400, height: 225 },
  debug: { trace: true },
});

const ceilings: Record<
  PresetName,
  { textureUploads: number; canvasClones: number; canvasMaterializations: number }
> = {
  default: { textureUploads: 1, canvasClones: 0, canvasMaterializations: 1 },
  ascii: { textureUploads: 1, canvasClones: 1, canvasMaterializations: 1 },
  film: { textureUploads: 2, canvasClones: 0, canvasMaterializations: 1 },
};

describe("imageProcessing boundary ceilings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renderDevelopBaseToSurfaceMock.mockImplementation(async () => createStageResult("develop-base"));
    renderFilmStageToSurfaceMock.mockImplementation(async () => createStageResult("film-stage"));
    renderImageToSurfaceMock.mockImplementation(async () => createStageResult("full"));
    applyImageCarrierTransformsMock.mockImplementation(async ({ surface }) => surface);
    applyImageEffectsMock.mockImplementation(async ({ surface }) => surface);
    applyImageOverlaysMock.mockImplementation(async ({ surface }) => surface);
    vi.stubGlobal("document", {
      createElement: vi.fn(() => createSnapshotCanvas()),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as { __filmlab_lastBoundaries?: RenderBoundaryMetrics })
      .__filmlab_lastBoundaries;
  });

  for (const assetName of Object.keys(assets) as AssetName[]) {
    for (const presetName of Object.keys(presets) as PresetName[]) {
      const ceiling = ceilings[presetName];
      it(`holds ceiling for asset=${assetName} preset=${presetName}`, async () => {
        const result = await renderSingleImageToCanvas({
          canvas: createCanvas(),
          document: createDocument(assetName, presetName),
          request: request(),
        });

        const boundaries = result.debug?.boundaries;
        expect(boundaries).toBeDefined();
        expect(boundaries!.textureUploads).toBeLessThanOrEqual(ceiling.textureUploads);
        expect(boundaries!.canvasClones).toBe(ceiling.canvasClones);
        expect(boundaries!.canvasMaterializations).toBeLessThanOrEqual(
          ceiling.canvasMaterializations
        );
        expect(boundaries!.cpuPixelReads).toBe(0);
      });
    }
  }

  it("publishes the last boundaries snapshot on globalThis in dev", async () => {
    await renderSingleImageToCanvas({
      canvas: createCanvas(),
      document: createDocument("small", "default"),
      request: request(),
    });

    const snapshot = (
      globalThis as { __filmlab_lastBoundaries?: RenderBoundaryMetrics }
    ).__filmlab_lastBoundaries;
    expect(snapshot).toEqual({
      textureUploads: 1,
      canvasMaterializations: 1,
      canvasClones: 0,
      cpuPixelReads: 0,
    });
  });
});
