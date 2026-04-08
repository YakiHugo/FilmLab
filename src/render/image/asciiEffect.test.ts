import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyImageAsciiCarrierTransform,
  createAsciiFeatureGrid,
  createAsciiTextmodeSurface,
  materializeAsciiTextmodeSurface,
  normalizeImageAsciiEffectParams,
} from "./asciiEffect";

const getOrCreateAsciiAnalysisEntryMock = vi.fn();
const applyAsciiCarrierOnGpuMock = vi.fn();
const applyAsciiCarrierOnGpuToSurfaceMock = vi.fn();
const applyAsciiTextmodeOnGpuMock = vi.fn();
const applyAsciiTextmodeOnGpuToSurfaceMock = vi.fn();

vi.mock("./asciiAnalysis", () => ({
  getOrCreateAsciiAnalysisEntry: (...args: unknown[]) =>
    Reflect.apply(getOrCreateAsciiAnalysisEntryMock, undefined, args),
}));

vi.mock("./asciiGpuPresentation", () => ({
  applyAsciiCarrierOnGpu: (...args: unknown[]) =>
    Reflect.apply(applyAsciiCarrierOnGpuMock, undefined, args),
  applyAsciiCarrierOnGpuToSurface: (...args: unknown[]) =>
    Reflect.apply(applyAsciiCarrierOnGpuToSurfaceMock, undefined, args),
  applyAsciiTextmodeOnGpu: (...args: unknown[]) =>
    Reflect.apply(applyAsciiTextmodeOnGpuMock, undefined, args),
  applyAsciiTextmodeOnGpuToSurface: (...args: unknown[]) =>
    Reflect.apply(applyAsciiTextmodeOnGpuToSurfaceMock, undefined, args),
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
    applyAsciiCarrierOnGpuMock.mockResolvedValue(false);
    applyAsciiCarrierOnGpuToSurfaceMock.mockResolvedValue(null);
    applyAsciiTextmodeOnGpuMock.mockResolvedValue(false);
    applyAsciiTextmodeOnGpuToSurfaceMock.mockResolvedValue(null);
    getOrCreateAsciiAnalysisEntryMock.mockReturnValue(createMockAnalysisEntry());
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
    expect(applyAsciiTextmodeOnGpuMock).toHaveBeenCalledTimes(1);
    expect(targetContext.clearRect).not.toHaveBeenCalled();
    expect(targetContext.drawImage).toHaveBeenCalled();
  });

  it("prefers the direct GPU carrier path before building CPU analysis artifacts", async () => {
    applyAsciiCarrierOnGpuMock.mockResolvedValue(true);

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
    expect(applyAsciiCarrierOnGpuMock).toHaveBeenCalledTimes(1);
    expect(applyAsciiCarrierOnGpuMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "export",
      })
    );
    expect(getOrCreateAsciiAnalysisEntryMock).not.toHaveBeenCalled();
    expect(applyAsciiTextmodeOnGpuMock).not.toHaveBeenCalled();
  });

  it("prefers the GPU textmode presenter when available", async () => {
    applyAsciiTextmodeOnGpuMock.mockResolvedValue(true);
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
    expect(applyAsciiTextmodeOnGpuMock).toHaveBeenCalledTimes(1);
    expect(applyAsciiTextmodeOnGpuMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "export",
      })
    );
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
