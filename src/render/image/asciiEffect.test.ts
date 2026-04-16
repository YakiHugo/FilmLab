import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import {
  applyImageAsciiCarrierTransform,
  applyImageCarrierTransforms,
  applyImageCarrierTransformsToSurfaceIfSupported,
  normalizeImageAsciiEffectParams,
} from "./asciiEffect";

const applyMaskedStageOperationMock = vi.fn();
const applyMaskedStageOperationToSurfaceIfSupportedMock = vi.fn();

vi.mock("./stageMaskComposite", () => ({
  applyMaskedStageOperation: (...args: unknown[]) =>
    Reflect.apply(applyMaskedStageOperationMock, undefined, args),
  applyMaskedStageOperationToSurfaceIfSupported: (...args: unknown[]) =>
    Reflect.apply(applyMaskedStageOperationToSurfaceIfSupportedMock, undefined, args),
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
  getImageData: vi.fn((x: number, y: number, w: number, h: number) =>
    createMockImageData(w, h)
  ),
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
} = {}) => ({
  width,
  height,
  getContext: vi.fn(() => context),
}) as unknown as HTMLCanvasElement;

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
  },
});

describe("asciiEffect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyMaskedStageOperationMock.mockImplementation(
      async ({ applyOperation, canvas }: { applyOperation: (args: { canvas: HTMLCanvasElement; maskRevisionKey: string | null }) => Promise<void>; canvas: HTMLCanvasElement }) =>
        applyOperation({ canvas, maskRevisionKey: null })
    );
    applyMaskedStageOperationToSurfaceIfSupportedMock.mockImplementation(
      async ({ surface, maskDefinition, applyOperation }: { surface: RenderSurfaceHandle; maskDefinition: { id: string } | null; applyOperation: (args: { surface: RenderSurfaceHandle; maskRevisionKey: string | null }) => Promise<RenderSurfaceHandle | null> }) => {
        if (!maskDefinition) {
          return applyOperation({ surface, maskRevisionKey: null });
        }
        return applyOperation({ surface, maskRevisionKey: `mask:${maskDefinition.id}` });
      }
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

  it("renders ASCII effect onto target canvas via Canvas2D", async () => {
    const targetContext = createMockContext();
    const targetCanvas = createMockCanvas({ width: 48, height: 48, context: targetContext });
    const sourceCanvas = createMockCanvas({ width: 48, height: 48 });

    const didApply = await applyImageAsciiCarrierTransform({
      targetCanvas,
      sourceCanvas,
      transform: createAsciiTransform(),
      quality: "full",
      sourceRevisionKey: "rev-1",
      targetSize: { width: 48, height: 48 },
    });

    expect(didApply).toBe(true);
  });

  it("passes export mode through the canvas carrier path", async () => {
    const targetSize = { width: 128, height: 72 };
    const canvas = createMockCanvas({ width: targetSize.width, height: targetSize.height });

    await applyImageCarrierTransforms({
      canvas,
      carrierTransforms: [
        { ...createAsciiTransform(), id: "ascii-export", analysisSource: "style" as const },
      ],
      document: { sourceRevisionKey: "rev-1", masks: { byId: {} } } as never,
      request: { intent: "export", quality: "full", targetSize } as never,
      snapshots: {
        develop: null,
        style: createMockCanvas({ width: targetSize.width, height: targetSize.height }),
      },
    });

    // applyImageCarrierTransform was called (canvas2D path)
    expect(canvas.getContext).toHaveBeenCalled();
  });

  it("returns null from the surface path since GPU ASCII is disabled", async () => {
    const targetSize = { width: 128, height: 72 };
    const initialSurface = {
      sourceCanvas: createMockCanvas({ width: targetSize.width, height: targetSize.height }),
      mode: "preview",
    } as unknown as RenderSurfaceHandle;

    const result = await applyImageCarrierTransformsToSurfaceIfSupported({
      surface: initialSurface,
      carrierTransforms: [
        { ...createAsciiTransform(), id: "ascii-1", analysisSource: "style" as const },
      ],
      document: { sourceRevisionKey: "rev-1", masks: { byId: {} } } as never,
      request: { intent: "preview", quality: "interactive", targetSize } as never,
      snapshots: {
        develop: null,
        style: createMockCanvas({ width: targetSize.width, height: targetSize.height }),
      },
    });

    // applyImageAsciiCarrierTransformToSurfaceIfSupported always returns null,
    // so the orchestrator returns null to signal canvas fallback.
    expect(result).toBeNull();
  });

  it("supports masked carriers through the stage mask path", async () => {
    const targetSize = { width: 128, height: 72 };
    const canvas = createMockCanvas({ width: targetSize.width, height: targetSize.height });

    const transform = createAsciiTransform();
    await applyImageCarrierTransforms({
      canvas,
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
              mask: { mode: "radial", centerX: 0.5, centerY: 0.5, radiusX: 0.3, radiusY: 0.3, feather: 0.2 },
            },
          },
        },
      } as never,
      request: { intent: "preview", quality: "interactive", targetSize } as never,
      snapshots: {
        develop: null,
        style: createMockCanvas({ width: targetSize.width, height: targetSize.height }),
      },
    });

    expect(applyMaskedStageOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maskDefinition: expect.objectContaining({ id: "mask-1" }),
      })
    );
  });
});
