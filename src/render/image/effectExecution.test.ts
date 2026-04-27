import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const applyFilter2dOnSurfaceMock = vi.fn();
const applyMaskedBlendOnSurfaceMock = vi.fn();
const renderImageEffectMaskToCanvasMock = vi.fn();

vi.mock("@/lib/gpu/passes/post/filter2dAdjust", () => ({
  applyFilter2dOnSurface: (...args: unknown[]) =>
    Reflect.apply(applyFilter2dOnSurfaceMock, null, args),
}));

vi.mock("@/lib/gpu/passes/mask/maskedBlend", () => ({
  applyMaskedBlendOnSurface: (...args: unknown[]) =>
    Reflect.apply(applyMaskedBlendOnSurfaceMock, null, args),
}));

vi.mock("./effectMask", () => ({
  renderImageEffectMaskToCanvas: (...args: unknown[]) =>
    Reflect.apply(renderImageEffectMaskToCanvasMock, null, args),
}));

const createCanvas = () => ({ width: 128, height: 72 }) as HTMLCanvasElement;

const createSurface = (slotId: string) => ({
  kind: "renderer-slot" as const,
  mode: "preview" as const,
  slotId,
  width: 128,
  height: 72,
  sourceCanvas: createCanvas(),
  materializeToCanvas: vi.fn(),
  cloneToCanvas: vi.fn(),
});

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
    applyFilter2dOnSurfaceMock.mockReset();
    applyMaskedBlendOnSurfaceMock.mockReset();
    renderImageEffectMaskToCanvasMock.mockReset();
    vi.stubGlobal("document", {
      createElement: vi.fn(() => createCanvas()),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("chains unmasked filter2d effects on renderer surfaces", async () => {
    const { applyImageEffects } = await import("./effectExecution");
    const initialSurface = createSurface("slot:initial");
    const filteredSurface = createSurface("slot:filtered");
    applyFilter2dOnSurfaceMock.mockResolvedValue(filteredSurface);

    const result = await applyImageEffects({
      surface: initialSurface,
      effects: [createEffect()],
    });

    expect(applyFilter2dOnSurfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: initialSurface,
        slotId: "filter2d:effect-1",
      })
    );
    expect(result).toBe(filteredSurface);
  });

  it("throws when a masked effect is missing document context", async () => {
    const { applyImageEffects } = await import("./effectExecution");
    const initialSurface = createSurface("slot:initial");

    await expect(
      applyImageEffects({
        surface: initialSurface,
        effects: [createEffect({ maskId: "mask-1" })],
      })
    ).rejects.toThrow(/requires document/);
    expect(applyFilter2dOnSurfaceMock).not.toHaveBeenCalled();
  });

  it("chains masked filter2d effects through the masked blend", async () => {
    const { applyImageEffects } = await import("./effectExecution");
    const initialSurface = createSurface("slot:initial");
    const effectSurface = createSurface("slot:effect");
    const blendedSurface = createSurface("slot:blended");
    const stageReferenceCanvas = createCanvas();
    applyFilter2dOnSurfaceMock.mockResolvedValue(effectSurface);
    renderImageEffectMaskToCanvasMock.mockResolvedValue(createCanvas());
    applyMaskedBlendOnSurfaceMock.mockResolvedValue(blendedSurface);

    const result = await applyImageEffects({
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
    expect(applyMaskedBlendOnSurfaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseCanvas: initialSurface.sourceCanvas,
        layerCanvas: effectSurface.sourceCanvas,
        slotId: "effect-mask-blend:effect-3",
      })
    );
    expect(result).toBe(blendedSurface);
  });

  it("throws when the GPU filter2d pass fails", async () => {
    const { applyImageEffects } = await import("./effectExecution");
    const initialSurface = createSurface("slot:initial");
    applyFilter2dOnSurfaceMock.mockResolvedValue(null);

    await expect(
      applyImageEffects({
        surface: initialSurface,
        effects: [createEffect()],
      })
    ).rejects.toThrow(/filter2d GPU pass failed/);
  });

  it("shares a single stageReferenceCanvas across masked effects in the same call", async () => {
    const { applyImageEffects } = await import("./effectExecution");
    const initialSurface = createSurface("slot:initial");
    const effectSurfaceA = createSurface("slot:effect-a");
    const effectSurfaceB = createSurface("slot:effect-b");
    const blendedSurfaceA = createSurface("slot:blended-a");
    const blendedSurfaceB = createSurface("slot:blended-b");
    const stageReferenceCanvas = createCanvas();
    applyFilter2dOnSurfaceMock
      .mockResolvedValueOnce(effectSurfaceA)
      .mockResolvedValueOnce(effectSurfaceB);
    renderImageEffectMaskToCanvasMock.mockResolvedValue(createCanvas());
    applyMaskedBlendOnSurfaceMock
      .mockResolvedValueOnce(blendedSurfaceA)
      .mockResolvedValueOnce(blendedSurfaceB);

    await applyImageEffects({
      surface: initialSurface,
      document: createDocument() as never,
      effects: [
        createEffect({ id: "effect-a", maskId: "mask-1" }),
        createEffect({ id: "effect-b", maskId: "mask-1" }),
      ],
      stageReferenceCanvas,
    });

    expect(renderImageEffectMaskToCanvasMock).toHaveBeenCalledTimes(2);
    const firstReference =
      renderImageEffectMaskToCanvasMock.mock.calls[0]?.[0]?.referenceSource;
    const secondReference =
      renderImageEffectMaskToCanvasMock.mock.calls[1]?.[0]?.referenceSource;
    expect(firstReference).toBe(stageReferenceCanvas);
    expect(secondReference).toBe(stageReferenceCanvas);
  });
});
