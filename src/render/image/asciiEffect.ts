import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import type { RenderMode } from "@/lib/renderer/RenderManager";
import { clamp } from "@/lib/math";
import { getOrCreateAsciiAnalysisEntry } from "./asciiAnalysis";
import {
  applyAsciiCarrierOnGpu,
  applyAsciiCarrierOnGpuToSurface,
  applyAsciiTextmodeOnGpu,
  applyAsciiTextmodeOnGpuToSurface,
} from "./asciiGpuPresentation";
import type {
  AsciiGpuCarrierInput,
  AsciiTextmodeSurface,
  FeatureGrid,
  ImageAsciiCarrierTransformNode,
  ImageRenderQuality,
  ImageRenderTargetSize,
} from "./types";

const CHARSET_PRESETS: Record<NonNullable<ImageAsciiCarrierTransformNode["params"]["preset"]>, string[]> = {
  standard: "@%#*+=-:. ".split(""),
  blocks: "鈻堚枔鈻掆枒 ".split(""),
  detailed:
    "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ".split(""),
  custom: "@%#*+=-:. ".split(""),
};

const ALPHA_CUTOFF = 0.05;
const GLYPH_WIDTH_RATIO = 0.62;
const DOT_WIDTH_RATIO = 1;
const RGBA_CHANNELS_PER_CELL = 4;
const TEXTMODE_EMPTY_GLYPH_INDEX = 0xffff;

interface NormalizedImageAsciiEffectParams {
  renderMode: "glyph" | "dot";
  preset: "standard" | "blocks" | "detailed" | "custom";
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

const formatRgba = (red: number, green: number, blue: number, alpha: number) =>
  `rgba(${Math.round(clamp(red, 0, 255))}, ${Math.round(clamp(green, 0, 255))}, ${Math.round(
    clamp(blue, 0, 255)
  )}, ${clamp(alpha, 0, 1).toFixed(3)})`;

const formatPackedRgba = (rgba: Uint8ClampedArray, offset: number) =>
  formatRgba(
    rgba[offset] ?? 0,
    rgba[offset + 1] ?? 0,
    rgba[offset + 2] ?? 0,
    (rgba[offset + 3] ?? 0) / 255
  );

const hasVisiblePackedRgba = (rgba: Uint8ClampedArray, cellIndex: number) =>
  (rgba[cellIndex * RGBA_CHANNELS_PER_CELL + 3] ?? 0) > 0;

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

const mixColor = (
  left: { red: number; green: number; blue: number },
  right: { red: number; green: number; blue: number },
  amount: number
) => {
  const t = clamp(amount, 0, 1);
  return {
    red: left.red + (right.red - left.red) * t,
    green: left.green + (right.green - left.green) * t,
    blue: left.blue + (right.blue - left.blue) * t,
  };
};

const resolveEffectiveCellSize = (
  cellSize: number,
  quality: ImageRenderQuality
) => (quality === "interactive" ? clamp(Math.round(cellSize * 1.2), cellSize, 28) : cellSize);

const resolveBlurRadiusPx = (backgroundBlur: number, shortEdge: number) =>
  (clamp(backgroundBlur, 0, 100) / 100) * Math.max(1, Math.min(24, shortEdge * 0.035));

const distributeDitherError = (
  buffer: Float32Array,
  x: number,
  y: number,
  width: number,
  height: number,
  error: number
) => {
  const apply = (nextX: number, nextY: number, weight: number) => {
    if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
      return;
    }
    const index = nextY * width + nextX;
    buffer[index] = clamp(buffer[index] + error * weight, 0, 1);
  };

  apply(x + 1, y, 7 / 16);
  apply(x - 1, y + 1, 3 / 16);
  apply(x, y + 1, 5 / 16);
  apply(x + 1, y + 1, 1 / 16);
};

