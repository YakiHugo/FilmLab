import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import { clamp } from "@/lib/math";
import {
  applyAsciiCarrierOnGpu,
  applyAsciiCarrierOnGpuToSurface,
  type AsciiCarrierGpuInput,
} from "@/lib/renderer/gpuAsciiCarrier";
import type { EditorLayerBlendMode } from "@/types";
import { resolveDensitySortedCharset } from "./asciiDensityMeasure";
import {
  applyMaskedStageOperation,
  applyMaskedStageOperationToSurfaceIfSupported,
} from "./stageMaskComposite";
import type {
  CarrierTransformNode,
  ImageAsciiCarrierTransformNode,
  ImageRenderDocument,
  ImageRenderQuality,
  ImageRenderRequest,
  ImageRenderTargetSize,
} from "./types";
import { buildSourceRevisionKey } from "./types";

// ---------------------------------------------------------------------------
// Charset presets
// ---------------------------------------------------------------------------

const CHARSET_PRESET_CANDIDATES: Record<
  NonNullable<ImageAsciiCarrierTransformNode["params"]["preset"]>,
  string
> = {
  // ~50 pure-ASCII chars — density sorting picks the right order per font.
  // Covers the full tonal range from near-solid (@MW) to near-empty (.'` ).
  standard:
    "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ",
  blocks: "\u2588\u2593\u2592\u2591 ",
  minimal: "@#*+=-:. ",
  detailed:
    "\u2588\u2593\u2592\u2591$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ",
  custom: "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ",
};

const resolveCharsetForPreset = (
  preset: NonNullable<ImageAsciiCarrierTransformNode["params"]["preset"]>,
  customCharset?: string | null
): string[] => {
  if (preset === "custom") {
    const trimmed = typeof customCharset === "string" ? customCharset : "";
    if (trimmed.length > 0) {
      return resolveDensitySortedCharset(trimmed);
    }
    return resolveDensitySortedCharset(CHARSET_PRESET_CANDIDATES.standard);
  }
  const candidate = CHARSET_PRESET_CANDIDATES[preset] ?? CHARSET_PRESET_CANDIDATES.standard;
  return resolveDensitySortedCharset(candidate);
};

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const GLYPH_WIDTH_RATIO = 0.62;
const DOT_WIDTH_RATIO = 1;
const ALPHA_CUTOFF = 0.05;

interface NormalizedImageAsciiEffectParams {
  renderMode: "glyph" | "dot";
  preset: "standard" | "minimal" | "blocks" | "detailed" | "custom";
  customCharset: string | null;
  cellSize: number;
  characterSpacing: number;
  density: number;
  coverage: number;
  edgeEmphasis: number;
  brightness: number;
  contrast: number;
  dither: "none" | "floyd-steinberg";
  colorMode: "grayscale" | "full-color" | "duotone";
  foregroundOpacity: number;
  foregroundBlendMode: GlobalCompositeOperation;
  backgroundMode: "none" | "solid" | "cell-solid" | "blurred-source";
  backgroundBlur: number;
  backgroundOpacity: number;
  backgroundColor: string | null;
  invert: boolean;
  gridOverlay: boolean;
}

const normalizeHexColor = (value: string | null) => {
  if (!value) {
    return "#000000";
  }
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [red, green, blue] = trimmed.slice(1).split("");
    return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase();
  }
  return "#000000";
};

const parseHexColor = (value: string | null) => {
  const normalized = normalizeHexColor(value);
  return {
    red: parseInt(normalized.slice(1, 3), 16),
    green: parseInt(normalized.slice(3, 5), 16),
    blue: parseInt(normalized.slice(5, 7), 16),
  };
};

const resolveEffectiveCellSize = (
  cellSize: number,
  quality: ImageRenderQuality
) => (quality === "interactive" ? clamp(Math.round(cellSize * 1.2), cellSize, 28) : cellSize);

const resolveBlurRadiusPx = (backgroundBlur: number, shortEdge: number) => {
  // Scale blur relative to image size so the blurred source feels soft but
  // recognisable.  Previous formula capped at 24 px which was barely visible
  // at high resolutions.  backgroundBlur=8 (default) at 1080 p now gives
  // ≈ 5 px — enough to smooth pixel detail without washing the image out.
  const base = Math.max(1, shortEdge * 0.06);
  return (clamp(backgroundBlur, 0, 100) / 100) * base;
};

