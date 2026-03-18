import { clamp } from "@/lib/math";
import type { AsciiAdjustments } from "@/types";

type AsciiQualityProfile = "interactive" | "full";

const CHARSET_PRESETS: Record<AsciiAdjustments["charsetPreset"], string[]> = {
  standard: "@%#*+=-:. ".split(""),
  blocks: "█▓▒░ ".split(""),
  detailed: "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ".split(""),
};

const ALPHA_CUTOFF = 0.05;
const GLYPH_WIDTH_RATIO = 0.62;

const formatNumberToken = (value: number, precision = 2) => {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return value.toFixed(precision);
};

const resolveEffectiveCellSize = (ascii: AsciiAdjustments, qualityProfile: AsciiQualityProfile) =>
  qualityProfile === "interactive"
    ? clamp(Math.round(ascii.cellSize * 1.35), ascii.cellSize, 24)
    : ascii.cellSize;

export const asciiAdjustmentsEqual = (
  left: AsciiAdjustments | undefined,
  right: AsciiAdjustments | undefined
) => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.enabled === right.enabled &&
    left.charsetPreset === right.charsetPreset &&
    left.colorMode === right.colorMode &&
    left.cellSize === right.cellSize &&
    left.characterSpacing === right.characterSpacing &&
    left.contrast === right.contrast &&
    left.dither === right.dither &&
    left.invert === right.invert
  );
};

export const buildAsciiOutputToken = (ascii: AsciiAdjustments | undefined) => {
  if (!ascii?.enabled) {
    return "ascii:off";
  }
  return [
    "ascii:on",
    ascii.charsetPreset,
    ascii.colorMode,
    formatNumberToken(ascii.cellSize, 0),
    formatNumberToken(ascii.characterSpacing),
    formatNumberToken(ascii.contrast),
    ascii.dither,
    ascii.invert ? "1" : "0",
  ].join(":");
};

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