const createLayerCanvas = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const getSampleColor = ({
  rawRgbaByCell,
  cellIndex,
  normalized,
  tone,
}: {
  rawRgbaByCell: Uint8ClampedArray;
  cellIndex: number;
  normalized: NormalizedImageAsciiEffectParams;
  tone: number;
}) => {
  const pixelOffset = cellIndex * 4;
  const sampleColor = {
    red: rawRgbaByCell[pixelOffset] ?? 0,
    green: rawRgbaByCell[pixelOffset + 1] ?? 0,
    blue: rawRgbaByCell[pixelOffset + 2] ?? 0,
  };

  if (normalized.colorMode === "full-color") {
    return sampleColor;
  }

  if (normalized.colorMode === "duotone") {
    const shadow = parseHexColor(normalized.backgroundColor);
    const highlight = {
      red: 245,
      green: 245,
      blue: 245,
    };
    return mixColor(shadow, highlight, tone);
  }

  return {
    red: 245,
    green: 245,
    blue: 245,
  };
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
  return {
    width,
    height,
    cellWidth,
    cellHeight,
    columns,
    rows,
  };
};

const drawGridOverlay = (
  canvas: HTMLCanvasElement,
  cellWidth: number,
  cellHeight: number,
  alpha: number
) => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return;
  }

  context.save();
  context.strokeStyle = `rgba(255, 255, 255, ${clamp(alpha, 0, 1).toFixed(3)})`;
  context.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += cellWidth) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= canvas.height; y += cellHeight) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }
  context.restore();
};

export const normalizeImageAsciiEffectParams = (
  params: ImageAsciiCarrierTransformNode["params"]
): NormalizedImageAsciiEffectParams => ({
  renderMode: params.renderMode === "dot" ? "dot" : "glyph",
  preset:
    params.preset === "blocks" || params.preset === "detailed" || params.preset === "custom"
      ? params.preset
      : "standard",
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

export const createAsciiFeatureGrid = async ({
  sourceCanvas,
  transform,
  quality,
  sourceRevisionKey,
  targetSize,
  maskRevisionKey,
}: {
  sourceCanvas: HTMLCanvasElement;
  transform: ImageAsciiCarrierTransformNode;
  quality: ImageRenderQuality;
  sourceRevisionKey: string;
  targetSize: ImageRenderTargetSize;
  maskRevisionKey?: string | null;
}): Promise<FeatureGrid> => {
  const normalized = normalizeImageAsciiEffectParams(transform.params);
  const { width, height, cellWidth, cellHeight, columns, rows } = resolveFeatureGridLayout({
    normalized,
    quality,
    targetSize,
  });
  const analysis = await getOrCreateAsciiAnalysisEntry({
    sourceRevisionKey,
    stage: "carrier",
    analysisSource: transform.analysisSource,
    targetSize,
    quality,
    cellWidth,
    cellHeight,
    columns,
    rows,
    maskRevisionKey,
    sourceCanvas,
  });

  const cellCount = columns * rows;
  const cellXByCell = new Uint32Array(cellCount);
  const cellYByCell = new Uint32Array(cellCount);
  const cellWidthByCell = new Uint32Array(cellCount);
  const cellHeightByCell = new Uint32Array(cellCount);
  const toneByCell = new Float32Array(cellCount);
  const alphaByCell = new Float32Array(cellCount);
  const edgeByCell = new Float32Array(cellCount);
  const sampleRgbaByCell = new Uint8ClampedArray(cellCount * RGBA_CHANNELS_PER_CELL);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const cellX = column * cellWidth;
      const cellY = row * cellHeight;
      const drawWidth = Math.min(cellWidth, width - cellX);
      const drawHeight = Math.min(cellHeight, height - cellY);
      cellXByCell[index] = cellX;
      cellYByCell[index] = cellY;
      cellWidthByCell[index] = drawWidth;
      cellHeightByCell[index] = drawHeight;
      const cellAlpha = analysis.alphaByCell[index] ?? 0;
      alphaByCell[index] = cellAlpha;
      if (cellAlpha <= ALPHA_CUTOFF) {
        toneByCell[index] = 0;
        continue;
      }

      let tone = analysis.luminanceByCell[index] ?? 0;
      if (normalized.invert) {
        tone = 1 - tone;
      }
      tone = clamp((tone - 0.5) * normalized.contrast + 0.5 + normalized.brightness / 100, 0, 1);
      tone = clamp(tone + (analysis.edgeByCell[index] ?? 0) * normalized.edgeEmphasis, 0, 1);
      tone = Math.pow(tone, 1 / normalized.density);

      const coverageThreshold = 1 - normalized.coverage;
      toneByCell[index] =
        tone <= coverageThreshold
          ? 0
          : clamp((tone - coverageThreshold) / Math.max(0.0001, 1 - coverageThreshold), 0, 1);
      edgeByCell[index] = analysis.edgeByCell[index] ?? 0;
    }
  }

  if (normalized.dither === "floyd-steinberg") {
    const dithered = Float32Array.from(toneByCell);
    const glyphSteps = Math.max(1, (CHARSET_PRESETS[normalized.preset] ?? CHARSET_PRESETS.standard).length - 1);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        if ((alphaByCell[index] ?? 0) <= ALPHA_CUTOFF) {
          continue;
        }
        const current = dithered[index];
        const quantized = Math.round(current * glyphSteps) / glyphSteps;
        dithered[index] = quantized;
        distributeDitherError(dithered, column, row, columns, rows, current - quantized);
      }
    }
    toneByCell.set(dithered);
  }

  for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
    const sampleColor = getSampleColor({
      rawRgbaByCell: analysis.rawRgbaByCell,
      cellIndex,
      normalized,
      tone: toneByCell[cellIndex] ?? 0,
    });
    setPackedRgba(sampleRgbaByCell, cellIndex, sampleColor, 1);
  }

  return {
    width,
    height,
    cellWidth,
    cellHeight,
    columns,
    rows,
    cellXByCell,
    cellYByCell,
    cellWidthByCell,
    cellHeightByCell,
    alphaByCell,
    toneByCell,
    edgeByCell,
    sampleRgbaByCell,
  };
};

