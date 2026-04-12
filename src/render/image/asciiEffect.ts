import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import { clamp } from "@/lib/math";
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
  standard: "@%#*+=-:. ",
  blocks: "\u2588\u2593\u2592\u2591 ",
  minimal: "@#*+=-:. ",
  detailed:
    "\u2588\u2593\u2592\u2591$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ",
  custom: "@%#*+=-:. ",
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
// Canvas2D ASCII renderer
// ---------------------------------------------------------------------------

const renderAsciiToCanvas = (
  targetCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  normalized: NormalizedImageAsciiEffectParams,
  layout: ReturnType<typeof resolveFeatureGridLayout>
): boolean => {
  if (targetCanvas.width <= 0 || targetCanvas.height <= 0 || typeof document === "undefined") {
    return false;
  }

  const ctx = targetCanvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) {
    return false;
  }

  const { columns, rows, cellWidth, cellHeight } = layout;
  const charset = resolveCharsetForPreset(normalized.preset, normalized.customCharset);
  const glyphSteps = Math.max(1, charset.length - 1);
  const backgroundColor = parseHexColor(normalized.backgroundColor);
  const blurPx = resolveBlurRadiusPx(
    normalized.backgroundBlur,
    Math.min(targetCanvas.width, targetCanvas.height)
  );

  // --- Downsample source to grid resolution ---
  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = columns;
  analysisCanvas.height = rows;
  const analysisCtx = analysisCanvas.getContext("2d", { willReadFrequently: true });
  if (!analysisCtx) {
    analysisCanvas.width = 0;
    analysisCanvas.height = 0;
    return false;
  }
  analysisCtx.drawImage(sourceCanvas, 0, 0, columns, rows);
  const imageData = analysisCtx.getImageData(0, 0, columns, rows);
  analysisCanvas.width = 0;
  analysisCanvas.height = 0;
  const data = imageData.data;

  // --- Build per-cell luminance grid (used for edge emphasis) ---
  const luminance = new Float32Array(columns * rows);
  for (let i = 0; i < luminance.length; i += 1) {
    const off = i * 4;
    luminance[i] =
      ((data[off] ?? 0) / 255) * 0.2126 +
      ((data[off + 1] ?? 0) / 255) * 0.7152 +
      ((data[off + 2] ?? 0) / 255) * 0.0722;
  }

  // --- Draw background on top of the existing canvas content ---
  // The canvas already holds the base image (from develop/film stage).
  // ASCII background layers are composited over it so the original image
  // peeks through where backgroundOpacity < 1.
  if (normalized.backgroundMode === "blurred-source") {
    ctx.save();
    ctx.globalAlpha = clamp(normalized.backgroundOpacity, 0, 1);
    ctx.filter = `blur(${Math.max(0, blurPx).toFixed(1)}px)`;
    ctx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
    ctx.restore();
  } else if (normalized.backgroundMode === "solid") {
    ctx.save();
    ctx.globalAlpha = clamp(normalized.backgroundOpacity, 0, 1);
    ctx.fillStyle = normalizeHexColor(normalized.backgroundColor);
    ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
    ctx.restore();
  }

  // --- Draw foreground characters ---
  ctx.save();
  ctx.globalCompositeOperation = normalized.foregroundBlendMode;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.max(6, Math.round(cellHeight * 0.9))}px monospace`;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const cellIdx = row * columns + col;
      const pixelOffset = cellIdx * 4;
      const r = (data[pixelOffset] ?? 0) / 255;
      const g = (data[pixelOffset + 1] ?? 0) / 255;
      const b = (data[pixelOffset + 2] ?? 0) / 255;
      const a = (data[pixelOffset + 3] ?? 0) / 255;

      if (a <= ALPHA_CUTOFF) continue;

      let brightness = luminance[cellIdx] ?? 0;
      brightness = clamp(
        (brightness - 0.5) * normalized.contrast + 0.5 + normalized.brightness / 100,
        0,
        1
      );

      // Edge emphasis: simple Sobel-like gradient magnitude
      if (normalized.edgeEmphasis > 0) {
        const left = luminance[row * columns + Math.max(0, col - 1)] ?? 0;
        const right = luminance[row * columns + Math.min(columns - 1, col + 1)] ?? 0;
        const up = luminance[Math.max(0, row - 1) * columns + col] ?? 0;
        const down = luminance[Math.min(rows - 1, row + 1) * columns + col] ?? 0;
        const edge = clamp(Math.abs(right - left) + Math.abs(down - up), 0, 1);
        brightness = clamp(brightness + edge * normalized.edgeEmphasis, 0, 1);
      }

      brightness = Math.pow(brightness, 1 / normalized.density);

      const coverageThreshold = 1 - normalized.coverage;
      if (brightness <= coverageThreshold) continue;

      const tone = clamp(
        (brightness - coverageThreshold) / Math.max(0.0001, 1 - coverageThreshold),
        0,
        1
      );

      // Glyph selection: invert maps bright source → dense glyph (low index)
      const glyphTone = normalized.invert ? 1 - tone : tone;
      const glyphIndex = Math.round(clamp(glyphTone, 0, 1) * glyphSteps);

      const cx = col * cellWidth;
      const cy = row * cellHeight;

      if (normalized.renderMode === "dot") {
        const dotTone = normalized.invert ? tone : 1 - tone;
        const dotRadius = Math.max(1, Math.min(cellWidth, cellHeight) * 0.45 * dotTone);
        ctx.fillStyle = resolveCellColor(r, g, b, tone, normalized, backgroundColor);
        ctx.globalAlpha = clamp(normalized.foregroundOpacity * a, 0, 1);
        ctx.beginPath();
        ctx.arc(cx + cellWidth / 2, cy + cellHeight / 2, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      const glyph = charset[glyphIndex] ?? "";
      if (!glyph || glyph === " ") continue;

      ctx.fillStyle = resolveCellColor(r, g, b, tone, normalized, backgroundColor);
      ctx.globalAlpha = clamp(normalized.foregroundOpacity * a, 0, 1);
      ctx.fillText(glyph, cx + cellWidth / 2, cy + cellHeight / 2);
    }
  }
  ctx.restore();

  // --- Grid overlay ---
  if (normalized.gridOverlay) {
    const overlayAlpha = 0.08 * normalized.foregroundOpacity;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${clamp(overlayAlpha, 0, 1).toFixed(3)})`;
    ctx.lineWidth = 1;
    for (let x = 0; x <= targetCanvas.width; x += cellWidth) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, targetCanvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= targetCanvas.height; y += cellHeight) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(targetCanvas.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- Cell-solid background (drawn behind characters per cell) ---
  // This is handled after foreground because it needs to be composited
  // separately — in practice "cell-solid" mode overlays a solid color per
  // visible cell BEHIND the character. For simplicity we draw it on a
  // separate canvas and composite. For now, solid/blurred-source covers
  // the common cases.

  return true;
};

