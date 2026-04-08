import { describe, expect, it, vi } from "vitest";
import { PipelineRenderer } from "./PipelineRenderer";

type MockPass = {
  id: string;
  programInfo: unknown;
  uniforms: Record<string, unknown>;
  extraTextures: Record<string, unknown>;
  outputFormat: "RGBA8" | "RGBA16F";
  enabled: boolean;
};

const renderAsciiTextmodeLayer = (
  PipelineRenderer.prototype as unknown as {
    renderAsciiTextmodeLayer: (
      surface: {
        cacheKey: string;
        width: number;
        height: number;
        cellWidth: number;
        cellHeight: number;
        columns: number;
        rows: number;
        renderMode: "glyph" | "dot";
        backgroundFillRgba: Uint8ClampedArray | null;
        backgroundSourceCanvas: HTMLCanvasElement | null;
        backgroundBlurPx: number;
        foregroundBlendMode: GlobalCompositeOperation;
        gridOverlay: boolean;
        gridOverlayAlpha: number;
        charset: readonly string[];
        emptyGlyphIndex: number;
        glyphIndexByCell: Uint16Array;
        foregroundRgbaByCell: Uint8ClampedArray;
        backgroundRgbaByCell: Uint8ClampedArray;
        dotRadiusByCell: Float32Array;
      },
      layerKind: "background" | "foreground"
    ) => {
      texture: unknown;
      width: number;
      height: number;
      format: "RGBA8" | "RGBA16F";
      release: () => void;
    } | null;
  }
).renderAsciiTextmodeLayer;

const createSurface = (cacheKey: string) => ({
  cacheKey,
  width: 12,
  height: 12,
  cellWidth: 12,
  cellHeight: 12,
  columns: 1,
  rows: 1,
  renderMode: "glyph" as const,
  backgroundFillRgba: null,
  backgroundSourceCanvas: null,
  backgroundBlurPx: 0,
  foregroundBlendMode: "source-over" as const,
  gridOverlay: false,
  gridOverlayAlpha: 0,
  charset: ["#"],
  emptyGlyphIndex: 0xffff,
  glyphIndexByCell: new Uint16Array([0]),
  foregroundRgbaByCell: new Uint8ClampedArray([255, 255, 255, 255]),
  backgroundRgbaByCell: new Uint8ClampedArray([0, 0, 0, 0]),
  dotRadiusByCell: new Float32Array([0]),
});

const createRendererStub = () => {
  const runToTexture = vi.fn(() => ({
    texture: { id: "rendered" },
    width: 12,
    height: 12,
    format: "RGBA8" as const,
    release: vi.fn(),
  }));
  const getAsciiSurfaceTextureCacheRecord = vi.fn(() => ({
    foregroundTexture: { id: "foreground" },
    backgroundTexture: { id: "background" },
    glyphIndexTexture: { id: "glyph-index" },
    dotRadiusTexture: { id: "dot-radius" },
  }));
  const releaseAsciiSurfaceTextureCacheRecord = vi.fn();
  const getGlyphAtlas = vi.fn(() => ({
    texture: { id: "glyph-atlas" },
    columns: 1,
    rows: 1,
    glyphCount: 1,
  }));
  const renderAsciiBackgroundSourceLayer = vi.fn(() => null);
  const renderer = {
    hasVisibleAsciiCellData: (data: Uint8ClampedArray) => (data[3] ?? 0) > 0,
    getAsciiSurfaceTextureCacheRecord,
    releaseAsciiSurfaceTextureCacheRecord,
    getGlyphAtlas,
    renderAsciiBackgroundSourceLayer,
    filterPipeline: { runToTexture },
    programs: {
      asciiTextmode: { program: "ascii-textmode" },
    },
    emptyMaskTexture: { id: "empty-mask" },
  } as unknown as PipelineRenderer;

  return {
    renderer,
    runToTexture,
    getAsciiSurfaceTextureCacheRecord,
    releaseAsciiSurfaceTextureCacheRecord,
    renderAsciiBackgroundSourceLayer,
  };
};

describe("PipelineRenderer.renderAsciiTextmodeLayer", () => {
  it("consumes cached surface textures for keyed ascii surfaces", () => {
    const {
      renderer,
      runToTexture,
      getAsciiSurfaceTextureCacheRecord,
      releaseAsciiSurfaceTextureCacheRecord,
    } = createRendererStub();

    const rendered = renderAsciiTextmodeLayer.call(renderer, createSurface("ascii:rev-1"), "foreground");

    expect(rendered).not.toBeNull();
    expect(getAsciiSurfaceTextureCacheRecord).toHaveBeenCalledTimes(1);
    expect(releaseAsciiSurfaceTextureCacheRecord).not.toHaveBeenCalled();
    const call = runToTexture.mock.calls[0]?.[0] as {
      passes: MockPass[];
      input: { texture: unknown };
    };
    expect(call.input.texture).toEqual({ id: "empty-mask" });
    expect(call.passes[0]?.extraTextures).toMatchObject({
      u_backgroundCanvas: { id: "empty-mask" },
      u_cellForeground: { id: "foreground" },
      u_cellBackground: { id: "background" },
      u_cellGlyphIndex: { id: "glyph-index" },
      u_cellDotRadius: { id: "dot-radius" },
      u_glyphAtlas: { id: "glyph-atlas" },
    });
  });

  it("releases transient surface textures when no cache key is provided", () => {
    const {
      renderer,
      getAsciiSurfaceTextureCacheRecord,
      releaseAsciiSurfaceTextureCacheRecord,
    } = createRendererStub();

    const rendered = renderAsciiTextmodeLayer.call(renderer, createSurface(" "), "foreground");

    expect(rendered).not.toBeNull();
    expect(getAsciiSurfaceTextureCacheRecord).toHaveBeenCalledTimes(1);
    expect(releaseAsciiSurfaceTextureCacheRecord).toHaveBeenCalledTimes(1);
  });

  it("uses renderer-side blurred background source textures when present", () => {
    const {
      renderer,
      runToTexture,
      renderAsciiBackgroundSourceLayer,
    } = createRendererStub();
    const backgroundRelease = vi.fn();
    renderAsciiBackgroundSourceLayer.mockReturnValueOnce({
      texture: { id: "blurred-background" },
      width: 12,
      height: 12,
      format: "RGBA8",
      release: backgroundRelease,
    });

    const rendered = renderAsciiTextmodeLayer.call(
      renderer,
      {
        ...createSurface("ascii:rev-background"),
        backgroundSourceCanvas: {
          width: 12,
          height: 12,
          getContext: vi.fn(() => null),
        } as unknown as HTMLCanvasElement,
        backgroundBlurPx: 8,
      },
      "background"
    );

    expect(rendered).not.toBeNull();
    expect(renderAsciiBackgroundSourceLayer).toHaveBeenCalledTimes(1);
    const call = runToTexture.mock.calls[0]?.[0] as {
      passes: MockPass[];
    };
    expect(call.passes[0]?.extraTextures).toMatchObject({
      u_backgroundCanvas: { id: "blurred-background" },
    });
    expect(backgroundRelease).toHaveBeenCalledTimes(1);
  });
});