const resolveFeatureGridLayout = ({
  normalized,
  quality,
  targetSize,
}: {
  normalized: NormalizedImageAsciiEffectParams;
  quality: ImageRenderQuality;
  targetSize: ImageRenderTargetSize;
}) => {
  const effectiveCellSize = resolveEffectiveCellSize(normalized.cellSize, quality);
  const cellHeight = Math.max(6, Math.round(effectiveCellSize));
  const cellWidth = Math.max(
    4,
    Math.round(
      cellHeight *
        (normalized.renderMode === "dot" ? DOT_WIDTH_RATIO : GLYPH_WIDTH_RATIO) *
        normalized.characterSpacing
    )
  );
  const width = Math.max(1, Math.round(targetSize.width));
  const height = Math.max(1, Math.round(targetSize.height));
  const columns = Math.max(1, Math.ceil(width / cellWidth));
  const rows = Math.max(1, Math.ceil(height / cellHeight));
  return { width, height, cellWidth, cellHeight, columns, rows };
};

// ---------------------------------------------------------------------------
// Parameter normalisation
// ---------------------------------------------------------------------------

export const normalizeImageAsciiEffectParams = (
  params: ImageAsciiCarrierTransformNode["params"]
): NormalizedImageAsciiEffectParams => ({
  renderMode: params.renderMode === "dot" ? "dot" : "glyph",
  preset:
    params.preset === "blocks" ||
    params.preset === "detailed" ||
    params.preset === "minimal" ||
    params.preset === "custom"
      ? params.preset
      : "standard",
  customCharset:
    typeof params.customCharset === "string" && params.customCharset.length > 0
      ? params.customCharset
      : null,
  cellSize: clamp(Math.round(params.cellSize), 4, 48),
  characterSpacing: clamp(params.characterSpacing, 0.5, 2),
  density: clamp(params.density, 0.1, 1),
  coverage: clamp(params.coverage, 0.05, 1),
  edgeEmphasis: clamp(params.edgeEmphasis, 0, 1),
  brightness: clamp(params.brightness, -100, 100),
  contrast: clamp(params.contrast, 0.25, 3),
  dither: params.dither === "floyd-steinberg" ? "floyd-steinberg" : "none",
  colorMode:
    params.colorMode === "full-color" || params.colorMode === "duotone"
      ? params.colorMode
      : "grayscale",
  foregroundOpacity: clamp(params.foregroundOpacity, 0, 1),
  foregroundBlendMode: params.foregroundBlendMode,
  backgroundMode:
    params.backgroundMode === "solid" ||
    params.backgroundMode === "cell-solid" ||
    params.backgroundMode === "blurred-source"
      ? params.backgroundMode
      : "none",
  backgroundBlur: clamp(params.backgroundBlur, 0, 100),
  backgroundOpacity: clamp(params.backgroundOpacity, 0, 1),
  backgroundColor: params.backgroundColor ? normalizeHexColor(params.backgroundColor) : null,
  invert: Boolean(params.invert),
  gridOverlay: Boolean(params.gridOverlay),
});

// ---------------------------------------------------------------------------
// Foreground blend-mode mapping
// ---------------------------------------------------------------------------

const ASCII_FOREGROUND_BLEND_MODE_MAP: Record<string, EditorLayerBlendMode> = {
  "source-over": "normal",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  "soft-light": "softLight",
};

const resolveAsciiForegroundBlendMode = (
  mode: GlobalCompositeOperation
): EditorLayerBlendMode => ASCII_FOREGROUND_BLEND_MODE_MAP[mode] ?? "normal";

// ---------------------------------------------------------------------------
// CPU cell-grid analysis — downsample the source canvas to columns × rows,
// compute per-cell tone using the same brightness / contrast / density /
// coverage / invert / edge / dither chain as the Canvas2D reference
// implementation, and pack the result into two textures that the
// AsciiCarrier shader consumes directly.
// ---------------------------------------------------------------------------

interface AsciiCellGrids {
  cellColorRgba: Uint8ClampedArray;
  cellToneR: Uint8ClampedArray;
}