const resolveCellColor = (
  r: number,
  g: number,
  b: number,
  tone: number,
  normalized: NormalizedImageAsciiEffectParams,
  backgroundColor: { red: number; green: number; blue: number }
): string => {
  if (normalized.colorMode === "full-color") {
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  }
  if (normalized.colorMode === "duotone") {
    const colorTone = normalized.invert ? tone : 1 - tone;
    const mr = backgroundColor.red + (245 - backgroundColor.red) * colorTone;
    const mg = backgroundColor.green + (245 - backgroundColor.green) * colorTone;
    const mb = backgroundColor.blue + (245 - backgroundColor.blue) * colorTone;
    return `rgb(${Math.round(mr)}, ${Math.round(mg)}, ${Math.round(mb)})`;
  }
  return "rgb(245, 245, 245)";
};

// ---------------------------------------------------------------------------
// Single-transform application (Canvas2D)
// ---------------------------------------------------------------------------

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
}) => {
  const normalized = normalizeImageAsciiEffectParams(transform.params);
  const layout = resolveFeatureGridLayout({ normalized, quality, targetSize });
  return renderAsciiToCanvas(targetCanvas, sourceCanvas, normalized, layout);
};

// Surface path returns null — forces materialisation to canvas first,
// then the canvas path above handles the actual ASCII rendering.
export const applyImageAsciiCarrierTransformToSurfaceIfSupported = async (
  _options: {
    baseSurface: RenderSurfaceHandle;
    sourceCanvas: HTMLCanvasElement;
    transform: ImageAsciiCarrierTransformNode;
    quality: ImageRenderQuality;
    sourceRevisionKey: string;
    targetSize: ImageRenderTargetSize;
    maskRevisionKey?: string | null;
  }
): Promise<RenderSurfaceHandle | null> => null;

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
