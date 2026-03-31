import { clamp } from "@/lib/math";
import { getOrCreateAsciiAnalysisEntry } from "./asciiAnalysis";
import type {
  FeatureGrid,
  GridSurface,
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

const getAnalysisSampleIndex = (
  analysisWidth: number,
  analysisHeight: number,
  targetSize: ImageRenderTargetSize,
  x: number,
  y: number
) => {
  const normalizedX = targetSize.width <= 1 ? 0 : clamp(x / (targetSize.width - 1), 0, 1);
  const normalizedY = targetSize.height <= 1 ? 0 : clamp(y / (targetSize.height - 1), 0, 1);
  const analysisX = Math.min(
    analysisWidth - 1,
    Math.max(0, Math.round(normalizedX * (analysisWidth - 1)))
  );
  const analysisY = Math.min(
    analysisHeight - 1,
    Math.max(0, Math.round(normalizedY * (analysisHeight - 1)))
  );
  return analysisY * analysisWidth + analysisX;
};

const getSampleColor = ({
  analysisHeight,
  analysisWidth,
  rgba,
  targetSize,
  x,
  y,
  normalized,
  tone,
}: {
  analysisHeight: number;
  analysisWidth: number;
  rgba: Uint8ClampedArray;
  targetSize: ImageRenderTargetSize;
  x: number;
  y: number;
  normalized: NormalizedImageAsciiEffectParams;
  tone: number;
}) => {
  const analysisIndex = getAnalysisSampleIndex(analysisWidth, analysisHeight, targetSize, x, y);
  const pixelOffset = analysisIndex * 4;
  const sampleColor = {
    red: rgba[pixelOffset] ?? 0,
    green: rgba[pixelOffset + 1] ?? 0,
    blue: rgba[pixelOffset + 2] ?? 0,
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

const createBlurredBackgroundCanvas = ({
  featureGrid,
  normalized,
}: {
  featureGrid: FeatureGrid;
  normalized: NormalizedImageAsciiEffectParams;
}) => {
  const canvas = createLayerCanvas(featureGrid.width, featureGrid.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error("Failed to acquire ASCII blurred-source context.");
  }

  context.save();
  context.filter = `blur(${resolveBlurRadiusPx(
    normalized.backgroundBlur,
    Math.min(featureGrid.width, featureGrid.height)
  ).toFixed(2)}px)`;
  context.drawImage(featureGrid.sourceCanvas, 0, 0, canvas.width, canvas.height);
  context.restore();
  return canvas;
};

export const createAsciiFeatureGrid = ({
  sourceCanvas,
  transform,
  quality,
  revisionKey,
  targetSize,
  maskRevisionKey,
}: {
  sourceCanvas: HTMLCanvasElement;
  transform: ImageAsciiCarrierTransformNode;
  quality: ImageRenderQuality;
  revisionKey: string;
  targetSize: ImageRenderTargetSize;
  maskRevisionKey?: string | null;
}): FeatureGrid => {
  const normalized = normalizeImageAsciiEffectParams(transform.params);
  const analysis = getOrCreateAsciiAnalysisEntry({
    revisionKey,
    stage: "carrier",
    analysisSource: transform.analysisSource,
    targetSize,
    quality,
    maskRevisionKey,
    sourceCanvas,
  });

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
  const toneByCell = new Float32Array(columns * rows);
  const alphaByCell = new Float32Array(columns * rows);
  const analysisIndexByCell = new Uint32Array(columns * rows);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const cellX = column * cellWidth;
      const cellY = row * cellHeight;
      const centerX = Math.min(width - 1, cellX + cellWidth / 2);
      const centerY = Math.min(height - 1, cellY + cellHeight / 2);
      const analysisIndex = getAnalysisSampleIndex(
        analysis.analysisWidth,
        analysis.analysisHeight,
        targetSize,
        centerX,
        centerY
      );
      analysisIndexByCell[index] = analysisIndex;
      const cellAlpha = analysis.alpha[analysisIndex] ?? 0;
      alphaByCell[index] = cellAlpha;
      if (cellAlpha <= ALPHA_CUTOFF) {
        toneByCell[index] = 0;
        continue;
      }

      let tone = analysis.luminance[analysisIndex] ?? 0;
      if (normalized.invert) {
        tone = 1 - tone;
      }
      tone = clamp((tone - 0.5) * normalized.contrast + 0.5 + normalized.brightness / 100, 0, 1);
      tone = clamp(tone + (analysis.edge[analysisIndex] ?? 0) * normalized.edgeEmphasis, 0, 1);
      tone = Math.pow(tone, 1 / normalized.density);

      const coverageThreshold = 1 - normalized.coverage;
      toneByCell[index] =
        tone <= coverageThreshold
          ? 0
          : clamp((tone - coverageThreshold) / Math.max(0.0001, 1 - coverageThreshold), 0, 1);
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

  const cells: FeatureGrid["cells"] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const cellX = column * cellWidth;
      const cellY = row * cellHeight;
      const drawWidth = Math.min(cellWidth, width - cellX);
      const drawHeight = Math.min(cellHeight, height - cellY);
      const visibleTone = toneByCell[index] ?? 0;
      const analysisIndex = analysisIndexByCell[index] ?? 0;
      const sampleColor = getSampleColor({
        analysisHeight: analysis.analysisHeight,
        analysisWidth: analysis.analysisWidth,
        rgba: analysis.rgba,
        targetSize,
        x: cellX + drawWidth / 2,
        y: cellY + drawHeight / 2,
        normalized,
        tone: visibleTone,
      });

      cells.push({
        x: cellX,
        y: cellY,
        width: drawWidth,
        height: drawHeight,
        alpha: alphaByCell[index] ?? 0,
        tone: visibleTone,
        edge: analysis.edge[analysisIndex] ?? 0,
        sampleColor,
      });
    }
  }

  return {
    width,
    height,
    cellWidth,
    cellHeight,
    columns,
    rows,
    sourceCanvas,
    cells,
  };
};

export const createAsciiGridSurface = ({
  featureGrid,
  transform,
}: {
  featureGrid: FeatureGrid;
  transform: ImageAsciiCarrierTransformNode;
}): GridSurface => {
  const normalized = normalizeImageAsciiEffectParams(transform.params);
  const backgroundColor = parseHexColor(normalized.backgroundColor);
  const charset = CHARSET_PRESETS[normalized.preset] ?? CHARSET_PRESETS.standard;
  const glyphSteps = Math.max(1, charset.length - 1);

  return {
    width: featureGrid.width,
    height: featureGrid.height,
    cellWidth: featureGrid.cellWidth,
    cellHeight: featureGrid.cellHeight,
    backgroundFill:
      normalized.backgroundMode === "solid"
        ? formatRgba(
            backgroundColor.red,
            backgroundColor.green,
            backgroundColor.blue,
            normalized.backgroundOpacity
          )
        : null,
    backgroundCanvas:
      normalized.backgroundMode === "blurred-source"
        ? createBlurredBackgroundCanvas({
            featureGrid,
            normalized,
          })
        : null,
    foregroundBlendMode: normalized.foregroundBlendMode,
    gridOverlay: normalized.gridOverlay,
    gridOverlayAlpha: 0.08 * normalized.foregroundOpacity,
    cells: featureGrid.cells.map((cell) => {
      const foregroundFill =
        cell.tone > 0.001 && cell.alpha > ALPHA_CUTOFF
          ? formatRgba(
              cell.sampleColor.red,
              cell.sampleColor.green,
              cell.sampleColor.blue,
              normalized.foregroundOpacity * Math.max(0.12, cell.tone) * cell.alpha
            )
          : null;
      const backgroundFill =
        normalized.backgroundMode === "cell-solid" && cell.tone > 0.001 && cell.alpha > ALPHA_CUTOFF
          ? formatRgba(
              backgroundColor.red,
              backgroundColor.green,
              backgroundColor.blue,
              normalized.backgroundOpacity * cell.alpha
            )
          : null;

      if (normalized.renderMode === "dot") {
        return {
          x: cell.x,
          y: cell.y,
          width: cell.width,
          height: cell.height,
          backgroundFill,
          foregroundFill,
          glyph: null,
          dotRadius:
            cell.tone > 0.001 && cell.alpha > ALPHA_CUTOFF
              ? Math.max(1, Math.min(cell.width, cell.height) * 0.45 * cell.tone)
              : null,
        };
      }

      const glyphIndex = Math.round(clamp(cell.tone, 0, 1) * glyphSteps);
      const glyph = cell.tone > 0.001 && cell.alpha > ALPHA_CUTOFF ? charset[glyphIndex] ?? " " : " ";

      return {
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
        backgroundFill,
        foregroundFill,
        glyph: glyph === " " ? null : glyph,
        dotRadius: null,
      };
    }),
  };
};

export const materializeAsciiGridSurface = ({
  targetCanvas,
  surface,
}: {
  targetCanvas: HTMLCanvasElement;
  surface: GridSurface;
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

  if (surface.backgroundFill) {
    backgroundContext.fillStyle = surface.backgroundFill;
    backgroundContext.fillRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
  }
  if (surface.backgroundCanvas) {
    backgroundContext.drawImage(surface.backgroundCanvas, 0, 0, backgroundCanvas.width, backgroundCanvas.height);
  }

  for (const cell of surface.cells) {
    if (cell.backgroundFill) {
      backgroundContext.fillStyle = cell.backgroundFill;
      backgroundContext.fillRect(cell.x, cell.y, cell.width, cell.height);
    }
    if (!cell.foregroundFill) {
      continue;
    }

    foregroundContext.fillStyle = cell.foregroundFill;
    if (cell.dotRadius) {
      foregroundContext.beginPath();
      foregroundContext.arc(
        cell.x + cell.width / 2,
        cell.y + cell.height / 2,
        cell.dotRadius,
        0,
        Math.PI * 2
      );
      foregroundContext.fill();
      continue;
    }
    if (!cell.glyph) {
      continue;
    }
    foregroundContext.fillText(cell.glyph, cell.x + cell.width / 2, cell.y + cell.height / 2);
  }

  if (surface.gridOverlay) {
    drawGridOverlay(foregroundCanvas, surface.cellWidth, surface.cellHeight, surface.gridOverlayAlpha);
  }

  targetContext.save();
  if (surface.backgroundFill || surface.backgroundCanvas || surface.cells.some((cell) => cell.backgroundFill)) {
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

export const applyImageAsciiCarrierTransform = ({
  targetCanvas,
  sourceCanvas,
  transform,
  quality,
  revisionKey,
  targetSize,
  maskRevisionKey,
}: {
  targetCanvas: HTMLCanvasElement;
  sourceCanvas: HTMLCanvasElement;
  transform: ImageAsciiCarrierTransformNode;
  quality: ImageRenderQuality;
  revisionKey: string;
  targetSize: ImageRenderTargetSize;
  maskRevisionKey?: string | null;
}) => {
  const featureGrid = createAsciiFeatureGrid({
    sourceCanvas,
    transform,
    quality,
    revisionKey,
    targetSize,
    maskRevisionKey,
  });
  const gridSurface = createAsciiGridSurface({
    featureGrid,
    transform,
  });

  try {
    return materializeAsciiGridSurface({
      targetCanvas,
      surface: gridSurface,
    });
  } finally {
    if (gridSurface.backgroundCanvas) {
      gridSurface.backgroundCanvas.width = 0;
      gridSurface.backgroundCanvas.height = 0;
    }
  }
};
