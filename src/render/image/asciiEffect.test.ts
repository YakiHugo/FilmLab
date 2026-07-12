import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import {
  applyImageAsciiCarrierTransform,
  applyImageCarrierTransforms,
  normalizeImageAsciiEffectParams,
} from "./asciiEffect";

const applyMaskedStageOperationToSurfaceIfSupportedMock = vi.fn();

vi.mock("./stageMaskComposite", () => ({
  applyMaskedStageOperationToSurfaceIfSupported: (...args: unknown[]) =>
    Reflect.apply(applyMaskedStageOperationToSurfaceIfSupportedMock, undefined, args),
}));

const applyAsciiCarrierOnSurfaceMock = vi.fn();

vi.mock("@/lib/gpu/passes/carrier/ascii", () => ({
  applyAsciiCarrierOnSurface: (...args: unknown[]) =>
    Reflect.apply(applyAsciiCarrierOnSurfaceMock, undefined, args),
}));

const createMockImageData = (width: number, height: number) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128;
    data[i + 1] = 128;
    data[i + 2] = 128;
    data[i + 3] = 255;
  }
  return { data, width, height };
};

const createMockContext = () => ({
  arc: vi.fn(),
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => createMockImageData(w, h)),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  stroke: vi.fn(),
  set fillStyle(_value: string) {},
  set filter(_value: string) {},
  set font(_value: string) {},
  set globalAlpha(_value: number) {},
  set globalCompositeOperation(_value: GlobalCompositeOperation) {},
  set imageSmoothingQuality(_value: ImageSmoothingQuality) {},
  set lineWidth(_value: number) {},
  set strokeStyle(_value: string) {},
  set textAlign(_value: CanvasTextAlign) {},
  set textBaseline(_value: CanvasTextBaseline) {},
});

const createMockCanvas = ({
  width = 12,
  height = 12,
  context = createMockContext(),
}: {
  width?: number;
  height?: number;
  context?: ReturnType<typeof createMockContext>;
} = {}) =>
  ({
    width,
    height,
    getContext: vi.fn(() => context),
  }) as unknown as HTMLCanvasElement;

const createMockSurface = (canvas: HTMLCanvasElement): RenderSurfaceHandle =>
  ({
    kind: "renderer-slot",
    mode: "preview",
    slotId: "preview-main",
    width: canvas.width,
    height: canvas.height,
    sourceCanvas: canvas,
    materializeToCanvas: vi.fn(() => canvas),
    cloneToCanvas: vi.fn(() => canvas),
  }) as unknown as RenderSurfaceHandle;

const createAsciiTransform = () => ({
  id: "ascii-test",
  type: "ascii" as const,
  enabled: true,
  analysisSource: "style" as const,
  params: {
    renderMode: "glyph" as const,
    preset: "standard" as const,
    customCharset: null,
    cellSize: 12,
    characterSpacing: 1,
    density: 1,
    coverage: 1,
    edgeEmphasis: 0,
    brightness: 0,
    contrast: 1,
    dither: "none" as const,
    colorMode: "grayscale" as const,
    foregroundOpacity: 1,
    foregroundBlendMode: "source-over" as const,
    backgroundMode: "cell-solid" as const,
    backgroundBlur: 0,
    backgroundOpacity: 1,
    backgroundColor: "#000000",
    invert: false,
    gridOverlay: false,
    structureWeight: 0,
  },
});

