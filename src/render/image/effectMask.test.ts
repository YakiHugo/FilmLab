import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const applyLocalMaskRangeOnGpuMock = vi.fn();
const renderLocalMaskShapeOnGpuMock = vi.fn();

vi.mock("@/lib/renderer/gpuLocalMaskRangeGate", () => ({
  applyLocalMaskRangeOnGpu: (...args: unknown[]) =>
    Reflect.apply(applyLocalMaskRangeOnGpuMock, undefined, args),
}));

vi.mock("@/lib/renderer/gpuLocalMaskShape", () => ({
  renderLocalMaskShapeOnGpu: (...args: unknown[]) =>
    Reflect.apply(renderLocalMaskShapeOnGpuMock, undefined, args),
}));

import { buildImageRenderMaskRevisionKey, renderImageEffectMaskToCanvas } from "./effectMask";

class MockGradient {
  addColorStop = vi.fn();
}

class MockCanvasElement {
  width: number;
  height: number;

  constructor(width = 64, height = 64) {
    this.width = width;
    this.height = height;
  }

  readonly context2d = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => new MockGradient()),
    createRadialGradient: vi.fn(() => new MockGradient()),
    getImageData: vi.fn((_: number, __: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(Math.max(1, width) * Math.max(1, height) * 4).fill(255),
      width,
      height,
    })),
    putImageData: vi.fn(),
    globalCompositeOperation: "source-over",
    fillStyle: "rgba(255,255,255,1)",
  };

  getContext(type: string) {
    if (type === "2d") {
      return this.context2d;
    }
    return null;
  }
}

const createCanvas = (width = 64, height = 64) => new MockCanvasElement(width, height);

