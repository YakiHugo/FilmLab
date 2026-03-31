import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyImageAsciiCarrierTransform,
  createAsciiFeatureGrid,
  createAsciiGridSurface,
  materializeAsciiGridSurface,
  normalizeImageAsciiEffectParams,
} from "./asciiEffect";

const getOrCreateAsciiAnalysisEntryMock = vi.fn();

vi.mock("./asciiAnalysis", () => ({
  getOrCreateAsciiAnalysisEntry: (...args: unknown[]) =>
    Reflect.apply(getOrCreateAsciiAnalysisEntryMock, undefined, args),
}));

const createMockContext = () => ({
  arc: vi.fn(),
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  stroke: vi.fn(),
  set fillStyle(_value: string) {},
  set filter(_value: string) {},
  set font(_value: string) {},
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

const createAsciiTransform = () => ({
  id: "ascii-test",
  type: "ascii" as const,
  enabled: true,
  analysisSource: "style" as const,
  params: {
    renderMode: "glyph" as const,
    preset: "standard" as const,
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
      luminance: new Float32Array([0.25, 0.5, 0.75, 1]),
      edge: new Float32Array([0, 0.1, 0.2, 0.3]),
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

  it("normalizes and clamps the richer ascii carrier params", () => {
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

  it("builds explicit FeatureGrid and GridSurface artifacts for the carrier stage", () => {
    const featureGrid = createAsciiFeatureGrid({
      sourceCanvas: createMockCanvas({ width: 24, height: 24 }),
      transform: createAsciiTransform(),
      quality: "full",
      revisionKey: "rev-1",
      targetSize: {
        width: 24,
        height: 24,
      },
      maskRevisionKey: null,
    });
    const gridSurface = createAsciiGridSurface({
      featureGrid,
      transform: createAsciiTransform(),
    });

    expect(featureGrid.columns).toBeGreaterThan(0);
    expect(featureGrid.rows).toBeGreaterThan(0);
    expect(featureGrid.cells.length).toBe(featureGrid.columns * featureGrid.rows);
    expect(gridSurface.cells.length).toBe(featureGrid.cells.length);
    expect(gridSurface.foregroundBlendMode).toBe("source-over");
  });

  it("materializes carrier output without clearing the target canvas first", () => {
    const targetContext = createMockContext();
    const targetCanvas = createMockCanvas({ context: targetContext });
    const sourceCanvas = createMockCanvas();

    const didApply = applyImageAsciiCarrierTransform({
      targetCanvas,
      sourceCanvas,
      transform: createAsciiTransform(),
      quality: "full",
      revisionKey: "rev-1",
      targetSize: {
        width: 12,
        height: 12,
      },
      maskRevisionKey: null,
    });

    expect(didApply).toBe(true);
    expect(targetContext.clearRect).not.toHaveBeenCalled();
    expect(targetContext.drawImage).toHaveBeenCalled();
  });

  it("can materialize a prebuilt GridSurface artifact directly", () => {
    const targetContext = createMockContext();
    const targetCanvas = createMockCanvas({ context: targetContext });
    const featureGrid = createAsciiFeatureGrid({
      sourceCanvas: createMockCanvas({ width: 24, height: 24 }),
      transform: createAsciiTransform(),
      quality: "full",
      revisionKey: "rev-1",
      targetSize: {
        width: 24,
        height: 24,
      },
      maskRevisionKey: null,
    });
    const gridSurface = createAsciiGridSurface({
      featureGrid,
      transform: createAsciiTransform(),
    });

    const didMaterialize = materializeAsciiGridSurface({
      targetCanvas,
      surface: gridSurface,
    });

    expect(didMaterialize).toBe(true);
    expect(targetContext.drawImage).toHaveBeenCalled();
  });
});
