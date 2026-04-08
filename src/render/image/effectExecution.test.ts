import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const applyFilter2dOnGpuMock = vi.fn();
const applyFilter2dOnGpuToSurfaceMock = vi.fn();
const applyFilter2dPostProcessingMock = vi.fn();
const applyMaskedStageOperationMock = vi.fn();
const blendMaskedCanvasesOnGpuToSurfaceMock = vi.fn();
const renderImageEffectMaskToCanvasMock = vi.fn();

vi.mock("@/lib/renderer/gpuFilter2dPostProcessing", () => ({
  applyFilter2dOnGpu: (...args: unknown[]) => Reflect.apply(applyFilter2dOnGpuMock, null, args),
  applyFilter2dOnGpuToSurface: (...args: unknown[]) =>
    Reflect.apply(applyFilter2dOnGpuToSurfaceMock, null, args),
}));

vi.mock("@/lib/renderer/gpuMaskedCanvasBlend", () => ({
  blendMaskedCanvasesOnGpuToSurface: (...args: unknown[]) =>
    Reflect.apply(blendMaskedCanvasesOnGpuToSurfaceMock, null, args),
}));

vi.mock("@/lib/filter2dPostProcessing", () => ({
  applyFilter2dPostProcessing: (...args: unknown[]) =>
    Reflect.apply(applyFilter2dPostProcessingMock, null, args),
}));

vi.mock("./stageMaskComposite", () => ({
  applyMaskedStageOperation: (...args: unknown[]) =>
    Reflect.apply(applyMaskedStageOperationMock, null, args),
}));

vi.mock("./effectMask", () => ({
  renderImageEffectMaskToCanvas: (...args: unknown[]) =>
    Reflect.apply(renderImageEffectMaskToCanvasMock, null, args),
}));

const createCanvas = () => ({ width: 128, height: 72 }) as HTMLCanvasElement;

const createDocument = () =>
  ({
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
            radiusX: 0.25,
            radiusY: 0.25,
            feather: 0.1,
          },
        },
      },
    },
  }) as const;

const createEffect = (overrides?: Partial<{
  id: string;
  maskId: string;
}>) => ({
  id: overrides?.id ?? "effect-1",
  type: "filter2d" as const,
  enabled: true,
  placement: "style" as const,
  ...(overrides?.maskId ? { maskId: overrides.maskId } : {}),
  params: {
    brightness: 20,
    hue: 10,
    blur: 15,
    dilate: 5,
  },
});

