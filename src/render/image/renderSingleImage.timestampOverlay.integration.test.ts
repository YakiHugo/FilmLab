import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultCanvasImageRenderState } from "./stateCompiler";
import { createImageRenderDocument } from "./types";
import { normalizeTimestampOverlayText } from "@/lib/timestampOverlay";
import { renderSingleImageToCanvas } from "./renderSingleImage";

const renderImageToSurfaceMock = vi.fn();
const blendCanvasLayerOnGpuToSurfaceMock = vi.fn();
const applyTimestampOverlayOnGpuMock = vi.fn();
const applyTimestampOverlayOnGpuToSurfaceMock = vi.fn();

vi.mock("@/lib/imageProcessing", () => ({
  renderDevelopBaseToSurface: vi.fn(),
  renderFilmStageToSurface: vi.fn(),
  renderImageToSurface: (...args: unknown[]) =>
    Reflect.apply(renderImageToSurfaceMock, undefined, args),
}));

vi.mock("./carrierExecution", () => ({
  applyImageCarrierTransforms: vi.fn(),
  applyImageCarrierTransformsToSurfaceIfSupported: vi.fn(),
}));

vi.mock("./effectExecution", () => ({
  applyImageEffects: vi.fn(),
  applyImageEffectsToSurfaceIfSupported: vi.fn(),
}));

vi.mock("@/lib/renderer/gpuCanvasLayerBlend", () => ({
  blendCanvasLayerOnGpu: vi.fn(),
  blendCanvasLayerOnGpuToSurface: (...args: unknown[]) =>
    Reflect.apply(blendCanvasLayerOnGpuToSurfaceMock, undefined, args),
}));

vi.mock("@/lib/renderer/gpuTimestampOverlay", () => ({
  applyTimestampOverlayOnGpu: (...args: unknown[]) =>
    Reflect.apply(applyTimestampOverlayOnGpuMock, undefined, args),
  applyTimestampOverlayOnGpuToSurface: (...args: unknown[]) =>
    Reflect.apply(applyTimestampOverlayOnGpuToSurfaceMock, undefined, args),
}));

const createMockContext = () => ({
  clearRect: vi.fn(),
  createImageData: vi.fn((width: number, height: number) => ({
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
  })),
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  getImageData: vi.fn((_: number, __: number, width: number, height: number) => ({
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
  })),
  measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
  putImageData: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  set fillStyle(_value: string) {},
  set filter(_value: string) {},
  set font(_value: string) {},
  set globalAlpha(_value: number) {},
  set textAlign(_value: CanvasTextAlign) {},
  set textBaseline(_value: CanvasTextBaseline) {},
});

const createCanvas = ({
  width = 400,
  height = 225,
  context = createMockContext(),
}: {
  width?: number;
  height?: number;
  context?: ReturnType<typeof createMockContext>;
} = {}) =>
  ({
    width,
    height,
    context2d: context,
    getContext: vi.fn(() => context),
  }) as unknown as HTMLCanvasElement & {
    context2d: ReturnType<typeof createMockContext>;
  };

const createStageResult = (sourceCanvas: HTMLCanvasElement) => ({
  stageId: "full" as const,
  surface: {
    kind: "renderer-slot" as const,
    mode: "preview" as const,
    slotId: "slot:full",
    width: sourceCanvas.width,
    height: sourceCanvas.height,
    sourceCanvas,
    materializeToCanvas: vi.fn((targetCanvas?: HTMLCanvasElement | null) => targetCanvas ?? createCanvas()),
    cloneToCanvas: vi.fn((targetCanvas?: HTMLCanvasElement | null) => targetCanvas ?? createCanvas()),
  },
});

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
    ...createDefaultCanvasImageRenderState(),
    carrierTransforms: [],
    effects: [],
    output: {
      timestamp: {
        enabled: true,
        position: "top-left",
        size: 18,
        opacity: 70,
      },
    },
  });

describe("renderSingleImageToCanvas timestamp overlay integration", () => {
  let createdCanvases: Array<
    HTMLCanvasElement & {
      context2d: ReturnType<typeof createMockContext>;
    }
  >;

  beforeEach(() => {
    createdCanvases = [];
    vi.clearAllMocks();
    applyTimestampOverlayOnGpuMock.mockResolvedValue(false);
    applyTimestampOverlayOnGpuToSurfaceMock.mockResolvedValue(null);
    blendCanvasLayerOnGpuToSurfaceMock.mockResolvedValue(null);
    renderImageToSurfaceMock.mockResolvedValue(createStageResult(createCanvas()));
    vi.stubGlobal("document", {
      fonts: {
        load: vi.fn(() => Promise.resolve([])),
      },
      createElement: vi.fn(() => {
        const canvas = createCanvas();
        createdCanvases.push(canvas);
        return canvas;
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the same normalized timestamp text when renderSingleImage falls back to CPU overlays", async () => {
    const longText =
      "2026.04.08 19:42:51 UTC+08 LONG TIMESTAMP TEXT SHOULD TRUNCATE THE SAME WAY ON BOTH PATHS";
    const normalized = normalizeTimestampOverlayText(longText);

    await renderSingleImageToCanvas({
      canvas: createCanvas(),
      document: createDocument(),
      request: {
        intent: "preview",
        quality: "interactive",
        targetSize: {
          width: 400,
          height: 225,
        },
        timestampText: longText,
      },
    });

    expect(applyTimestampOverlayOnGpuToSurfaceMock).toHaveBeenCalledTimes(1);
    expect(applyTimestampOverlayOnGpuMock).toHaveBeenCalledTimes(1);
    expect(
      createdCanvases.some((canvas) =>
        canvas.context2d.fillText.mock.calls.some(([text]) => text === normalized)
      )
    ).toBe(true);
  });
});