const buildAsciiCellGrids = (
  sourceCanvas: HTMLCanvasElement,
  normalized: NormalizedImageAsciiEffectParams,
  layout: ReturnType<typeof resolveFeatureGridLayout>
): AsciiCellGrids | null => {
  if (typeof document === "undefined") {
    return null;
  }

  const { columns, rows } = layout;
  const charset = resolveCharsetForPreset(normalized.preset, normalized.customCharset);
  const glyphSteps = Math.max(1, charset.length - 1);

  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = columns;
  analysisCanvas.height = rows;
  const analysisCtx = analysisCanvas.getContext("2d", { willReadFrequently: true });
  if (!analysisCtx) {
    analysisCanvas.width = 0;
    analysisCanvas.height = 0;
    return null;
  }
  analysisCtx.imageSmoothingQuality = "high";
  analysisCtx.drawImage(sourceCanvas, 0, 0, columns, rows);
  const imageData = analysisCtx.getImageData(0, 0, columns, rows);
  analysisCanvas.width = 0;
  analysisCanvas.height = 0;
  const data = imageData.data;

  const cellCount = columns * rows;
  const luminance = new Float32Array(cellCount);
  for (let i = 0; i < cellCount; i += 1) {
    const off = i * 4;
    luminance[i] =
      ((data[off] ?? 0) / 255) * 0.2126 +
      ((data[off + 1] ?? 0) / 255) * 0.7152 +
      ((data[off + 2] ?? 0) / 255) * 0.0722;
  }

  const toneGrid = new Float32Array(cellCount);
  const alphaGrid = new Float32Array(cellCount);
  const coverageThreshold = 1 - normalized.coverage;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const idx = row * columns + col;
      const a = (data[idx * 4 + 3] ?? 0) / 255;
      alphaGrid[idx] = a;
      if (a <= ALPHA_CUTOFF) continue;

      let brightness = luminance[idx] ?? 0;
      brightness = clamp(
        (brightness - 0.5) * normalized.contrast + 0.5 + normalized.brightness / 100,
        0,
        1
      );
      brightness = Math.pow(brightness, 1 / normalized.density);
      if (brightness <= coverageThreshold) continue;

      let tone = clamp(
        (brightness - coverageThreshold) / Math.max(0.0001, 1 - coverageThreshold),
        0,
        1
      );
      if (normalized.invert) {
        tone = 1 - tone;
      }

      // Edge emphasis after invert — edges always produce denser cells
      // regardless of invert mode, matching the Canvas2D reference pipeline.
      if (normalized.edgeEmphasis > 0) {
        const left = luminance[row * columns + Math.max(0, col - 1)] ?? 0;
        const right = luminance[row * columns + Math.min(columns - 1, col + 1)] ?? 0;
        const up = luminance[Math.max(0, row - 1) * columns + col] ?? 0;
        const down = luminance[Math.min(rows - 1, row + 1) * columns + col] ?? 0;
        const edge = clamp(Math.abs(right - left) + Math.abs(down - up), 0, 1);
        tone = clamp(tone + edge * normalized.edgeEmphasis, 0, 1);
      }

      toneGrid[idx] = Math.max(tone, 0.001);
    }
  }

  if (normalized.dither === "floyd-steinberg" && glyphSteps > 1) {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const idx = row * columns + col;
        if (alphaGrid[idx] <= ALPHA_CUTOFF || toneGrid[idx] <= 0) continue;
        const current = toneGrid[idx];
        const quantized = Math.round(current * glyphSteps) / glyphSteps;
        toneGrid[idx] = quantized;
        const error = current - quantized;
        if (col + 1 < columns) {
          toneGrid[idx + 1] = clamp(toneGrid[idx + 1] + error * (7 / 16), 0, 1);
        }
        if (row + 1 < rows) {
          if (col > 0) {
            toneGrid[(row + 1) * columns + col - 1] = clamp(
              toneGrid[(row + 1) * columns + col - 1] + error * (3 / 16),
              0,
              1
            );
          }
          toneGrid[(row + 1) * columns + col] = clamp(
            toneGrid[(row + 1) * columns + col] + error * (5 / 16),
            0,
            1
          );
          if (col + 1 < columns) {
            toneGrid[(row + 1) * columns + col + 1] = clamp(
              toneGrid[(row + 1) * columns + col + 1] + error * (1 / 16),
              0,
              1
            );
          }
        }
      }
    }
  }

  const cellColorRgba = new Uint8ClampedArray(data.length);
  cellColorRgba.set(data);
  const cellToneR = new Uint8ClampedArray(cellCount);
  for (let i = 0; i < cellCount; i += 1) {
    cellToneR[i] = Math.round(clamp(toneGrid[i] ?? 0, 0, 1) * 255);
  }

  return { cellColorRgba, cellToneR };
};

// ---------------------------------------------------------------------------
// GPU carrier input packing — shared between the Surface and canvas paths.
// ---------------------------------------------------------------------------