describe("effectMask", () => {
  beforeEach(() => {
    applyLocalMaskRangeOnGpuMock.mockReset();
    renderLocalMaskShapeOnGpuMock.mockReset();
    renderLocalMaskShapeOnGpuMock.mockResolvedValue(false);
    vi.stubGlobal("HTMLCanvasElement", MockCanvasElement);
    vi.stubGlobal("document", {
      createElement: vi.fn(() => new MockCanvasElement()),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a stable revision key for equivalent masks", () => {
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

    expect(buildImageRenderMaskRevisionKey(maskDefinition)).toBe(
      buildImageRenderMaskRevisionKey(maskDefinition)
    );
  });

  it("changes the revision key when the mask shape changes", () => {
    const first = buildImageRenderMaskRevisionKey({
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
    });
    const second = buildImageRenderMaskRevisionKey({
      id: "mask-1",
      kind: "local-adjustment",
      sourceLocalAdjustmentId: "local-1",
      mask: {
        mode: "radial",
        centerX: 0.5,
        centerY: 0.5,
        radiusX: 0.4,
        radiusY: 0.3,
        feather: 0.2,
      },
    });

    expect(first).not.toBe(second);
  });

  it("prefers GPU range gating before falling back to CPU pixel reads", async () => {
    renderLocalMaskShapeOnGpuMock.mockResolvedValue(true);
    applyLocalMaskRangeOnGpuMock.mockResolvedValue(true);
    const targetCanvas = createCanvas(32, 32);
    const scratchCanvas = createCanvas(32, 32);
    const referenceSource = createCanvas(32, 32) as unknown as CanvasImageSource;

    const output = await renderImageEffectMaskToCanvas({
      width: 32,
      height: 32,
      maskDefinition: {
        id: "mask-gpu",
        kind: "local-adjustment",
        sourceLocalAdjustmentId: "local-gpu",
        mask: {
          mode: "radial",
          centerX: 0.5,
          centerY: 0.5,
          radiusX: 0.3,
          radiusY: 0.3,
          feather: 0.2,
          lumaMin: 0.2,
          lumaMax: 0.8,
          hueCenter: 20,
          hueRange: 30,
          satMin: 0.2,
        },
      },
      referenceSource,
      targetCanvas: targetCanvas as unknown as HTMLCanvasElement,
      scratchCanvas: scratchCanvas as unknown as HTMLCanvasElement,
    });

    expect(output).toBe(targetCanvas);
    expect(applyLocalMaskRangeOnGpuMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maskCanvas: targetCanvas,
        referenceSource,
        slotId: "effect-mask:mask-gpu",
      })
    );
    expect(renderLocalMaskShapeOnGpuMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maskCanvas: targetCanvas,
        slotId: "effect-mask-shape:mask-gpu",
      })
    );
    expect(targetCanvas.context2d.getImageData).not.toHaveBeenCalled();
    expect(scratchCanvas.context2d.drawImage).not.toHaveBeenCalled();
  });

  it("falls back to CPU range gating when the GPU helper is unavailable", async () => {
    renderLocalMaskShapeOnGpuMock.mockResolvedValue(false);
    applyLocalMaskRangeOnGpuMock.mockResolvedValue(false);
    const targetCanvas = createCanvas(32, 32);
    const scratchCanvas = createCanvas(32, 32);
    const referenceSource = createCanvas(32, 32) as unknown as CanvasImageSource;

    const output = await renderImageEffectMaskToCanvas({
      width: 32,
      height: 32,
      maskDefinition: {
        id: "mask-fallback",
        kind: "local-adjustment",
        sourceLocalAdjustmentId: "local-fallback",
        mask: {
          mode: "linear",
          startX: 0,
          startY: 0,
          endX: 1,
          endY: 1,
          feather: 0.2,
          lumaMin: 0.1,
          lumaMax: 0.9,
          hueCenter: 60,
          hueRange: 20,
          satMin: 0.3,
        },
      },
      referenceSource,
      targetCanvas: targetCanvas as unknown as HTMLCanvasElement,
      scratchCanvas: scratchCanvas as unknown as HTMLCanvasElement,
    });

    expect(output).toBe(targetCanvas);
    expect(scratchCanvas.context2d.drawImage).toHaveBeenCalledWith(referenceSource, 0, 0, 32, 32);
    expect(targetCanvas.context2d.getImageData).toHaveBeenCalled();
    expect(targetCanvas.context2d.putImageData).toHaveBeenCalled();
  });

  it("prefers GPU shape generation for radial and linear masks", async () => {
    renderLocalMaskShapeOnGpuMock.mockResolvedValue(true);
    const radialCanvas = createCanvas(32, 32);
    const linearCanvas = createCanvas(32, 32);

    await renderImageEffectMaskToCanvas({
      width: 32,
      height: 32,
      maskDefinition: {
        id: "mask-shape",
        kind: "local-adjustment",
        sourceLocalAdjustmentId: "local-shape",
        mask: {
          mode: "radial",
          centerX: 0.5,
          centerY: 0.5,
          radiusX: 0.3,
          radiusY: 0.3,
          feather: 0.2,
        },
      },
      targetCanvas: radialCanvas as unknown as HTMLCanvasElement,
    });

    await renderImageEffectMaskToCanvas({
      width: 32,
      height: 32,
      maskDefinition: {
        id: "mask-shape-linear",
        kind: "local-adjustment",
        sourceLocalAdjustmentId: "local-shape-linear",
        mask: {
          mode: "linear",
          startX: 0,
          startY: 0,
          endX: 1,
          endY: 1,
          feather: 0.2,
        },
      },
      targetCanvas: linearCanvas as unknown as HTMLCanvasElement,
    });

    expect(renderLocalMaskShapeOnGpuMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maskCanvas: radialCanvas,
        slotId: "effect-mask-shape:mask-shape",
      })
    );
    expect(renderLocalMaskShapeOnGpuMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maskCanvas: linearCanvas,
        slotId: "effect-mask-shape:mask-shape-linear",
      })
    );
    expect(radialCanvas.context2d.createRadialGradient).not.toHaveBeenCalled();
    expect(linearCanvas.context2d.createLinearGradient).not.toHaveBeenCalled();
  });
});