export const createAsciiTextmodeSurface = ({
  featureGrid,
  sourceCanvas,
  transform,
  cacheKey,
}: {
  featureGrid: FeatureGrid;
  sourceCanvas: HTMLCanvasElement;
  transform: ImageAsciiCarrierTransformNode;
  cacheKey?: string;
}): AsciiTextmodeSurface => {
  const normalized = normalizeImageAsciiEffectParams(transform.params);
  const backgroundColor = parseHexColor(normalized.backgroundColor);
  const charset = CHARSET_PRESETS[normalized.preset] ?? CHARSET_PRESETS.standard;
  const glyphSteps = Math.max(1, charset.length - 1);
  const cellCount = featureGrid.columns * featureGrid.rows;
  const backgroundBlurPx =
    normalized.backgroundMode === "blurred-source"
      ? resolveBlurRadiusPx(normalized.backgroundBlur, Math.min(featureGrid.width, featureGrid.height))
      : 0;
  const glyphIndexByCell = new Uint16Array(cellCount);
  glyphIndexByCell.fill(TEXTMODE_EMPTY_GLYPH_INDEX);
  const foregroundRgbaByCell = new Uint8ClampedArray(cellCount * RGBA_CHANNELS_PER_CELL);
  const backgroundRgbaByCell = new Uint8ClampedArray(cellCount * RGBA_CHANNELS_PER_CELL);
  const dotRadiusByCell = new Float32Array(cellCount);

  for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
    const cellAlpha = featureGrid.alphaByCell[cellIndex] ?? 0;
    const cellTone = featureGrid.toneByCell[cellIndex] ?? 0;
    const cellWidthValue = featureGrid.cellWidthByCell[cellIndex] ?? featureGrid.cellWidth;
    const cellHeightValue = featureGrid.cellHeightByCell[cellIndex] ?? featureGrid.cellHeight;
    const sampleOffset = cellIndex * RGBA_CHANNELS_PER_CELL;
    const sampleColor = {
      red: featureGrid.sampleRgbaByCell[sampleOffset] ?? 0,
      green: featureGrid.sampleRgbaByCell[sampleOffset + 1] ?? 0,
      blue: featureGrid.sampleRgbaByCell[sampleOffset + 2] ?? 0,
    };
    const isVisibleCell = cellTone > 0.001 && cellAlpha > ALPHA_CUTOFF;
    if (!isVisibleCell) {
      continue;
    }

    const foregroundAlpha =
      normalized.foregroundOpacity * Math.max(0.12, cellTone) * clamp(cellAlpha, 0, 1);
    if (foregroundAlpha > 1e-4) {
      setPackedRgba(foregroundRgbaByCell, cellIndex, sampleColor, foregroundAlpha);
    }

    if (normalized.backgroundMode === "cell-solid") {
      const backgroundAlpha = normalized.backgroundOpacity * clamp(cellAlpha, 0, 1);
      if (backgroundAlpha > 1e-4) {
        setPackedRgba(backgroundRgbaByCell, cellIndex, backgroundColor, backgroundAlpha);
      }
    }

    if (normalized.renderMode === "dot") {
      dotRadiusByCell[cellIndex] = Math.max(
        1,
        Math.min(cellWidthValue, cellHeightValue) * 0.45 * clamp(cellTone, 0, 1)
      );
      continue;
    }

    glyphIndexByCell[cellIndex] = Math.round(clamp(cellTone, 0, 1) * glyphSteps);
  }

  return {
    cacheKey:
      cacheKey ??
      [
        "ascii-textmode",
        transform.id,
        `${featureGrid.width}x${featureGrid.height}`,
        `${featureGrid.columns}x${featureGrid.rows}`,
      ].join(":"),
    width: featureGrid.width,
    height: featureGrid.height,
    cellWidth: featureGrid.cellWidth,
    cellHeight: featureGrid.cellHeight,
    columns: featureGrid.columns,
    rows: featureGrid.rows,
    renderMode: normalized.renderMode,
    backgroundFillRgba:
      normalized.backgroundMode === "solid"
        ? createPackedRgba(
            {
              red: backgroundColor.red,
              green: backgroundColor.green,
              blue: backgroundColor.blue,
            },
            normalized.backgroundOpacity
          )
        : null,
    backgroundSourceCanvas: normalized.backgroundMode === "blurred-source" ? sourceCanvas : null,
    backgroundBlurPx,
    foregroundBlendMode: normalized.foregroundBlendMode,
    gridOverlay: normalized.gridOverlay,
    gridOverlayAlpha: 0.08 * normalized.foregroundOpacity,
    charset,
    emptyGlyphIndex: TEXTMODE_EMPTY_GLYPH_INDEX,
    cellXByCell: featureGrid.cellXByCell,
    cellYByCell: featureGrid.cellYByCell,
    cellWidthByCell: featureGrid.cellWidthByCell,
    cellHeightByCell: featureGrid.cellHeightByCell,
    glyphIndexByCell,
    foregroundRgbaByCell,
    backgroundRgbaByCell,
    dotRadiusByCell,
  };
};

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
  const layout = resolveFeatureGridLayout({
    normalized,
    quality,
    targetSize,
  });
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
    charset: CHARSET_PRESETS[normalized.preset] ?? CHARSET_PRESETS.standard,
    sourceCanvas,
  };
};

