import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renderImageEffectMaskToCanvasMock = vi.fn();
const buildImageRenderMaskRevisionKeyMock = vi.fn(() => "mask-revision");
const blendMaskedCanvasesOnGpuMock = vi.fn();

class MockCanvasElement {
  width = 64;
  height = 64;

  readonly context2d = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn((_: number, __: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(Math.max(1, width) * Math.max(1, height) * 4),
      width,
      height,
    })),
    createImageData: vi.fn((width: number, height: number) => ({
      data: new Uint8ClampedArray(Math.max(1, width) * Math.max(1, height) * 4),
      width,
      height,
    })),
    putImageData: vi.fn(),
  };

  getContext(type: string) {
    if (type === "2d") {
      return this.context2d;
    }
    return null;
  }
}

vi.mock("./effectMask", () => ({
  buildImageRenderMaskRevisionKey: (...args: unknown[]) =>
    Reflect.apply(buildImageRenderMaskRevisionKeyMock, null, args),
  renderImageEffectMaskToCanvas: (...args: unknown[]) =>
    Reflect.apply(renderImageEffectMaskToCanvasMock, null, args),
}));

vi.mock("@/lib/renderer/gpuMaskedCanvasBlend", () => ({
  blendMaskedCanvasesOnGpu: (...args: unknown[]) =>
    Reflect.apply(blendMaskedCanvasesOnGpuMock, null, args),
}));

const createCanvas = () => new MockCanvasElement();

describe("stageMaskComposite", () => {
  beforeEach(() => {
    buildImageRenderMaskRevisionKeyMock.mockReset();
    buildImageRenderMaskRevisionKeyMock.mockReturnValue("mask-revision");
    blendMaskedCanvasesOnGpuMock.mockReset();
    renderImageEffectMaskToCanvasMock.mockReset();
    renderImageEffectMaskToCanvasMock.mockImplementation(
      async ({ targetCanvas }: { targetCanvas: HTMLCanvasElement }) => targetCanvas
    );
    vi.stubGlobal("HTMLCanvasElement", MockCanvasElement);
    vi.stubGlobal("document", {
      createElement: vi.fn(() => new MockCanvasElement()),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers GPU masked blending when available", async () => {
    const { applyMaskedStageOperation } = await import("./stageMaskComposite");
    const targetCanvas = createCanvas();
    const referenceCanvas = createCanvas();
    const effectMask = {
      id: "mask-1",
      kind: "local-adjustment" as const,
      sourceLocalAdjustmentId: "local-1",
      mask: {
        mode: "radial" as const,
        centerX: 0.5,
        centerY: 0.5,
        radiusX: 0.2,
        radiusY: 0.2,
        feather: 0.1,
      },
    };
    blendMaskedCanvasesOnGpuMock.mockResolvedValue(true);

    await applyMaskedStageOperation({
      canvas: targetCanvas as unknown as HTMLCanvasElement,
      maskDefinition: effectMask,
      maskReferenceCanvas: referenceCanvas as unknown as HTMLCanvasElement,
      applyOperation: ({ maskRevisionKey }) => {
        expect(maskRevisionKey).toBe("mask-revision");
      },
    });

    expect(blendMaskedCanvasesOnGpuMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseCanvas: targetCanvas,
        targetCanvas: targetCanvas,
        slotId: "stage-mask:mask-1",
      })
    );
    expect(targetCanvas.context2d.getImageData).not.toHaveBeenCalled();
    expect(targetCanvas.context2d.putImageData).not.toHaveBeenCalled();
  });

  it("falls back to CPU pixel blending when GPU masked blend is unavailable", async () => {
    const { applyMaskedStageOperation } = await import("./stageMaskComposite");
    const targetCanvas = createCanvas();
    const referenceCanvas = createCanvas();
    const effectMask = {
      id: "mask-2",
      kind: "local-adjustment" as const,
      sourceLocalAdjustmentId: "local-2",
      mask: {
        mode: "linear" as const,
        startX: 0,
        startY: 0,
        endX: 1,
        endY: 1,
        feather: 0.2,
      },
    };
    blendMaskedCanvasesOnGpuMock.mockResolvedValue(false);

    await applyMaskedStageOperation({
      canvas: targetCanvas as unknown as HTMLCanvasElement,
      maskDefinition: effectMask,
      maskReferenceCanvas: referenceCanvas as unknown as HTMLCanvasElement,
      applyOperation: () => undefined,
    });

    expect(targetCanvas.context2d.createImageData).toHaveBeenCalled();
    expect(targetCanvas.context2d.putImageData).toHaveBeenCalled();
  });
});
