import { clamp } from "@/lib/math";
import {
  getAsciiBlurredSourceCanvas,
  getOrCreateAsciiAnalysisEntry,
  type AsciiAnalysisEntry,
} from "./asciiAnalysis";
import type {
  ImageAsciiEffectNode,
  ImageRenderQuality,
  ImageRenderTargetSize,
} from "./types";

const CHARSET_PRESETS: Record<NonNullable<ImageAsciiEffectNode["params"]["preset"]>, string[]> = {
  standard: "@%#*+=-:. ".split(""),
  blocks: "█▓▒░ ".split(""),
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
    const [r, g, b] = trimmed.slice(1).split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
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

const getAnalysisSampleIndex = (
  analysis: AsciiAnalysisEntry,
  targetSize: ImageRenderTargetSize,
  x: number,
  y: number
) => {
  const normalizedX = targetSize.width <= 1 ? 0 : clamp(x / (targetSize.width - 1), 0, 1);
  const normalizedY = targetSize.height <= 1 ? 0 : clamp(y / (targetSize.height - 1), 0, 1);
  const analysisX = Math.min(
    analysis.analysisWidth - 1,
    Math.max(0, Math.round(normalizedX * (analysis.analysisWidth - 1)))
  );
  const analysisY = Math.min(
    analysis.analysisHeight - 1,
    Math.max(0, Math.round(normalizedY * (analysis.analysisHeight - 1)))
  );
  return analysisY * analysis.analysisWidth + analysisX;
};

export const normalizeImageAsciiEffectParams = (
  params: ImageAsciiEffectNode["params"]
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

const getSampleColor = (
  analysis: AsciiAnalysisEntry,
  targetSize: ImageRenderTargetSize,
  x: number,
  y: number,
  normalized: NormalizedImageAsciiEffectParams,
  tone: number
) => {
  const analysisIndex = getAnalysisSampleIndex(analysis, targetSize, x, y);
  const pixelOffset = analysisIndex * 4;
  const sampleColor = {
    red: analysis.rgba[pixelOffset] ?? 0,
    green: analysis.rgba[pixelOffset + 1] ?? 0,
    blue: analysis.rgba[pixelOffset + 2] ?? 0,
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

const createLayerCanvas = (targetCanvas: HTMLCanvasElement) => {
  const canvas = document.createElement("canvas");
  canvas.width = targetCanvas.width;
  canvas.height = targetCanvas.height;
  return canvas;
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

export const applyImageAsciiEffect = ({
  targetCanvas,
  sourceCanvas,
  effect,
  quality,
  revisionKey,
  targetSize,
  maskRevisionKey,
}: {
  targetCanvas: HTMLCanvasElement;
  sourceCanvas: HTMLCanvasElement;
  effect: ImageAsciiEffectNode;
  quality: ImageRenderQuality;
  revisionKey: string;
  targetSize: ImageRenderTargetSize;
  maskRevisionKey?: string | null;
}) => {
  if (targetCanvas.width <= 0 || targetCanvas.height <= 0 || typeof document === "undefined") {
    return false;
  }

  const isLegacyAsciiEffect = effect.id === "legacy-ascii";
  const normalized = normalizeImageAsciiEffectParams(effect.params);
  const targetContext = targetCanvas.getContext("2d", { willReadFrequently: true });
  if (!targetContext) {
    return false;
  }

  const analysis = getOrCreateAsciiAnalysisEntry({
    revisionKey,
    placement: effect.placement,
    analysisSource: effect.analysisSource,
    targetSize,
    quality,
    maskRevisionKey,
    sourceCanvas,
  });

  const backgroundCanvas = createLayerCanvas(targetCanvas);
  const foregroundCanvas = createLayerCanvas(targetCanvas);
  const backgroundContext = backgroundCanvas.getContext("2d", { willReadFrequently: true });
  const foregroundContext = foregroundCanvas.getContext("2d", { willReadFrequently: true });

  if (!backgroundContext || !foregroundContext) {
    backgroundCanvas.width = 0;
    backgroundCanvas.height = 0;
    foregroundCanvas.width = 0;
    foregroundCanvas.height = 0;
    return false;
  }

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
  const columns = Math.max(1, Math.ceil(targetCanvas.width / cellWidth));
  const rows = Math.max(1, Math.ceil(targetCanvas.height / cellHeight));
  const backgroundColor = parseHexColor(normalized.backgroundColor);
  const charset = CHARSET_PRESETS[normalized.preset] ?? CHARSET_PRESETS.standard;
  const toneByCell = new Float32Array(columns * rows);
  const alphaByCell = new Float32Array(columns * rows);
  const glyphSteps = Math.max(1, charset.length - 1);

  foregroundContext.textAlign = "center";
  foregroundContext.textBaseline = "middle";
  foregroundContext.font = `${Math.max(6, Math.round(cellHeight * 0.9))}px monospace`;

  if (normalized.backgroundMode === "solid") {
    backgroundContext.fillStyle = formatRgba(
      backgroundColor.red,
      backgroundColor.green,
      backgroundColor.blue,
      normalized.backgroundOpacity
    );
    backgroundContext.fillRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
  } else if (normalized.backgroundMode === "blurred-source") {
    const blurredSource = getAsciiBlurredSourceCanvas(
      analysis,
      resolveBlurRadiusPx(normalized.backgroundBlur, Math.min(targetCanvas.width, targetCanvas.height))
    );
    backgroundContext.save();
    backgroundContext.globalAlpha = normalized.backgroundOpacity;
    backgroundContext.drawImage(blurredSource, 0, 0, backgroundCanvas.width, backgroundCanvas.height);
    backgroundContext.restore();
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const cellX = column * cellWidth;
      const cellY = row * cellHeight;
      const centerX = Math.min(targetCanvas.width - 1, cellX + cellWidth / 2);
      const centerY = Math.min(targetCanvas.height - 1, cellY + cellHeight / 2);
      const analysisIndex = getAnalysisSampleIndex(analysis, targetSize, centerX, centerY);
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

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const visibleTone = toneByCell[index] ?? 0;
      const cellAlpha = alphaByCell[index] ?? 0;
      if (cellAlpha <= ALPHA_CUTOFF) {
        continue;
      }

      const cellX = column * cellWidth;
      const cellY = row * cellHeight;
      const drawWidth = Math.min(cellWidth, targetCanvas.width - cellX);
      const drawHeight = Math.min(cellHeight, targetCanvas.height - cellY);

      if (normalized.backgroundMode === "cell-solid" && (isLegacyAsciiEffect || visibleTone > 0.001)) {
        backgroundContext.fillStyle = formatRgba(
          backgroundColor.red,
          backgroundColor.green,
          backgroundColor.blue,
          normalized.backgroundOpacity * cellAlpha
        );
        backgroundContext.fillRect(cellX, cellY, drawWidth, drawHeight);
      }

      if (visibleTone <= 0.001) {
        continue;
      }

      const sampleColor = getSampleColor(
        analysis,
        targetSize,
        cellX + drawWidth / 2,
        cellY + drawHeight / 2,
        normalized,
        visibleTone
      );
      foregroundContext.fillStyle = formatRgba(
        sampleColor.red,
        sampleColor.green,
        sampleColor.blue,
        normalized.foregroundOpacity * Math.max(0.12, visibleTone) * cellAlpha
      );

      if (normalized.renderMode === "dot") {
        foregroundContext.beginPath();
        foregroundContext.arc(
          cellX + drawWidth / 2,
          cellY + drawHeight / 2,
          Math.max(1, Math.min(drawWidth, drawHeight) * 0.45 * visibleTone),
          0,
          Math.PI * 2
        );
        foregroundContext.fill();
        continue;
      }

      const glyphIndex = Math.round(clamp(visibleTone, 0, 1) * glyphSteps);
      const glyph = charset[glyphIndex] ?? " ";
      if (glyph === " ") {
        continue;
      }
      foregroundContext.fillText(glyph, cellX + drawWidth / 2, cellY + drawHeight / 2);
    }
  }

  if (normalized.gridOverlay) {
    drawGridOverlay(foregroundCanvas, cellWidth, cellHeight, 0.08 * normalized.foregroundOpacity);
  }

  targetContext.save();
  if (isLegacyAsciiEffect) {
    targetContext.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  }
  if (normalized.backgroundMode !== "none") {
    targetContext.globalCompositeOperation = "source-over";
    targetContext.drawImage(backgroundCanvas, 0, 0);
  }
  targetContext.globalCompositeOperation = normalized.foregroundBlendMode;
  targetContext.drawImage(foregroundCanvas, 0, 0);
  targetContext.restore();

  backgroundCanvas.width = 0;
  backgroundCanvas.height = 0;
  foregroundCanvas.width = 0;
  foregroundCanvas.height = 0;
  return true;
};