export const materializeAsciiTextmodeSurface = ({
  targetCanvas,
  surface,
}: {
  targetCanvas: HTMLCanvasElement;
  surface: AsciiTextmodeSurface;
}) => {
  if (targetCanvas.width <= 0 || targetCanvas.height <= 0 || typeof document === "undefined") {
    return false;
  }

  const targetContext = targetCanvas.getContext("2d", { willReadFrequently: true });
  if (!targetContext) {
    return false;
  }

  const backgroundCanvas = createLayerCanvas(targetCanvas.width, targetCanvas.height);
  const foregroundCanvas = createLayerCanvas(targetCanvas.width, targetCanvas.height);
  const backgroundContext = backgroundCanvas.getContext("2d", { willReadFrequently: true });
  const foregroundContext = foregroundCanvas.getContext("2d", { willReadFrequently: true });

  if (!backgroundContext || !foregroundContext) {
    backgroundCanvas.width = 0;
    backgroundCanvas.height = 0;
    foregroundCanvas.width = 0;
    foregroundCanvas.height = 0;
    return false;
  }

  foregroundContext.textAlign = "center";
  foregroundContext.textBaseline = "middle";
  foregroundContext.font = `${Math.max(6, Math.round(surface.cellHeight * 0.9))}px monospace`;

  if (surface.backgroundFillRgba) {
    backgroundContext.fillStyle = formatPackedRgba(surface.backgroundFillRgba, 0);
    backgroundContext.fillRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
  }
  if (surface.backgroundSourceCanvas) {
    backgroundContext.save();
    backgroundContext.filter = `blur(${Math.max(0, surface.backgroundBlurPx).toFixed(2)}px)`;
    backgroundContext.drawImage(
      surface.backgroundSourceCanvas,
      0,
      0,
      backgroundCanvas.width,
      backgroundCanvas.height
    );
    backgroundContext.restore();
  }

  let hasCellBackground = false;
  for (let cellIndex = 0; cellIndex < surface.glyphIndexByCell.length; cellIndex += 1) {
    const x = surface.cellXByCell[cellIndex] ?? 0;
    const y = surface.cellYByCell[cellIndex] ?? 0;
    const width = surface.cellWidthByCell[cellIndex] ?? surface.cellWidth;
    const height = surface.cellHeightByCell[cellIndex] ?? surface.cellHeight;
    const rgbaOffset = cellIndex * RGBA_CHANNELS_PER_CELL;

    if (hasVisiblePackedRgba(surface.backgroundRgbaByCell, cellIndex)) {
      hasCellBackground = true;
      backgroundContext.fillStyle = formatPackedRgba(surface.backgroundRgbaByCell, rgbaOffset);
      backgroundContext.fillRect(x, y, width, height);
    }

    if (!hasVisiblePackedRgba(surface.foregroundRgbaByCell, cellIndex)) {
      continue;
    }

    foregroundContext.fillStyle = formatPackedRgba(surface.foregroundRgbaByCell, rgbaOffset);
    if (surface.renderMode === "dot") {
      const dotRadius = surface.dotRadiusByCell[cellIndex] ?? 0;
      if (dotRadius <= 1e-4) {
        continue;
      }
      foregroundContext.beginPath();
      foregroundContext.arc(x + width / 2, y + height / 2, dotRadius, 0, Math.PI * 2);
      foregroundContext.fill();
      continue;
    }

    const glyphIndex = surface.glyphIndexByCell[cellIndex] ?? surface.emptyGlyphIndex;
    if (glyphIndex === surface.emptyGlyphIndex) {
      continue;
    }
    const glyph = surface.charset[glyphIndex] ?? "";
    if (!glyph || glyph === " ") {
      continue;
    }
    foregroundContext.fillText(glyph, x + width / 2, y + height / 2);
  }

  if (surface.gridOverlay) {
    drawGridOverlay(foregroundCanvas, surface.cellWidth, surface.cellHeight, surface.gridOverlayAlpha);
  }

  targetContext.save();
  if (surface.backgroundFillRgba || surface.backgroundSourceCanvas || hasCellBackground) {
    targetContext.globalCompositeOperation = "source-over";
    targetContext.drawImage(backgroundCanvas, 0, 0);
  }
  targetContext.globalCompositeOperation = surface.foregroundBlendMode;
  targetContext.drawImage(foregroundCanvas, 0, 0);
  targetContext.restore();

  backgroundCanvas.width = 0;
  backgroundCanvas.height = 0;
  foregroundCanvas.width = 0;
  foregroundCanvas.height = 0;
  return true;
};