describe("asciiEffect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyMaskedStageOperationToSurfaceIfSupportedMock.mockImplementation(
      async ({
        surface,
        maskDefinition,
        applyOperation,
      }: {
        surface: RenderSurfaceHandle;
        maskDefinition: { id: string } | null;
        applyOperation: (args: {
          surface: RenderSurfaceHandle;
          maskRevisionKey: string | null;
        }) => Promise<RenderSurfaceHandle | null>;
      }) => {
        if (!maskDefinition) {
          return applyOperation({ surface, maskRevisionKey: null });
        }
        return applyOperation({ surface, maskRevisionKey: `mask:${maskDefinition.id}` });
      }
    );
    applyAsciiCarrierOnSurfaceMock.mockImplementation(
      async ({ surface }: { surface: RenderSurfaceHandle }) => surface
    );
    vi.stubGlobal("document", {
      createElement: vi.fn(() => createMockCanvas()),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes and clamps the ascii carrier params", () => {
    const normalized = normalizeImageAsciiEffectParams({
      renderMode: "dot",
      preset: "custom",
      customCharset: "XYZ.",
      cellSize: 2,
      characterSpacing: 3,
      density: -1,
      coverage: 4,
      edgeEmphasis: 2,
      brightness: 180,
      contrast: 0,
      dither: "floyd-steinberg",
      colorMode: "duotone",
      foregroundOpacity: 3,
      foregroundBlendMode: "multiply",
      backgroundMode: "blurred-source",
      backgroundBlur: 140,
      backgroundOpacity: -1,
      backgroundColor: "#abc",
      invert: true,
      gridOverlay: true,
      structureWeight: 0,
    });

    expect(normalized).toMatchObject({
      renderMode: "dot",
      preset: "custom",
      cellSize: 4,
      characterSpacing: 2,
      density: 0.1,
      coverage: 1,
      edgeEmphasis: 1,
      brightness: 100,
      contrast: 0.25,
      colorMode: "duotone",
      foregroundOpacity: 1,
      backgroundMode: "blurred-source",
      backgroundBlur: 100,
      backgroundOpacity: 0,
      backgroundColor: "#aabbcc",
      invert: true,
      gridOverlay: true,
    });
  });

  it("delegates a single ASCII transform to applyAsciiCarrierOnSurface", async () => {
    const targetSize = { width: 48, height: 48 };
    const baseSurface = createMockSurface(createMockCanvas(targetSize));
    const sourceCanvas = createMockCanvas(targetSize);
    const nextSurface = createMockSurface(createMockCanvas(targetSize));
    applyAsciiCarrierOnSurfaceMock.mockResolvedValueOnce(nextSurface);

    const result = await applyImageAsciiCarrierTransform({
      baseSurface,
      sourceCanvas,
      transform: createAsciiTransform(),
      quality: "quality",
      targetSize,
    });

    expect(result).toBe(nextSurface);
    expect(applyAsciiCarrierOnSurfaceMock).toHaveBeenCalledTimes(1);
    const call = applyAsciiCarrierOnSurfaceMock.mock.calls[0]?.[0] as {
      surface: RenderSurfaceHandle;
      params: {
        sourceCanvas: HTMLCanvasElement;
        width: number;
        height: number;
        columns: number;
        rows: number;
        foregroundBlendMode: string;
        backgroundMode: string;
        ditherMode: string;
      };
    };
    expect(call.surface).toBe(baseSurface);
    expect(call.params.sourceCanvas).toBe(sourceCanvas);
    expect(call.params.width).toBe(targetSize.width);
    expect(call.params.height).toBe(targetSize.height);
    expect(call.params.columns).toBeGreaterThan(0);
    expect(call.params.rows).toBeGreaterThan(0);
    expect(call.params.foregroundBlendMode).toBe("normal");
    expect(call.params.backgroundMode).toBe("cell-solid");
    expect(call.params.ditherMode).toBe("none");
  });

  it("keeps the authored grid topology while physical density changes", async () => {
    const referenceSize = { width: 1080, height: 1350 };
    const transform = {
      ...createAsciiTransform(),
      params: { ...createAsciiTransform().params, gridOverlay: true },
    };

    for (const targetSize of [referenceSize, { width: 2160, height: 2700 }]) {
      const surface = createMockSurface(createMockCanvas(targetSize));
      applyAsciiCarrierOnSurfaceMock.mockResolvedValueOnce(surface);
      await applyImageAsciiCarrierTransform({
        baseSurface: surface,
        compositionReferenceSize: referenceSize,
        sourceCanvas: createMockCanvas(targetSize),
        transform,
        quality: "export",
        targetSize,
      });
    }

    const oneX = applyAsciiCarrierOnSurfaceMock.mock.calls[0]?.[0].params;
    const twoX = applyAsciiCarrierOnSurfaceMock.mock.calls[1]?.[0].params;
    expect(twoX.columns).toBe(oneX.columns);
    expect(twoX.rows).toBe(oneX.rows);
    expect(twoX.cellWidth).toBeCloseTo(oneX.cellWidth * 2);
    expect(twoX.cellHeight).toBeCloseTo(oneX.cellHeight * 2);
    expect(oneX.gridOverlayWidth).toBe(1);
    expect(twoX.gridOverlayWidth).toBe(2);
  });

  it("propagates the surface result from applyImageCarrierTransforms", async () => {
    const targetSize = { width: 128, height: 72 };
    const initialSurface = createMockSurface(createMockCanvas(targetSize));
    const nextSurface = createMockSurface(createMockCanvas(targetSize));
    applyAsciiCarrierOnSurfaceMock.mockResolvedValueOnce(nextSurface);

    const result = await applyImageCarrierTransforms({
      surface: initialSurface,
      carrierTransforms: [
        { ...createAsciiTransform(), id: "ascii-1", analysisSource: "style" as const },
      ],
      document: { sourceRevisionKey: "rev-1", masks: { byId: {} } } as never,
      request: { qualityTier: "interactive", targetSize } as never,
      analysisInputs: {
        stageSnapshots: { develop: null, style: createMockCanvas(targetSize) },
        edgeMap: null,
      },
    });

    expect(result).toBe(nextSurface);
    expect(applyAsciiCarrierOnSurfaceMock).toHaveBeenCalledTimes(1);
    expect(applyAsciiCarrierOnSurfaceMock.mock.calls[0]?.[0]).toMatchObject({
      surface: initialSurface,
    });
  });

  it("throws when the GPU helper declines the render", async () => {
    const targetSize = { width: 128, height: 72 };
    const initialSurface = createMockSurface(createMockCanvas(targetSize));
    applyAsciiCarrierOnSurfaceMock.mockResolvedValueOnce(null);

    await expect(
      applyImageCarrierTransforms({
        surface: initialSurface,
        carrierTransforms: [
          { ...createAsciiTransform(), id: "ascii-null", analysisSource: "style" as const },
        ],
        document: { sourceRevisionKey: "rev-1", masks: { byId: {} } } as never,
        request: { qualityTier: "interactive", targetSize } as never,
        analysisInputs: {
          stageSnapshots: { develop: null, style: createMockCanvas(targetSize) },
          edgeMap: null,
        },
      })
    ).rejects.toThrow(/Carrier GPU pass failed/);
  });

  it("routes masked carriers through applyMaskedStageOperationToSurfaceIfSupported", async () => {
    const targetSize = { width: 128, height: 72 };
    const initialSurface = createMockSurface(createMockCanvas(targetSize));
    const nextSurface = createMockSurface(createMockCanvas(targetSize));
    applyAsciiCarrierOnSurfaceMock.mockResolvedValueOnce(nextSurface);

    const transform = createAsciiTransform();
    await applyImageCarrierTransforms({
      surface: initialSurface,
      carrierTransforms: [
        { ...transform, id: "ascii-1", analysisSource: "style" as const, maskId: "mask-1" },
      ],
      document: {
        sourceRevisionKey: "rev-1",
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
      } as never,
      request: { qualityTier: "interactive", targetSize } as never,
      analysisInputs: {
        stageSnapshots: { develop: null, style: createMockCanvas(targetSize) },
        edgeMap: null,
      },
    });

    expect(applyMaskedStageOperationToSurfaceIfSupportedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maskDefinition: expect.objectContaining({ id: "mask-1" }),
        blendSlotId: "carrier-mask:ascii-1",
      })
    );
  });
});
