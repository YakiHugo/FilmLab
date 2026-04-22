import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const BASELINE_CANVAS_WIDTH = 4;
const BASELINE_CANVAS_HEIGHT = 4;

const fillBytesFromSeed = (seed: string, length: number): Uint8ClampedArray => {
  let state = 0x811c9dc5 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  const bytes = new Uint8ClampedArray(length);
  for (let i = 0; i < length; i++) {
    state ^= i + 1;
    state = Math.imul(state, 0x01000193) >>> 0;
    bytes[i] = state & 0xff;
  }
  return bytes;
};

const createSeededSourceCanvas = (seed: string) => {
  const pixelCount = BASELINE_CANVAS_WIDTH * BASELINE_CANVAS_HEIGHT * 4;
  let bytes = fillBytesFromSeed(seed, pixelCount);
  return {
    width: BASELINE_CANVAS_WIDTH,
    height: BASELINE_CANVAS_HEIGHT,
    __setBytes(nextBytes: Uint8ClampedArray | number[]) {
      const array =
        nextBytes instanceof Uint8ClampedArray
          ? nextBytes
          : Uint8ClampedArray.from(nextBytes);
      if (array.length === pixelCount) {
        bytes = new Uint8ClampedArray(array);
      } else {
        const resized = new Uint8ClampedArray(pixelCount);
        resized.set(array.subarray(0, pixelCount));
        bytes = resized;
      }
    },
    __getBytes() {
      return new Uint8ClampedArray(bytes);
    },
    getContext: vi.fn(() => ({
      getImageData: vi.fn((_: number, __: number, w: number, h: number) => ({
        data: bytes,
        width: w,
        height: h,
      })),
      putImageData: vi.fn(),
      createImageData: vi.fn((w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      })),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    })),
  };
};

type SeededCanvas = ReturnType<typeof createSeededSourceCanvas>;

const createHashableTargetCanvas = () => createSeededSourceCanvas("baseline-target");

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
  activePasses:
    stageId === "develop-base"
      ? ["geometry", "master"]
      : stageId === "film-stage"
        ? ["film", "optics"]
        : ["geometry", "master", "film", "optics"],
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
  seed: string
) => {
  const sourceCanvas = createSeededSourceCanvas(`${stageId}:${seed}`);
  const copyBytesTo = (target?: HTMLCanvasElement | null) => {
    const output = (target ?? createSeededSourceCanvas("fallback")) as unknown as SeededCanvas;
    if (typeof output.__setBytes === "function") {
      output.__setBytes(sourceCanvas.__getBytes());
    }
    return output as unknown as HTMLCanvasElement;
  };
  return {
    stageId,
    debug: createStageDebug(stageId, createStageBoundaries()),
    surface: {
      kind: "renderer-slot" as const,
      mode: "preview" as const,
      slotId: `slot:${stageId}`,
      width: BASELINE_CANVAS_WIDTH,
      height: BASELINE_CANVAS_HEIGHT,
      sourceCanvas: sourceCanvas as unknown as HTMLCanvasElement,
      materializeToCanvas: vi.fn(copyBytesTo),
      cloneToCanvas: vi.fn(copyBytesTo),
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
    id: `baseline:${assetName}:${presetName}`,
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
  intent: "preview",
  quality: "interactive",
  targetSize: { width: 400, height: 225 },
  debug: { trace: true, outputHash: true },
});

const baselineDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../test-assets/baselines"
);

const readBaseline = (assetName: AssetName, presetName: PresetName) => {
  const file = path.join(baselineDir, `${assetName}.${presetName}.json`);
  if (!existsSync(file)) {
    return null;
  }
  return JSON.parse(readFileSync(file, "utf-8")) as unknown;
};

const writeBaseline = (assetName: AssetName, presetName: PresetName, payload: unknown) => {
  mkdirSync(baselineDir, { recursive: true });
  const file = path.join(baselineDir, `${assetName}.${presetName}.json`);
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
};

describe("renderSingleImageToCanvas baseline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renderDevelopBaseToSurfaceMock.mockImplementation(async (opts: { seedKey: string }) =>
      createStageResult("develop-base", opts.seedKey)
    );
    renderFilmStageToSurfaceMock.mockImplementation(async (opts: { seedKey: string }) =>
      createStageResult("film-stage", opts.seedKey)
    );
    renderImageToSurfaceMock.mockImplementation(async (opts: { seedKey: string }) =>
      createStageResult("full", opts.seedKey)
    );
    applyImageCarrierTransformsMock.mockImplementation(async ({ surface }) => surface);
    applyImageEffectsMock.mockImplementation(async ({ surface }) => surface);
    applyImageOverlaysMock.mockImplementation(async ({ surface }) => surface);
    vi.stubGlobal("document", {
      createElement: vi.fn(() => createSeededSourceCanvas("document-create-element")),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as { __filmlab_lastBoundaries?: RenderBoundaryMetrics })
      .__filmlab_lastBoundaries;
  });

  for (const assetName of Object.keys(assets) as AssetName[]) {
    for (const presetName of Object.keys(presets) as PresetName[]) {
      it(`matches baseline for asset=${assetName} preset=${presetName}`, async () => {
        const canvas = createHashableTargetCanvas();
        const result = await renderSingleImageToCanvas({
          canvas: canvas as unknown as HTMLCanvasElement,
          document: createDocument(assetName, presetName),
          request: request(),
        });

        const payload = {
          stages: result.debug?.stages ?? [],
          outputHash: result.debug?.outputHash ?? null,
          boundaries: result.debug?.boundaries ?? null,
        };

        if (process.env.UPDATE_BASELINES === "1") {
          writeBaseline(assetName, presetName, payload);
        }

        const expected = readBaseline(assetName, presetName);
        expect(
          expected,
          `missing baseline for ${assetName}.${presetName}; run with UPDATE_BASELINES=1 to create`
        ).not.toBeNull();
        expect(payload).toEqual(expected);
      });
    }
  }
});