export const applyImageAsciiCarrierTransform = async ({
  targetCanvas,
  sourceCanvas,
  transform,
  quality,
  mode = "preview",
  sourceRevisionKey,
  targetSize,
  maskRevisionKey,
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
  const gpuCarrier = createAsciiGpuCarrierInput({
    sourceCanvas,
    transform,
    quality,
    targetSize,
  });
  const appliedDirectOnGpu = await applyAsciiCarrierOnGpu({
    targetCanvas,
    carrier: gpuCarrier,
    mode,
    slotId: `ascii-carrier:${transform.id}`,
  });
  if (appliedDirectOnGpu) {
    return true;
  }

  const textmodeSurface = createAsciiTextmodeSurface({
    featureGrid: await createAsciiFeatureGrid({
      sourceCanvas,
      transform,
      quality,
      sourceRevisionKey,
      targetSize,
      maskRevisionKey,
    }),
    sourceCanvas,
    transform,
    cacheKey: [
      "ascii-textmode",
      sourceRevisionKey,
      transform.id,
      quality,
      maskRevisionKey ?? "none",
      `${targetSize.width}x${targetSize.height}`,
    ].join(":"),
  });

  const appliedOnGpu = await applyAsciiTextmodeOnGpu({
    targetCanvas,
    surface: textmodeSurface,
    mode,
    slotId: `ascii-textmode:${transform.id}`,
  });
  if (appliedOnGpu) {
    return true;
  }
  return materializeAsciiTextmodeSurface({
    targetCanvas,
    surface: textmodeSurface,
  });
};

export const applyImageAsciiCarrierTransformToSurfaceIfSupported = async ({
  baseSurface,
  sourceCanvas,
  transform,
  quality,
  sourceRevisionKey,
  targetSize,
  maskRevisionKey,
}: {
  baseSurface: RenderSurfaceHandle;
  sourceCanvas: HTMLCanvasElement;
  transform: ImageAsciiCarrierTransformNode;
  quality: ImageRenderQuality;
  sourceRevisionKey: string;
  targetSize: ImageRenderTargetSize;
  maskRevisionKey?: string | null;
}): Promise<RenderSurfaceHandle | null> => {
  const gpuCarrier = createAsciiGpuCarrierInput({
    sourceCanvas,
    transform,
    quality,
    targetSize,
  });
  const gpuSurface = await applyAsciiCarrierOnGpuToSurface({
    baseCanvas: baseSurface.sourceCanvas,
    carrier: gpuCarrier,
    mode: baseSurface.mode,
    slotId: `ascii-carrier:${transform.id}`,
  });
  if (gpuSurface) {
    return gpuSurface;
  }

  const featureGrid = await createAsciiFeatureGrid({
    sourceCanvas,
    transform,
    quality,
    sourceRevisionKey,
    targetSize,
    maskRevisionKey,
  });
  const textmodeSurface = createAsciiTextmodeSurface({
    featureGrid,
    sourceCanvas,
    transform,
    cacheKey: [
      "ascii-textmode",
      sourceRevisionKey,
      transform.id,
      quality,
      maskRevisionKey ?? "none",
      `${targetSize.width}x${targetSize.height}`,
    ].join(":"),
  });

  return applyAsciiTextmodeOnGpuToSurface({
    baseCanvas: baseSurface.sourceCanvas,
    surface: textmodeSurface,
    mode: baseSurface.mode,
    slotId: `ascii-textmode:${transform.id}`,
  });
};