export const applyAsciiRasterEffect = ({
  canvas,
  ascii,
  qualityProfile,
}: {
  canvas: HTMLCanvasElement;
  ascii: AsciiAdjustments | undefined;
  qualityProfile: AsciiQualityProfile;
}) => {
  if (
    !ascii?.enabled ||
    canvas.width <= 0 ||
    canvas.height <= 0 ||
    typeof document === "undefined"
  ) {
    return false;
  }

  const outputContext = canvas.getContext("2d", { willReadFrequently: true });
  if (!outputContext) {
    return false;
  }

  const charset = CHARSET_PRESETS[ascii.charsetPreset] ?? CHARSET_PRESETS.standard;
  if (charset.length < 2) {
    return false;
  }

  const sourceCanvas = document.createElement("canvas");
  const sampleCanvas = document.createElement("canvas");
  const asciiCanvas = document.createElement("canvas");

  sourceCanvas.width = canvas.width;
  sourceCanvas.height = canvas.height;
  asciiCanvas.width = canvas.width;
  asciiCanvas.height = canvas.height;

  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  const asciiContext = asciiCanvas.getContext("2d", { willReadFrequently: true });

  if (!sourceContext || !sampleContext || !asciiContext) {
    sourceCanvas.width = 0;
    sourceCanvas.height = 0;
    sampleCanvas.width = 0;
    sampleCanvas.height = 0;
    asciiCanvas.width = 0;
    asciiCanvas.height = 0;
    return false;
  }

  try {
    sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceContext.drawImage(canvas, 0, 0);

    const effectiveCellSize = resolveEffectiveCellSize(ascii, qualityProfile);
    const cellHeight = Math.max(6, Math.round(effectiveCellSize));
    const cellWidth = Math.max(
      4,
      Math.round(cellHeight * GLYPH_WIDTH_RATIO * ascii.characterSpacing)
    );
    const columns = Math.max(1, Math.ceil(canvas.width / cellWidth));
    const rows = Math.max(1, Math.ceil(canvas.height / cellHeight));

    sampleCanvas.width = columns;
    sampleCanvas.height = rows;
    sampleContext.clearRect(0, 0, columns, rows);
    sampleContext.drawImage(sourceCanvas, 0, 0, columns, rows);

    const { data } = sampleContext.getImageData(0, 0, columns, rows);
    const luminance = new Float32Array(columns * rows);
    const alpha = new Float32Array(columns * rows);

    for (let index = 0; index < columns * rows; index += 1) {
      const offset = index * 4;
      const alphaValue = (data[offset + 3] ?? 0) / 255;
      alpha[index] = alphaValue;
      if (alphaValue <= ALPHA_CUTOFF) {
        luminance[index] = ascii.invert ? 0 : 1;
        continue;
      }

      const red = (data[offset] ?? 0) / 255;
      const green = (data[offset + 1] ?? 0) / 255;
      const blue = (data[offset + 2] ?? 0) / 255;
      const baseLuminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const contrasted = clamp((baseLuminance - 0.5) * ascii.contrast + 0.5, 0, 1);
      luminance[index] = ascii.invert ? 1 - contrasted : contrasted;
    }

    const quantized = Float32Array.from(luminance);
    const glyphSteps = charset.length - 1;
    if (ascii.dither === "floyd-steinberg" && glyphSteps > 0) {
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < columns; x += 1) {
          const index = y * columns + x;
          if (alpha[index] <= ALPHA_CUTOFF) {
            continue;
          }
          const current = quantized[index];
          const bucket = Math.round(current * glyphSteps);
          const quantizedValue = bucket / glyphSteps;
          quantized[index] = quantizedValue;
          distributeDitherError(quantized, x, y, columns, rows, current - quantizedValue);
        }
      }
    }

    asciiContext.clearRect(0, 0, asciiCanvas.width, asciiCanvas.height);
    asciiContext.textAlign = "center";
    asciiContext.textBaseline = "middle";
    asciiContext.font = `${Math.max(6, Math.round(cellHeight * 0.9))}px monospace`;

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const index = y * columns + x;
        const cellAlpha = alpha[index] ?? 0;
        if (cellAlpha <= ALPHA_CUTOFF) {
          continue;
        }

        const pixelOffset = index * 4;
        const glyphIndex = Math.round(clamp(quantized[index] ?? 0, 0, 1) * glyphSteps);
        const glyph = charset[glyphIndex] ?? " ";
        const cellX = x * cellWidth;
        const cellY = y * cellHeight;
        const drawWidth = Math.min(cellWidth, canvas.width - cellX);
        const drawHeight = Math.min(cellHeight, canvas.height - cellY);

        asciiContext.fillStyle = `rgba(0, 0, 0, ${formatNumberToken(cellAlpha, 3)})`;
        asciiContext.fillRect(cellX, cellY, drawWidth, drawHeight);

        if (glyph === " ") {
          continue;
        }

        if (ascii.colorMode === "full-color") {
          asciiContext.fillStyle = `rgba(${data[pixelOffset] ?? 0}, ${data[pixelOffset + 1] ?? 0}, ${data[pixelOffset + 2] ?? 0}, ${formatNumberToken(cellAlpha, 3)})`;
        } else {
          asciiContext.fillStyle = `rgba(245, 245, 245, ${formatNumberToken(cellAlpha, 3)})`;
        }

        asciiContext.fillText(glyph, cellX + drawWidth / 2, cellY + drawHeight / 2);
      }
    }

    outputContext.clearRect(0, 0, canvas.width, canvas.height);
    outputContext.drawImage(asciiCanvas, 0, 0);
    return true;
  } finally {
    sourceCanvas.width = 0;
    sourceCanvas.height = 0;
    sampleCanvas.width = 0;
    sampleCanvas.height = 0;
    asciiCanvas.width = 0;
    asciiCanvas.height = 0;
  }
};
