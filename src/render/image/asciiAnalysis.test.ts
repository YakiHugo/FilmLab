import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runRendererPixelReadbackOperationMock = vi.fn();

vi.mock("@/lib/renderer/gpuSurfaceOperation", () => ({
  runRendererPixelReadbackOperation: (...args: unknown[]) =>
    Reflect.apply(runRendererPixelReadbackOperationMock, undefined, args),
}));

import {
  buildAsciiAnalysisCacheKey,
  clearAsciiAnalysisCache,
  getOrCreateAsciiAnalysisEntry,
} from "./asciiAnalysis";

const createLayout = () => ({
  cellWidth: 7,
  cellHeight: 12,
  columns: 4,
  rows: 2,
});

const createMockContext = ({
  rgba,
}: {
  rgba: Uint8ClampedArray;
}) => ({
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({
    data: rgba,
  })),
});

const createMockCanvas = ({
  width,
  height,
  context,
}: {
  width: number;
  height: number;
  context?: ReturnType<typeof createMockContext>;
}) =>
  ({
    width,
    height,
    getContext: vi.fn(() => context ?? null),
  }) as unknown as HTMLCanvasElement;

describe("asciiAnalysis", () => {
  beforeEach(() => {
    clearAsciiAnalysisCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearAsciiAnalysisCache();
    vi.unstubAllGlobals();
  });

  it("builds a stable cache key for equivalent requests", () => {
    const first = buildAsciiAnalysisCacheKey({
      sourceRevisionKey: "rev-1",
      stage: "carrier",
      analysisSource: "style",
      targetSize: {
        width: 1280,
        height: 720,
      },
      quality: "interactive",
      ...createLayout(),
    });
    const second = buildAsciiAnalysisCacheKey({
      sourceRevisionKey: "rev-1",
      stage: "carrier",
      analysisSource: "style",
      targetSize: {
        width: 1280,
        height: 720,
      },
      quality: "interactive",
      ...createLayout(),
    });

    expect(first).toBe(second);
  });

  it("changes the cache key when the snapshot source or quality changes", () => {
    const styleAnalysis = buildAsciiAnalysisCacheKey({
      sourceRevisionKey: "rev-1",
      stage: "carrier",
      analysisSource: "style",
      targetSize: {
        width: 1280,
        height: 720,
      },
      quality: "full",
      ...createLayout(),
    });
    const developAnalysis = buildAsciiAnalysisCacheKey({
      sourceRevisionKey: "rev-1",
      stage: "carrier",
      analysisSource: "develop",
      targetSize: {
        width: 1280,
        height: 720,
      },
      quality: "full",
      ...createLayout(),
    });
    const interactive = buildAsciiAnalysisCacheKey({
      sourceRevisionKey: "rev-1",
      stage: "carrier",
      analysisSource: "style",
      targetSize: {
        width: 1280,
        height: 720,
      },
      quality: "interactive",
      ...createLayout(),
    });

    expect(styleAnalysis).not.toBe(developAnalysis);
    expect(styleAnalysis).not.toBe(interactive);
  });

  it("changes the cache key when mask revision changes", () => {
    const base = buildAsciiAnalysisCacheKey({
      sourceRevisionKey: "rev-1",
      stage: "carrier",
      analysisSource: "style",
      targetSize: {
        width: 640,
        height: 360,
      },
      quality: "full",
      ...createLayout(),
      maskRevisionKey: "mask-a",
    });
    const differentMask = buildAsciiAnalysisCacheKey({
      sourceRevisionKey: "rev-1",
      stage: "carrier",
      analysisSource: "style",
      targetSize: {
        width: 640,
        height: 360,
      },
      quality: "full",
      ...createLayout(),
      maskRevisionKey: "mask-c",
    });

    expect(base).not.toBe(differentMask);
  });

  it("prefers GPU readback and flips WebGL rows back into top-down analysis order", async () => {
    runRendererPixelReadbackOperationMock.mockResolvedValue(
      new Uint8Array([
        0, 255, 0, 255,
        255, 0, 0, 255,
      ])
    );

    const entry = await getOrCreateAsciiAnalysisEntry({
      sourceRevisionKey: "rev-gpu",
      stage: "carrier",
      analysisSource: "style",
      targetSize: {
        width: 1,
        height: 2,
      },
      quality: "full",
      cellWidth: 1,
      cellHeight: 1,
      columns: 1,
      rows: 2,
      sourceCanvas: createMockCanvas({
        width: 1,
        height: 2,
      }),
    });

    expect(runRendererPixelReadbackOperationMock).toHaveBeenCalledTimes(1);
    expect(Array.from(entry.rawRgbaByCell)).toEqual([
      255, 0, 0, 255,
      0, 255, 0, 255,
    ]);
    expect(entry.alphaByCell[0]).toBeCloseTo(1, 5);
    expect(entry.alphaByCell[1]).toBeCloseTo(1, 5);
    expect(entry.luminanceByCell[0]).toBeCloseTo(0.2126, 4);
    expect(entry.luminanceByCell[1]).toBeCloseTo(0.7152, 4);
  });

  it("falls back to Canvas2D analysis when the GPU path is unavailable", async () => {
    runRendererPixelReadbackOperationMock.mockResolvedValue(null);
    const analysisContext = createMockContext({
      rgba: new Uint8ClampedArray([
        16, 32, 48, 255,
        64, 80, 96, 128,
      ]),
    });
    vi.stubGlobal("document", {
      createElement: vi.fn(() =>
        createMockCanvas({
          width: 1,
          height: 2,
          context: analysisContext,
        })
      ),
    });

    const entry = await getOrCreateAsciiAnalysisEntry({
      sourceRevisionKey: "rev-cpu",
      stage: "carrier",
      analysisSource: "style",
      targetSize: {
        width: 1,
        height: 2,
      },
      quality: "interactive",
      cellWidth: 1,
      cellHeight: 1,
      columns: 1,
      rows: 2,
      sourceCanvas: createMockCanvas({
        width: 1,
        height: 2,
      }),
    });

    expect(runRendererPixelReadbackOperationMock).toHaveBeenCalledTimes(1);
    expect(analysisContext.drawImage).toHaveBeenCalledTimes(1);
    expect(analysisContext.getImageData).toHaveBeenCalledTimes(1);
    expect(Array.from(entry.rawRgbaByCell)).toEqual([
      16, 32, 48, 255,
      64, 80, 96, 128,
    ]);
    expect(entry.alphaByCell[1]).toBeCloseTo(128 / 255, 5);
  });
});