const buildAsciiCarrierGpuInput = (
  sourceCanvas: HTMLCanvasElement,
  normalized: NormalizedImageAsciiEffectParams,
  layout: ReturnType<typeof resolveFeatureGridLayout>,
  grids: AsciiCellGrids
): AsciiCarrierGpuInput => {
  const charset = resolveCharsetForPreset(normalized.preset, normalized.customCharset);
  const backgroundColorParsed = parseHexColor(normalized.backgroundColor);
  const backgroundBlurPx = resolveBlurRadiusPx(
    normalized.backgroundBlur,
    Math.min(layout.width, layout.height)
  );
  const backgroundOpacityU8 = Math.round(clamp(normalized.backgroundOpacity, 0, 1) * 255);

  const solidFill = new Uint8ClampedArray([
    backgroundColorParsed.red,
    backgroundColorParsed.green,
    backgroundColorParsed.blue,
    backgroundOpacityU8,
  ]);
  const backgroundFillRgba =
    normalized.backgroundMode === "solid" ? solidFill : null;
  const cellBackgroundRgba =
    normalized.backgroundMode === "cell-solid"
      ? new Uint8ClampedArray([
          backgroundColorParsed.red,
          backgroundColorParsed.green,
          backgroundColorParsed.blue,
          backgroundOpacityU8,
        ])
      : null;
  const duotoneShadowRgba =
    normalized.colorMode === "duotone"
      ? new Uint8ClampedArray([
          backgroundColorParsed.red,
          backgroundColorParsed.green,
          backgroundColorParsed.blue,
          255,
        ])
      : null;
  const backgroundSourceCanvas =
    normalized.backgroundMode === "blurred-source" ? sourceCanvas : null;

  return {
    width: layout.width,
    height: layout.height,
    cellWidth: layout.cellWidth,
    cellHeight: layout.cellHeight,
    columns: layout.columns,
    rows: layout.rows,
    renderMode: normalized.renderMode,
    colorMode: normalized.colorMode,
    foregroundOpacity: normalized.foregroundOpacity,
    foregroundBlendMode: resolveAsciiForegroundBlendMode(normalized.foregroundBlendMode),
    backgroundMode: normalized.backgroundMode,
    backgroundOpacity: normalized.backgroundOpacity,
    backgroundFillRgba,
    cellBackgroundRgba,
    backgroundSourceCanvas,
    backgroundBlurPx,
    invert: normalized.invert,
    gridOverlay: normalized.gridOverlay,
    // Matches Canvas2D overlayAlpha = 0.08 * foregroundOpacity.
    gridOverlayAlpha: 0.08 * normalized.foregroundOpacity,
    duotoneShadowRgba,
    charset,
    cellColorRgba: grids.cellColorRgba,
    cellToneR: grids.cellToneR,
  };
};


// ---------------------------------------------------------------------------
// Single-transform application
// ---------------------------------------------------------------------------

const prepareCarrierGpuInput = (
  sourceCanvas: HTMLCanvasElement,
  transform: ImageAsciiCarrierTransformNode,
  quality: ImageRenderQuality,
  targetSize: ImageRenderTargetSize
): AsciiCarrierGpuInput | null => {
  const normalized = normalizeImageAsciiEffectParams(transform.params);
  const layout = resolveFeatureGridLayout({ normalized, quality, targetSize });
  const grids = buildAsciiCellGrids(sourceCanvas, normalized, layout);
  if (!grids) {
    return null;
  }
  return buildAsciiCarrierGpuInput(sourceCanvas, normalized, layout, grids);
};

const resolveCarrierSlotId = (transform: ImageAsciiCarrierTransformNode) =>
  `ascii-carrier:${transform.id}`;

export const applyImageAsciiCarrierTransform = async ({
  targetCanvas,
  sourceCanvas,
  transform,
  quality,
  targetSize,
}: {
  targetCanvas: HTMLCanvasElement;
  sourceCanvas: HTMLCanvasElement;
  transform: ImageAsciiCarrierTransformNode;
  quality: ImageRenderQuality;
  mode?: string;
  sourceRevisionKey: string;
  targetSize: ImageRenderTargetSize;
  maskRevisionKey?: string | null;
}): Promise<boolean> => {
  if (targetCanvas.width <= 0 || targetCanvas.height <= 0) {
    return false;
  }
  const input = prepareCarrierGpuInput(sourceCanvas, transform, quality, targetSize);
  if (!input) {
    return false;
  }
  return applyAsciiCarrierOnGpu({
    targetCanvas,
    input,
    slotId: resolveCarrierSlotId(transform),
  });
};

