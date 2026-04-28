import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import { clamp } from "@/lib/math";
import {
  applyAsciiCarrierOnSurface,
  type AsciiCarrierSurfaceParams,
} from "@/lib/gpu/passes/carrier/ascii";
import type { EditorLayerBlendMode } from "@/types";
import { resolveDensitySortedCharset } from "./asciiDensityMeasure";
import { type AnalysisLayerInputs, resolveAnalysisSourceCanvas } from "./analysisLayer";
import { applyMaskedStageOperationToSurfaceIfSupported } from "./stageMaskComposite";
import { applyImageHalftoneCarrierTransform } from "./halftoneEffect";
import type { RenderQualityTier } from "./qualityTier";
import type {
  CarrierTransformNode,
  ImageAsciiCarrierTransformNode,
  ImageRenderDocument,
  ImageRenderRequest,
  ImageRenderTargetSize,
} from "./types";

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
  structureWeight: number;
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

const parseHexColorToUnit = (
  value: string | null
): readonly [number, number, number] => {
  const normalized = normalizeHexColor(value);
  return [
    parseInt(normalized.slice(1, 3), 16) / 255,
    parseInt(normalized.slice(3, 5), 16) / 255,
    parseInt(normalized.slice(5, 7), 16) / 255,
  ];
};

const resolveEffectiveCellSize = (
  cellSize: number,
  quality: RenderQualityTier
) => (quality === "interactive" ? clamp(Math.round(cellSize * 1.2), cellSize, 28) : cellSize);

const resolveBlurRadiusPx = (backgroundBlur: number, shortEdge: number) => {
  // backgroundBlur=8 (default) at 1080p → ≈5 px — soft but recognisable.
  const base = Math.max(1, shortEdge * 0.06);
  return (clamp(backgroundBlur, 0, 100) / 100) * base;
};

const resolveFeatureGridLayout = ({
  normalized,
  quality,
  targetSize,
}: {
  normalized: NormalizedImageAsciiEffectParams;
  quality: RenderQualityTier;
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
  structureWeight: clamp(
    typeof params.structureWeight === "number" ? params.structureWeight : 0,
    0,
    1
  ),
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
// GPU adapter input packing
// ---------------------------------------------------------------------------

const buildAsciiSurfaceParams = (
  sourceCanvas: HTMLCanvasElement,
  normalized: NormalizedImageAsciiEffectParams,
  layout: ReturnType<typeof resolveFeatureGridLayout>
): AsciiCarrierSurfaceParams => {
  const charset = resolveCharsetForPreset(normalized.preset, normalized.customCharset);
  const backgroundRgb = parseHexColorToUnit(normalized.backgroundColor);
  const backgroundBlurPx = resolveBlurRadiusPx(
    normalized.backgroundBlur,
    Math.min(layout.width, layout.height)
  );

  return {
    sourceCanvas,
    width: layout.width,
    height: layout.height,
    cellWidth: layout.cellWidth,
    cellHeight: layout.cellHeight,
    columns: layout.columns,
    rows: layout.rows,
    charset,
    renderMode: normalized.renderMode,
    colorMode: normalized.colorMode,
    invert: normalized.invert,
    foregroundOpacity: normalized.foregroundOpacity,
    foregroundBlendMode: resolveAsciiForegroundBlendMode(normalized.foregroundBlendMode),
    backgroundMode: normalized.backgroundMode,
    backgroundOpacity: normalized.backgroundOpacity,
    backgroundBlurPx,
    backgroundColor: backgroundRgb,
    duotoneShadow: backgroundRgb,
    gridOverlay: normalized.gridOverlay,
    // Matches Canvas2D overlayAlpha = 0.08 * foregroundOpacity.
    gridOverlayAlpha: 0.08 * normalized.foregroundOpacity,
    brightness: normalized.brightness,
    contrast: normalized.contrast,
    density: normalized.density,
    coverage: normalized.coverage,
    edgeEmphasis: normalized.edgeEmphasis,
    ditherMode: normalized.dither === "floyd-steinberg" ? "bayer" : "none",
    structureWeight: normalized.structureWeight,
  };
};

// ---------------------------------------------------------------------------
// Single-transform application
// ---------------------------------------------------------------------------

export const applyImageAsciiCarrierTransform = async ({
  baseSurface,
  sourceCanvas,
  transform,
  quality,
  targetSize,
}: {
  baseSurface: RenderSurfaceHandle;
  sourceCanvas: HTMLCanvasElement;
  transform: ImageAsciiCarrierTransformNode;
  quality: RenderQualityTier;
  targetSize: ImageRenderTargetSize;
}): Promise<RenderSurfaceHandle | null> => {
  const normalized = normalizeImageAsciiEffectParams(transform.params);
  const layout = resolveFeatureGridLayout({ normalized, quality, targetSize });
  const params = buildAsciiSurfaceParams(sourceCanvas, normalized, layout);
  return applyAsciiCarrierOnSurface({ surface: baseSurface, params });
};

// ---------------------------------------------------------------------------
// Multi-transform orchestration (called from renderSingleImage)
// ---------------------------------------------------------------------------

const applyCarrierTransform = async ({
  surface,
  transform,
  sourceCanvas,
  quality,
  targetSize,
}: {
  surface: RenderSurfaceHandle;
  transform: CarrierTransformNode;
  sourceCanvas: HTMLCanvasElement;
  quality: RenderQualityTier;
  targetSize: ImageRenderTargetSize;
}): Promise<RenderSurfaceHandle | null> => {
  switch (transform.type) {
    case "ascii":
      return applyImageAsciiCarrierTransform({
        baseSurface: surface,
        sourceCanvas,
        transform,
        quality,
        targetSize,
      });
    case "halftone":
      return applyImageHalftoneCarrierTransform({
        baseSurface: surface,
        transform,
        quality,
        targetSize,
      });
  }
};

export const applyImageCarrierTransforms = async ({
  surface,
  carrierTransforms,
  document,
  request,
  analysisInputs,
  stageReferenceCanvas,
}: {
  surface: RenderSurfaceHandle;
  carrierTransforms: readonly CarrierTransformNode[];
  document: ImageRenderDocument;
  request: ImageRenderRequest;
  analysisInputs: AnalysisLayerInputs;
  stageReferenceCanvas?: HTMLCanvasElement;
}): Promise<RenderSurfaceHandle> => {
  let currentSurface = surface;

  for (const transform of carrierTransforms) {
    const sourceCanvas = resolveAnalysisSourceCanvas(
      transform.analysisSource,
      analysisInputs
    );
    const maskDefinition = transform.maskId
      ? document.masks.byId[transform.maskId] ?? null
      : null;
    const fallbackReferenceCanvas = analysisInputs.stageSnapshots.style;
    const nextSurface = await applyMaskedStageOperationToSurfaceIfSupported({
      surface: currentSurface,
      maskDefinition,
      maskReferenceCanvas: stageReferenceCanvas ?? fallbackReferenceCanvas ?? undefined,
      blendSlotId: transform.maskId ? `carrier-mask:${transform.id}` : undefined,
      applyOperation: async ({ surface: targetSurface }) =>
        applyCarrierTransform({
          surface: targetSurface,
          transform,
          sourceCanvas,
          quality: request.qualityTier,
          targetSize: request.targetSize,
        }),
    });
    if (!nextSurface) {
      throw new Error(`Carrier GPU pass failed for transform ${transform.id} (${transform.type})`);
    }
    currentSurface = nextSurface;
  }

  return currentSurface;
};
