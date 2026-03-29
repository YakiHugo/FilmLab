import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyImageAsciiEffect, normalizeImageAsciiEffectParams } from "./asciiEffect";

const getOrCreateAsciiAnalysisEntryMock = vi.fn();
const getAsciiBlurredSourceCanvasMock = vi.fn((entry) => entry.sourceCanvas);

vi.mock("./asciiAnalysis", () => ({
  getOrCreateAsciiAnalysisEntry: (...args: unknown[]) => getOrCreateAsciiAnalysisEntryMock(...args),
  getAsciiBlurredSourceCanvas: (...args: unknown[]) => getAsciiBlurredSourceCanvasMock(...args),
}));

const createMockContext = () => ({
  arc: vi.fn(),
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  getImageData: vi.fn(() => ({
    data: new Uint8ClampedArray([
      0, 0, 0, 255,
      0, 0, 0, 255,
      0, 0, 0, 255,
      0, 0, 0, 255,
    ]),
  })),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  stroke: vi.fn(),
  set fillStyle(_value: string) {},
  set font(_value: string) {},
  set globalAlpha(_value: number) {},
  set globalCompositeOperation(_value: GlobalCompositeOperation) {},
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

describe("asciiEffect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrCreateAsciiAnalysisEntryMock.mockReturnValue({
      key: "analysis",
      analysisWidth: 2,
      analysisHeight: 2,
      rgba: new Uint8ClampedArray([
        16, 16, 16, 255,
        16, 16, 16, 255,
        16, 16, 16, 255,
        16, 16, 16, 255,
      ]),
      alpha: new Float32Array([1, 1, 1, 1]),
      luminance: new Float32Array([0, 0, 0, 0]),
      edge: new Float32Array([0, 0, 0, 0]),
      sourceCanvas: createMockCanvas(),
      blurredSourceCanvasByRadius: new Map(),
    });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => createMockCanvas()),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes and clamps the richer ascii effect params", () => {
    const normalized = normalizeImageAsciiEffectParams({
      renderMode: "dot",
      preset: "custom",
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

  it("preserves legacy ascii replacement semantics instead of leaking the source image underneath", () => {
    const targetContext = createMockContext();
    const targetCanvas = createMockCanvas({ context: targetContext });
    const sourceCanvas = createMockCanvas();

    const didApply = applyImageAsciiEffect({
      targetCanvas,
      sourceCanvas,
      effect: {
        id: "legacy-ascii",
        type: "ascii",
        enabled: true,
        placement: "style",
        analysisSource: "style",
        params: {
          renderMode: "glyph",
          preset: "standard",
          cellSize: 12,
          characterSpacing: 1,
          density: 1,
          coverage: 1,
          edgeEmphasis: 0,
          brightness: 0,
          contrast: 1,
          dither: "none",
          colorMode: "grayscale",
          foregroundOpacity: 1,
          foregroundBlendMode: "source-over",
          backgroundMode: "cell-solid",
          backgroundBlur: 0,
          backgroundOpacity: 1,
          backgroundColor: "#000000",
          invert: false,
          gridOverlay: false,
        },
      },
      quality: "full",
      revisionKey: "rev-1",
      targetSize: {
        width: 12,
        height: 12,
      },
      maskRevisionKey: null,
    });

    expect(didApply).toBe(true);
    expect(targetContext.clearRect).toHaveBeenCalledWith(0, 0, 12, 12);
    expect(targetContext.drawImage).toHaveBeenCalled();
  });
});
