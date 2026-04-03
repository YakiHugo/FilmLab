import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTimestampOverlay,
  createTimestampOverlayGpuInput,
  clearTimestampOverlayRasterCache,
  getOrCreateTimestampOverlayRaster,
  normalizeTimestampOverlayText,
  type TimestampOverlayAdjustments,
} from "./timestampOverlay";

const createMockContext = () => ({
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 96 })),
  restore: vi.fn(),
  save: vi.fn(),
  set fillStyle(_value: string) {},
  set font(_value: string) {},
  set globalAlpha(_value: number) {},
  set textAlign(_value: CanvasTextAlign) {},
  set textBaseline(_value: CanvasTextBaseline) {},
});

const createMockCanvas = ({
  width = 320,
  height = 180,
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

const createAdjustments = (): TimestampOverlayAdjustments => ({
  timestampEnabled: true,
  timestampOpacity: 70,
  timestampPosition: "top-left",
  timestampSize: 18,
});

describe("timestampOverlay", () => {
  let createdRasterCanvases: Array<
    HTMLCanvasElement & {
      context2d: ReturnType<typeof createMockContext>;
    }
  >;

  beforeEach(() => {
    createdRasterCanvases = [];
    clearTimestampOverlayRasterCache();
    vi.stubGlobal("document", {
      fonts: {
        load: vi.fn(() => Promise.resolve([])),
      },
      createElement: vi.fn(() => {
        const canvas = createMockCanvas();
        createdRasterCanvases.push(canvas);
        return canvas;
      }),
    });
  });

  afterEach(() => {
    clearTimestampOverlayRasterCache();
    vi.unstubAllGlobals();
  });

  it("reuses cached rasters for equivalent timestamp overlays", async () => {
    const adjustments = createAdjustments();

    const first = await getOrCreateTimestampOverlayRaster({
      width: 320,
      height: 180,
      adjustments,
      timestampText: "2026.04.08",
    });
    const second = await getOrCreateTimestampOverlayRaster({
      width: 320,
      height: 180,
      adjustments,
      timestampText: "2026.04.08",
    });

    expect(first).toBe(second);
    expect(createdRasterCanvases).toHaveLength(1);
    expect(createdRasterCanvases[0]?.context2d.fillText).toHaveBeenCalledTimes(1);
  });

  it("draws cached timestamp rasters onto each target canvas without rerasterizing text", async () => {
    const adjustments = createAdjustments();
    const firstTarget = createMockCanvas();
    const secondTarget = createMockCanvas();

    await applyTimestampOverlay(firstTarget, adjustments, "2026.04.08");
    await applyTimestampOverlay(secondTarget, adjustments, "2026.04.08");

    expect(createdRasterCanvases).toHaveLength(1);
    expect(createdRasterCanvases[0]?.context2d.fillText).toHaveBeenCalledTimes(1);
    expect(firstTarget.context2d.drawImage).toHaveBeenCalledTimes(1);
    expect(secondTarget.context2d.drawImage).toHaveBeenCalledTimes(1);
  });

  it("releases cached timestamp rasters when the cache is cleared", async () => {
    const adjustments = createAdjustments();

    const raster = await getOrCreateTimestampOverlayRaster({
      width: 320,
      height: 180,
      adjustments,
      timestampText: "2026.04.08",
    });

    expect(raster).not.toBeNull();
    clearTimestampOverlayRasterCache();

    expect(raster?.width).toBe(0);
    expect(raster?.height).toBe(0);

    const nextRaster = await getOrCreateTimestampOverlayRaster({
      width: 320,
      height: 180,
      adjustments,
      timestampText: "2026.04.08",
    });

    expect(nextRaster).not.toBe(raster);
    expect(createdRasterCanvases).toHaveLength(2);
  });

  it("builds a packed GPU overlay input with fixed cell layout", () => {
    const overlay = createTimestampOverlayGpuInput({
      width: 320,
      height: 180,
      adjustments: createAdjustments(),
      timestampText: "2026.04.08 19:42",
    });

    expect(overlay).toEqual(
      expect.objectContaining({
        width: 320,
        height: 180,
        charCount: 16,
        textStartX: expect.any(Number),
        textStartY: expect.any(Number),
        cellWidth: expect.any(Number),
        cellHeight: expect.any(Number),
        fontFamily: expect.any(String),
        fontSizePx: 18,
      })
    );
    expect(overlay?.glyphIndices).toBeInstanceOf(Float32Array);
    expect(overlay?.glyphIndices[0]).toBeGreaterThanOrEqual(0);
  });

  it("normalizes long timestamp text identically for GPU and CPU paths", async () => {
    const longText =
      "2026.04.08 19:42:51 UTC+08 LONG TIMESTAMP TEXT SHOULD TRUNCATE THE SAME WAY ON BOTH PATHS";
    const normalized = normalizeTimestampOverlayText(longText);
    const overlay = createTimestampOverlayGpuInput({
      width: 320,
      height: 180,
      adjustments: createAdjustments(),
      timestampText: longText,
    });

    await getOrCreateTimestampOverlayRaster({
      width: 320,
      height: 180,
      adjustments: createAdjustments(),
      timestampText: longText,
    });

    expect(normalized).toHaveLength(64);
    expect(overlay?.charCount).toBe(64);
    expect(createdRasterCanvases[0]?.context2d.fillText).toHaveBeenCalledWith(
      normalized,
      expect.any(Number),
      expect.any(Number)
    );
  });
});
