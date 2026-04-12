import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import {
  runRendererCanvasOperation,
  runRendererSurfaceOperation,
} from "@/lib/renderer/gpuSurfaceOperation";
import type { RenderMode } from "@/lib/renderer/RenderManager";
import { clamp } from "@/lib/math";
import type { EditorLayerBlendMode } from "@/types";
import { resolveDensitySortedCharset } from "./asciiDensityMeasure";
import {
  applyMaskedStageOperation,
  applyMaskedStageOperationToSurfaceIfSupported,
} from "./stageMaskComposite";
import type {
  AsciiGpuCarrierInput,
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

// Candidate character sets per preset. UNORDERED — resolveCharsetForPreset
// runs them through the density measurer which re-orders densest → sparsest.
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
const RGBA_CHANNELS_PER_CELL = 4;

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

const setPackedRgba = (
  rgba: Uint8ClampedArray,
  cellIndex: number,
  color: { red: number; green: number; blue: number },
  alpha: number
) => {
  const offset = cellIndex * RGBA_CHANNELS_PER_CELL;
  rgba[offset] = Math.round(clamp(color.red, 0, 255));
  rgba[offset + 1] = Math.round(clamp(color.green, 0, 255));
  rgba[offset + 2] = Math.round(clamp(color.blue, 0, 255));
  rgba[offset + 3] = Math.round(clamp(alpha, 0, 1) * 255);
};

const createPackedRgba = (
  color: { red: number; green: number; blue: number },
  alpha: number
) => {
  const rgba = new Uint8ClampedArray(RGBA_CHANNELS_PER_CELL);
  setPackedRgba(rgba, 0, color, alpha);
  return rgba;
};

const resolveEffectiveCellSize = (
  cellSize: number,
  quality: ImageRenderQuality
) => (quality === "interactive" ? clamp(Math.round(cellSize * 1.2), cellSize, 28) : cellSize);

const resolveBlurRadiusPx = (backgroundBlur: number, shortEdge: number) =>
  (clamp(backgroundBlur, 0, 100) / 100) * Math.max(1, Math.min(24, shortEdge * 0.035));

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
// GPU carrier input
// ---------------------------------------------------------------------------

export const createAsciiGpuCarrierInput = ({
  sourceCanvas,
  transform,
  quality,
  targetSize,
}: {
  sourceCanvas: HTMLCanvasElement;
  transform: ImageAsciiCarrierTransformNode;
  quality: ImageRenderQuality;
  targetSize: ImageRenderTargetSize;
}): AsciiGpuCarrierInput => {
  const normalized = normalizeImageAsciiEffectParams(transform.params);
  const layout = resolveFeatureGridLayout({ normalized, quality, targetSize });
  const backgroundColor = parseHexColor(normalized.backgroundColor);
  const backgroundBlurPx =
    normalized.backgroundMode === "blurred-source"
      ? resolveBlurRadiusPx(normalized.backgroundBlur, Math.min(layout.width, layout.height))
      : 0;

  return {
    width: layout.width,
    height: layout.height,
    cellWidth: layout.cellWidth,
    cellHeight: layout.cellHeight,
    columns: layout.columns,
    rows: layout.rows,
    renderMode: normalized.renderMode,
    colorMode: normalized.colorMode,
    density: normalized.density,
    coverage: normalized.coverage,
    edgeEmphasis: normalized.edgeEmphasis,
    brightness: normalized.brightness,
    contrast: normalized.contrast,
    foregroundOpacity: normalized.foregroundOpacity,
    foregroundBlendMode: normalized.foregroundBlendMode,
    backgroundMode: normalized.backgroundMode,
    backgroundOpacity: normalized.backgroundOpacity,
    backgroundFillRgba:
      normalized.backgroundMode === "solid"
        ? createPackedRgba(backgroundColor, normalized.backgroundOpacity)
        : null,
    cellBackgroundRgba:
      normalized.backgroundMode === "cell-solid"
        ? createPackedRgba(backgroundColor, normalized.backgroundOpacity)
        : null,
    backgroundSourceCanvas: normalized.backgroundMode === "blurred-source" ? sourceCanvas : null,
    backgroundBlurPx,
    invert: normalized.invert,
    gridOverlay: normalized.gridOverlay,
    gridOverlayAlpha: 0.08 * normalized.foregroundOpacity,
    duotoneShadowRgba:
      normalized.colorMode === "duotone"
        ? createPackedRgba(backgroundColor, 1)
        : null,
    charset: resolveCharsetForPreset(normalized.preset, normalized.customCharset),
    sourceCanvas,
  };
};

// ---------------------------------------------------------------------------
// Blend-mode mapping
// ---------------------------------------------------------------------------

export const resolveAsciiForegroundBlendMode = (
  blendMode: GlobalCompositeOperation
): EditorLayerBlendMode | null => {
  switch (blendMode) {
    case "source-over":
      return "normal";
    case "multiply":
      return "multiply";
    case "screen":
      return "screen";
    case "overlay":
      return "overlay";
    case "soft-light":
      return "softLight";
    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// GPU carrier rendering (single path — no textmode / CPU fallback)
// ---------------------------------------------------------------------------

const applyAsciiCarrierOnGpu = async ({
  targetCanvas,
  carrier,
  mode = "preview",
  slotId = "ascii-carrier",
}: {
  targetCanvas: HTMLCanvasElement;
  carrier: AsciiGpuCarrierInput;
  mode?: RenderMode;
  slotId?: string;
}) => {
  if (
    targetCanvas.width <= 0 ||
    targetCanvas.height <= 0 ||
    targetCanvas.width !== carrier.width ||
    targetCanvas.height !== carrier.height
  ) {
    return false;
  }

  const foregroundBlendMode = resolveAsciiForegroundBlendMode(carrier.foregroundBlendMode);
  if (!foregroundBlendMode) {
    return false;
  }

  return runRendererCanvasOperation({
    targetCanvas,
    mode,
    width: carrier.width,
    height: carrier.height,
    slotId,
    render: (renderer) =>
      renderer.renderAsciiCarrierComposite({
        baseCanvas: targetCanvas,
        carrier,
        foregroundBlendMode,
      }),
  });
};

const applyAsciiCarrierOnGpuToSurface = async ({
  baseCanvas,
  carrier,
  mode,
  slotId = "ascii-carrier",
  foregroundBlendMode,
}: {
  baseCanvas: HTMLCanvasElement;
  carrier: AsciiGpuCarrierInput;
  mode: RenderMode;
  slotId?: string;
  foregroundBlendMode?: EditorLayerBlendMode | null;
}): Promise<RenderSurfaceHandle | null> => {
  if (
    baseCanvas.width <= 0 ||
    baseCanvas.height <= 0 ||
    baseCanvas.width !== carrier.width ||
    baseCanvas.height !== carrier.height
  ) {
    return null;
  }

  const resolved =
    foregroundBlendMode ?? resolveAsciiForegroundBlendMode(carrier.foregroundBlendMode);
  if (!resolved) {
    return null;
  }

  return runRendererSurfaceOperation({
    mode,
    width: carrier.width,
    height: carrier.height,
    slotId,
    render: (renderer) =>
      renderer.renderAsciiCarrierComposite({
        baseCanvas,
        carrier,
        foregroundBlendMode: resolved,
      }),
  });
};

// ---------------------------------------------------------------------------
// Single-transform application
// ---------------------------------------------------------------------------

export const applyImageAsciiCarrierTransform = async ({
  targetCanvas,
  sourceCanvas,
  transform,
  quality,
  mode = "preview",
  targetSize,
}: {
  targetCanvas: HTMLCanvasElement;
  sourceCanvas: HTMLCanvasElement;
  transform: ImageAsciiCarrierTransformNode;
  quality: ImageRenderQuality;
  mode?: RenderMode;
  sourceRevisionKey: string;
  targetSize: ImageRenderTargetSize;
  maskRevisionKey?: string | null;
}) => {
  const carrier = createAsciiGpuCarrierInput({ sourceCanvas, transform, quality, targetSize });
  return applyAsciiCarrierOnGpu({
    targetCanvas,
    carrier,
    mode,
    slotId: `ascii-carrier:${transform.id}`,
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
  const carrier = createAsciiGpuCarrierInput({ sourceCanvas, transform, quality, targetSize });
  return applyAsciiCarrierOnGpuToSurface({
    baseCanvas: baseSurface.sourceCanvas,
    carrier,
    mode: baseSurface.mode,
    slotId: `ascii-carrier:${transform.id}`,
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