export const applyImageAsciiCarrierTransformToSurfaceIfSupported = async ({
  baseSurface,
  sourceCanvas,
  transform,
  quality,
  targetSize,
}: {
  baseSurface: RenderSurfaceHandle;
  sourceCanvas: HTMLCanvasElement;
  transform: ImageAsciiCarrierTransformNode;
  quality: ImageRenderQuality;
  sourceRevisionKey: string;
  targetSize: ImageRenderTargetSize;
  maskRevisionKey?: string | null;
}): Promise<RenderSurfaceHandle | null> => {
  const input = prepareCarrierGpuInput(sourceCanvas, transform, quality, targetSize);
  if (!input) {
    return null;
  }
  return applyAsciiCarrierOnGpuToSurface({
    surface: baseSurface,
    input,
    slotId: resolveCarrierSlotId(transform),
  });
};

// ---------------------------------------------------------------------------
// Multi-transform orchestration (called from renderSingleImage)
// ---------------------------------------------------------------------------

interface CarrierSnapshots {
  develop: HTMLCanvasElement | null;
  style: HTMLCanvasElement;
}

export const applyImageCarrierTransforms = async ({
  canvas,
  carrierTransforms,
  document,
  request,
  snapshots,
  stageReferenceCanvas,
}: {
  canvas: HTMLCanvasElement;
  carrierTransforms: readonly CarrierTransformNode[];
  document: ImageRenderDocument;
  request: ImageRenderRequest;
  snapshots: CarrierSnapshots;
  stageReferenceCanvas?: HTMLCanvasElement;
}) => {
  const sourceRevisionKey = buildSourceRevisionKey(document);
  for (const transform of carrierTransforms) {
    const sourceCanvas =
      transform.analysisSource === "develop" ? snapshots.develop ?? snapshots.style : snapshots.style;
    const maskDefinition = transform.maskId ? document.masks.byId[transform.maskId] ?? null : null;
    if (!maskDefinition) {
      await applyImageAsciiCarrierTransform({
        targetCanvas: canvas,
        sourceCanvas,
        transform,
        quality: request.quality,
        mode: request.intent === "export" ? "export" : "preview",
        sourceRevisionKey,
        targetSize: request.targetSize,
        maskRevisionKey: null,
      });
      continue;
    }

    await applyMaskedStageOperation({
      canvas,
      maskDefinition,
      maskReferenceCanvas: stageReferenceCanvas ?? canvas,
      applyOperation: async ({ canvas: targetCanvas, maskRevisionKey }) => {
        await applyImageAsciiCarrierTransform({
          targetCanvas,
          sourceCanvas,
          transform,
          quality: request.quality,
          mode: request.intent === "export" ? "export" : "preview",
          sourceRevisionKey,
          targetSize: request.targetSize,
          maskRevisionKey,
        });
      },
    });
  }
};

export const applyImageCarrierTransformsToSurfaceIfSupported = async ({
  surface,
  carrierTransforms,
  document,
  request,
  snapshots,
  stageReferenceCanvas,
}: {
  surface: RenderSurfaceHandle;
  carrierTransforms: readonly CarrierTransformNode[];
  document: ImageRenderDocument;
  request: ImageRenderRequest;
  snapshots: CarrierSnapshots;
  stageReferenceCanvas?: HTMLCanvasElement;
}): Promise<RenderSurfaceHandle | null> => {
  const sourceRevisionKey = buildSourceRevisionKey(document);
  let currentSurface = surface;

  for (const transform of carrierTransforms) {
    const sourceCanvas =
      transform.analysisSource === "develop" ? snapshots.develop ?? snapshots.style : snapshots.style;
    const maskDefinition = transform.maskId ? document.masks.byId[transform.maskId] ?? null : null;
    const nextSurface = await applyMaskedStageOperationToSurfaceIfSupported({
      surface: currentSurface,
      maskDefinition,
      maskReferenceCanvas: stageReferenceCanvas ?? snapshots.style,
      blendSlotId: transform.maskId ? `carrier-mask:${transform.id}` : undefined,
      applyOperation: async ({ surface: targetSurface, maskRevisionKey }) =>
        applyImageAsciiCarrierTransformToSurfaceIfSupported({
          baseSurface: targetSurface,
          sourceCanvas,
          transform,
          quality: request.quality,
          sourceRevisionKey,
          targetSize: request.targetSize,
          maskRevisionKey,
        }),
    });
    if (!nextSurface) {
      return null;
    }
    currentSurface = nextSurface;
  }

  return currentSurface;
};