describe("effectExecution", () => {
  beforeEach(() => {
    applyFilter2dOnGpuMock.mockReset();
    applyFilter2dOnGpuToSurfaceMock.mockReset();
    applyFilter2dPostProcessingMock.mockReset();
    applyMaskedStageOperationMock.mockReset();
    blendMaskedCanvasesOnGpuToSurfaceMock.mockReset();
    renderImageEffectMaskToCanvasMock.mockReset();
    vi.stubGlobal("document", {
      createElement: vi.fn(() => createCanvas()),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers the GPU filter2d path for unmasked effects", async () => {
    const { applyImageEffects } = await import("./effectExecution");
    const canvas = createCanvas();
    applyFilter2dOnGpuMock.mockResolvedValue(true);

    await applyImageEffects({
      canvas,
      document: createDocument() as never,
      effects: [createEffect()],
    });

    expect(applyFilter2dOnGpuMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canvas,
        slotId: "filter2d:effect-1",
      })
    );
    expect(applyFilter2dPostProcessingMock).not.toHaveBeenCalled();
  });

  it("falls back to CPU filter2d processing when the GPU path is unavailable", async () => {
    const { applyImageEffects } = await import("./effectExecution");
    const canvas = createCanvas();
    applyFilter2dOnGpuMock.mockResolvedValue(false);

    await applyImageEffects({
      canvas,
      document: createDocument() as never,
      effects: [createEffect()],
    });

    expect(applyFilter2dPostProcessingMock).toHaveBeenCalledWith(
      canvas,
      expect.objectContaining({
        brightness: 20,
      })
    );
  });

  it("keeps masked effects on the masked-stage wrapper and still tries GPU filter2d inside it", async () => {
    const { applyImageEffects } = await import("./effectExecution");
    const canvas = createCanvas();
    const stageReferenceCanvas = createCanvas();
    applyFilter2dOnGpuMock.mockResolvedValue(true);
    applyMaskedStageOperationMock.mockImplementation(async ({ applyOperation, canvas: targetCanvas }) => {
      await applyOperation({
        canvas: targetCanvas,
        maskRevisionKey: "mask-revision",
      });
    });

    await applyImageEffects({
      canvas,
      document: createDocument() as never,
      effects: [createEffect({ id: "effect-2", maskId: "mask-1" })],
      stageReferenceCanvas,
    });

    expect(applyMaskedStageOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canvas,
        maskReferenceCanvas: stageReferenceCanvas,
      })
    );
    expect(applyFilter2dOnGpuMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slotId: "filter2d:effect-2",
      })
    );
  });

  it("can keep unmasked filter2d effects on renderer surfaces", async () => {
    const { applyImageEffectsToSurfaceIfSupported } = await import("./effectExecution");
    const initialSurface = {
      kind: "renderer-slot" as const,
      mode: "preview" as const,
      slotId: "slot:initial",
      width: 128,
      height: 72,
      sourceCanvas: createCanvas(),
      materializeToCanvas: vi.fn(),
      cloneToCanvas: vi.fn(),
    };
    const filteredSurface = {
      ...initialSurface,
      slotId: "slot:filtered",
      sourceCanvas: createCanvas(),
    };
    applyFilter2dOnGpuToSurfaceMock.mockResolvedValue(filteredSurface);

    const result = await applyImageEffectsToSurfaceIfSupported({
      surface: initialSurface,
      effects: [createEffect()],
    });

    expect(applyFilter2dOnGpuToSurfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: initialSurface,
        slotId: "filter2d:effect-1",
      })
    );
    expect(result).toBe(filteredSurface);
    expect(applyFilter2dOnGpuMock).not.toHaveBeenCalled();
    expect(applyFilter2dPostProcessingMock).not.toHaveBeenCalled();
  });

  it("rejects surface execution for masked effects", async () => {
    const { applyImageEffectsToSurfaceIfSupported } = await import("./effectExecution");
    const initialSurface = {
      kind: "renderer-slot" as const,
      mode: "preview" as const,
      slotId: "slot:initial",
      width: 128,
      height: 72,
      sourceCanvas: createCanvas(),
      materializeToCanvas: vi.fn(),
      cloneToCanvas: vi.fn(),
    };

    const result = await applyImageEffectsToSurfaceIfSupported({
      surface: initialSurface,
      effects: [createEffect({ maskId: "mask-1" })],
    });

    expect(result).toBeNull();
    expect(applyFilter2dOnGpuToSurfaceMock).not.toHaveBeenCalled();
  });

  it("supports masked filter2d effects on renderer surfaces when document and snapshot are provided", async () => {
    const { applyImageEffectsToSurfaceIfSupported } = await import("./effectExecution");
    const initialSurface = {
      kind: "renderer-slot" as const,
      mode: "preview" as const,
      slotId: "slot:initial",
      width: 128,
      height: 72,
      sourceCanvas: createCanvas(),
      materializeToCanvas: vi.fn(),
      cloneToCanvas: vi.fn(),
    };
    const effectSurface = {
      ...initialSurface,
      slotId: "slot:effect",
      sourceCanvas: createCanvas(),
    };
    const blendedSurface = {
      ...initialSurface,
      slotId: "slot:blended",
      sourceCanvas: createCanvas(),
    };
    const stageReferenceCanvas = createCanvas();
    applyFilter2dOnGpuToSurfaceMock.mockResolvedValue(effectSurface);
    renderImageEffectMaskToCanvasMock.mockResolvedValue(createCanvas());
    blendMaskedCanvasesOnGpuToSurfaceMock.mockResolvedValue(blendedSurface);

    const result = await applyImageEffectsToSurfaceIfSupported({
      surface: initialSurface,
      document: createDocument() as never,
      effects: [createEffect({ id: "effect-3", maskId: "mask-1" })],
      stageReferenceCanvas,
    });

    expect(renderImageEffectMaskToCanvasMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maskDefinition: (createDocument() as unknown as { masks: { byId: Record<string, unknown> } }).masks.byId["mask-1"],
        referenceSource: stageReferenceCanvas,
      })
    );
    expect(blendMaskedCanvasesOnGpuToSurfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseCanvas: initialSurface.sourceCanvas,
        layerCanvas: effectSurface.sourceCanvas,
        slotId: "effect-mask-blend:effect-3",
      })
    );
    expect(result).toBe(blendedSurface);
  });
});
