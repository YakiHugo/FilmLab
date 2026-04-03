import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMaskedStageOperationToSurfaceIfSupported } from "./stageMaskComposite";

const buildImageRenderMaskRevisionKeyMock = vi.fn(() => "mask-revision");
const renderImageEffectMaskToCanvasMock = vi.fn();
const blendMaskedCanvasesOnGpuToSurfaceMock = vi.fn();

vi.mock("./effectMask", () => ({
  buildImageRenderMaskRevisionKey: (...args: unknown[]) =>
    Reflect.apply(buildImageRenderMaskRevisionKeyMock, undefined, args),
  renderImageEffectMaskToCanvas: (...args: unknown[]) =>
    Reflect.apply(renderImageEffectMaskToCanvasMock, undefined, args),
}));

vi.mock("@/lib/renderer/gpuMaskedCanvasBlend", () => ({
  blendMaskedCanvasesOnGpu: vi.fn(),
  blendMaskedCanvasesOnGpuToSurface: (...args: unknown[]) =>
    Reflect.apply(blendMaskedCanvasesOnGpuToSurfaceMock, undefined, args),
}));

const createCanvas = () =>
  ({
    width: 128,
    height: 72,
    getContext: vi.fn(() => null),
  }) as unknown as HTMLCanvasElement;

const createSurface = (slotId: string) =>
  ({
    kind: "renderer-slot",
    mode: "preview",
    slotId,
    width: 128,
    height: 72,
    sourceCanvas: createCanvas(),
    materializeToCanvas: vi.fn(),
    cloneToCanvas: vi.fn(),
  }) as const;

describe("stageMaskComposite.applyMaskedStageOperationToSurfaceIfSupported", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renderImageEffectMaskToCanvasMock.mockImplementation(async ({ targetCanvas }) => targetCanvas ?? createCanvas());
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => null),
      })),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the surface operation result directly when no mask is present", async () => {
    const baseSurface = createSurface("slot:base");
    const effectSurface = createSurface("slot:effect");
    const applyOperation = vi.fn(async () => effectSurface);

    const result = await applyMaskedStageOperationToSurfaceIfSupported({
      surface: baseSurface,
      maskDefinition: null,
      applyOperation,
    });

    expect(result).toBe(effectSurface);
    expect(applyOperation).toHaveBeenCalledWith({
      surface: baseSurface,
      maskRevisionKey: null,
    });
    expect(renderImageEffectMaskToCanvasMock).not.toHaveBeenCalled();
    expect(blendMaskedCanvasesOnGpuToSurfaceMock).not.toHaveBeenCalled();
  });

  it("renders the mask canvas and blends masked surface output on GPU", async () => {
    const baseSurface = createSurface("slot:base");
    const effectSurface = createSurface("slot:effect");
    const blendedSurface = createSurface("slot:blended");
    blendMaskedCanvasesOnGpuToSurfaceMock.mockResolvedValueOnce(blendedSurface);
    const applyOperation = vi.fn(async () => effectSurface);
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
      },
    };
    const referenceCanvas = createCanvas();

    const result = await applyMaskedStageOperationToSurfaceIfSupported({
      surface: baseSurface,
      maskDefinition,
      maskReferenceCanvas: referenceCanvas,
      blendSlotId: "carrier-mask:ascii-1",
      applyOperation,
    });

    expect(result).toBe(blendedSurface);
    expect(buildImageRenderMaskRevisionKeyMock).toHaveBeenCalledWith(maskDefinition);
    expect(applyOperation).toHaveBeenCalledWith({
      surface: baseSurface,
      maskRevisionKey: "mask-revision",
    });
    expect(renderImageEffectMaskToCanvasMock).toHaveBeenCalledWith(
      expect.objectContaining({
        width: effectSurface.width,
        height: effectSurface.height,
        maskDefinition,
        referenceSource: referenceCanvas,
      })
    );
    expect(blendMaskedCanvasesOnGpuToSurfaceMock).toHaveBeenCalledWith({
      baseCanvas: baseSurface.sourceCanvas,
      layerCanvas: effectSurface.sourceCanvas,
      maskCanvas: expect.any(Object),
      slotId: "carrier-mask:ascii-1",
    });
  });
});
