import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyImageAsciiCarrierTransform,
  createAsciiFeatureGrid,
  createAsciiTextmodeSurface,
  materializeAsciiTextmodeSurface,
  normalizeImageAsciiEffectParams,
  resolveAsciiForegroundBlendMode,
} from "./asciiEffect";

const getOrCreateAsciiAnalysisEntryMock = vi.fn();
const runRendererCanvasOperationMock = vi.fn();
const runRendererSurfaceOperationMock = vi.fn();
const materializeSurfaceToCanvasMock = vi.fn();

vi.mock("./asciiAnalysis", () => ({
  getOrCreateAsciiAnalysisEntry: (...args: unknown[]) =>
    Reflect.apply(getOrCreateAsciiAnalysisEntryMock, undefined, args),
}));

vi.mock("@/lib/renderer/gpuSurfaceOperation", () => ({
  runRendererCanvasOperation: (...args: unknown[]) =>
    Reflect.apply(runRendererCanvasOperationMock, undefined, args),
  runRendererSurfaceOperation: (...args: unknown[]) =>
    Reflect.apply(runRendererSurfaceOperationMock, undefined, args),
  materializeSurfaceToCanvas: (...args: unknown[]) =>
    Reflect.apply(materializeSurfaceToCanvasMock, undefined, args),
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

const createMockAnalysisEntry = ({
  columns = 4,
  rows = 2,
}: {
  columns?: number;
  rows?: number;
} = {}) => {
  const cellCount = columns * rows;
  const rawRgbaByCell = new Uint8ClampedArray(cellCount * 4);
  const alphaByCell = new Float32Array(cellCount);
  const luminanceByCell = new Float32Array(cellCount);
  const edgeByCell = new Float32Array(cellCount);

  for (let index = 0; index < cellCount; index += 1) {
    const offset = index * 4;
    rawRgbaByCell[offset] = 16 + index * 8;
    rawRgbaByCell[offset + 1] = 16 + index * 8;
    rawRgbaByCell[offset + 2] = 16 + index * 8;
    rawRgbaByCell[offset + 3] = 255;
    alphaByCell[index] = 1;
    luminanceByCell[index] = Math.min(1, 0.2 + index * 0.08);
    edgeByCell[index] = Math.min(1, index * 0.05);
  }

  return {
    key: "analysis",
    columns,
    rows,
    rawRgbaByCell,
    alphaByCell,
    luminanceByCell,
    edgeByCell,
  };
};

describe("asciiEffect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runRendererCanvasOperationMock.mockResolvedValue(false);
    runRendererSurfaceOperationMock.mockResolvedValue(null);
    materializeSurfaceToCanvasMock.mockReturnValue(false);
    getOrCreateAsciiAnalysisEntryMock.mockReturnValue(createMockAnalysisEntry());
    vi.stubGlobal("document", {
      createElement: vi.fn(() => createMockCanvas()),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps supported canvas blend modes onto renderer blend modes", () => {
    expect(resolveAsciiForegroundBlendMode("source-over")).toBe("normal");
    expect(resolveAsciiForegroundBlendMode("multiply")).toBe("multiply");
    expect(resolveAsciiForegroundBlendMode("screen")).toBe("screen");
    expect(resolveAsciiForegroundBlendMode("overlay")).toBe("overlay");
    expect(resolveAsciiForegroundBlendMode("soft-light")).toBe("softLight");
  });

  it("rejects unsupported canvas blend modes so callers can fall back to CPU", () => {
    expect(resolveAsciiForegroundBlendMode("difference")).toBeNull();
    expect(resolveAsciiForegroundBlendMode("hard-light")).toBeNull();
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

  it("builds packed FeatureGrid and packed textmode surface artifacts for the carrier stage", async () => {
    const sourceCanvas = createMockCanvas({ width: 24, height: 24 });
    const featureGrid = await createAsciiFeatureGrid({
      sourceCanvas,
      transform: createAsciiTransform(),
      quality: "full",
      sourceRevisionKey: "rev-1",
      targetSize: {
        width: 24,
        height: 24,
      },
      maskRevisionKey: null,
    });
    const textmodeSurface = createAsciiTextmodeSurface({
      featureGrid,
      sourceCanvas,
      transform: createAsciiTransform(),
    });

    expect(featureGrid.columns).toBeGreaterThan(0);
    expect(featureGrid.rows).toBeGreaterThan(0);
    expect(featureGrid.toneByCell.length).toBe(featureGrid.columns * featureGrid.rows);
    expect(featureGrid.sampleRgbaByCell.length).toBe(featureGrid.columns * featureGrid.rows * 4);
    expect(textmodeSurface.glyphIndexByCell.length).toBe(featureGrid.columns * featureGrid.rows);
    expect(textmodeSurface.foregroundRgbaByCell.length).toBe(featureGrid.columns * featureGrid.rows * 4);
    expect(textmodeSurface.cellXByCell[0]).toBe(0);
    expect(textmodeSurface.foregroundBlendMode).toBe("source-over");
  });

  it("keeps blurred-source backgrounds as source canvas metadata for the GPU presenter", async () => {
    const transform = createAsciiTransform();
    transform.params.backgroundMode = "blurred-source";
    transform.params.backgroundBlur = 100;
    const sourceCanvas = createMockCanvas({ width: 24, height: 24 });
    const featureGrid = await createAsciiFeatureGrid({
      sourceCanvas,
      transform,
      quality: "full",
      sourceRevisionKey: "rev-1",
      targetSize: {
        width: 24,
        height: 24,
      },
      maskRevisionKey: null,
    });

    const textmodeSurface = createAsciiTextmodeSurface({
      featureGrid,
      sourceCanvas,
      transform,
    });

    expect(textmodeSurface.backgroundSourceCanvas).toBe(sourceCanvas);
    expect(textmodeSurface.backgroundBlurPx).toBeGreaterThan(0);
  });

  it("falls back to CPU materialization without clearing the target canvas first", async () => {
    const targetContext = createMockContext();
    const targetCanvas = createMockCanvas({ context: targetContext });
    const sourceCanvas = createMockCanvas();

    const didApply = await applyImageAsciiCarrierTransform({
      targetCanvas,
      sourceCanvas,
      transform: createAsciiTransform(),
      quality: "full",
      sourceRevisionKey: "rev-1",
      targetSize: {
        width: 12,
        height: 12,
      },
      maskRevisionKey: null,
    });

    expect(didApply).toBe(true);
    expect(runRendererCanvasOperationMock).toHaveBeenCalledTimes(1);
    expect(runRendererSurfaceOperationMock).toHaveBeenCalledTimes(1);
    expect(targetContext.clearRect).not.toHaveBeenCalled();
    expect(targetContext.drawImage).toHaveBeenCalled();
  });

  it("prefers the direct GPU carrier path before building CPU analysis artifacts", async () => {
    runRendererCanvasOperationMock.mockResolvedValue(true);

    const didApply = await applyImageAsciiCarrierTransform({
      targetCanvas: createMockCanvas({ context: createMockContext() }),
      sourceCanvas: createMockCanvas(),
      transform: createAsciiTransform(),
      quality: "full",
      mode: "export",
      sourceRevisionKey: "rev-1",
      targetSize: {
        width: 12,
        height: 12,
      },
      maskRevisionKey: null,
    });

    expect(didApply).toBe(true);
    expect(runRendererCanvasOperationMock).toHaveBeenCalledTimes(1);
    expect(runRendererCanvasOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "export",
      })
    );
    expect(getOrCreateAsciiAnalysisEntryMock).not.toHaveBeenCalled();
    expect(runRendererSurfaceOperationMock).not.toHaveBeenCalled();
  });

  it("prefers the GPU textmode presenter when available", async () => {
    const mockSurface = { materializeToCanvas: vi.fn() };
    runRendererSurfaceOperationMock.mockResolvedValue(mockSurface);
    materializeSurfaceToCanvasMock.mockReturnValue(true);
    const targetContext = createMockContext();
    const targetCanvas = createMockCanvas({ context: targetContext });

    const didApply = await applyImageAsciiCarrierTransform({
      targetCanvas,
      sourceCanvas: createMockCanvas(),
      transform: createAsciiTransform(),
      quality: "full",
      mode: "export",
      sourceRevisionKey: "rev-1",
      targetSize: {
        width: 12,
        height: 12,
      },
      maskRevisionKey: null,
    });

    expect(didApply).toBe(true);
    expect(runRendererSurfaceOperationMock).toHaveBeenCalledTimes(1);
    expect(runRendererSurfaceOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "export",
      })
    );
    expect(materializeSurfaceToCanvasMock).toHaveBeenCalledTimes(1);
    expect(targetContext.drawImage).not.toHaveBeenCalled();
  });

  it("can materialize a packed textmode surface directly", async () => {
    const targetContext = createMockContext();
    const targetCanvas = createMockCanvas({ context: targetContext });
    const sourceCanvas = createMockCanvas({ width: 24, height: 24 });
    const featureGrid = await createAsciiFeatureGrid({
      sourceCanvas,
      transform: createAsciiTransform(),
      quality: "full",
      sourceRevisionKey: "rev-1",
      targetSize: {
        width: 24,
        height: 24,
      },
      maskRevisionKey: null,
    });
    const textmodeSurface = createAsciiTextmodeSurface({
      featureGrid,
      sourceCanvas,
      transform: createAsciiTransform(),
    });

    const didMaterialize = materializeAsciiTextmodeSurface({
      targetCanvas,
      surface: textmodeSurface,
    });

    expect(didMaterialize).toBe(true);
    expect(targetContext.drawImage).toHaveBeenCalled();
  });
});
