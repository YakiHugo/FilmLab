import { clamp } from "@/lib/math";
import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import { applyTimestampOverlayOnGpuToSurface } from "@/lib/renderer/gpuTimestampOverlay";

export interface TimestampOverlayAdjustments {
  timestampEnabled: boolean;
  timestampOpacity: number;
  timestampPosition: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  timestampSize: number;
}

export interface TimestampOverlayGpuInput {
  width: number;
  height: number;
  fontFamily: string;
  fontSizePx: number;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  textStartX: number;
  textStartY: number;
  cellWidth: number;
  cellHeight: number;
  charCount: number;
  glyphIndices: Float32Array;
  charset: readonly string[];
  backgroundColorRgba: Uint8ClampedArray;
  textColorRgba: Uint8ClampedArray;
}

export const TIMESTAMP_FONTS = '"Space Grotesk", "Work Sans", sans-serif';
export const TIMESTAMP_GPU_MAX_CHARS = 64;
const TIMESTAMP_OVERLAY_RASTER_CACHE_MAX_ENTRIES = 12;
const timestampOverlayRasterCache = new Map<
  string,
  {
    canvas: HTMLCanvasElement;
    lastUsedAt: number;
  }
>();

/**
 * Ensure the timestamp font is loaded before measuring/drawing text.
 * Falls back gracefully after a short timeout so rendering is never blocked.
 */
const ensureFontLoaded = async (): Promise<void> => {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.race([
      document.fonts.load(`16px ${TIMESTAMP_FONTS}`),
      new Promise<void>((resolve) => setTimeout(resolve, 500)),
    ]);
  } catch {
    // Font loading failed — proceed with fallback font
  }
};

/** Pre-warm the font on module load (non-blocking). */
void ensureFontLoaded();

export const normalizeTimestampOverlayText = (timestampText?: string | null) =>
  (timestampText?.trim() ?? "").slice(0, TIMESTAMP_GPU_MAX_CHARS);

export const createTimestampOverlayGpuInput = ({
  width,
  height,
  adjustments,
  timestampText,
}: {
  width: number;
  height: number;
  adjustments: TimestampOverlayAdjustments;
  timestampText?: string | null;
}): TimestampOverlayGpuInput | null => {
  if (!adjustments.timestampEnabled) {
    return null;
  }

  const text = normalizeTimestampOverlayText(timestampText);
  if (!text) {
    return null;
  }

  const alpha = clamp(adjustments.timestampOpacity / 100, 0, 1);
  if (alpha <= 0.001) {
    return null;
  }

  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const fontSize = clamp(adjustments.timestampSize, 12, 48);
  const margin = Math.max(12, Math.round(Math.min(safeWidth, safeHeight) * 0.04));
  const cellWidth = Math.max(6, Math.round(fontSize * 0.62));
  const cellHeight = Math.max(fontSize, Math.round(fontSize * 1.1));
  const bgPaddingX = fontSize * 0.5;
  const bgPaddingY = fontSize * 0.35;
  const textWidth = text.length * cellWidth;
  const rectWidth = textWidth + bgPaddingX * 2;
  const rectHeight = cellHeight + bgPaddingY * 2;
  const rectLeft =
    adjustments.timestampPosition === "bottom-right" || adjustments.timestampPosition === "top-right"
      ? clamp(safeWidth - margin - rectWidth, 0, Math.max(0, safeWidth - rectWidth))
      : clamp(margin, 0, Math.max(0, safeWidth - rectWidth));
  const rectTop =
    adjustments.timestampPosition === "bottom-left" || adjustments.timestampPosition === "bottom-right"
      ? clamp(safeHeight - margin - rectHeight, 0, Math.max(0, safeHeight - rectHeight))
      : clamp(margin, 0, Math.max(0, safeHeight - rectHeight));
  const textStartX = rectLeft + bgPaddingX;
  const textStartY = rectTop + bgPaddingY;
  const charset = Array.from(new Set(text.split("")));
  const glyphIndexByChar = new Map(charset.map((glyph, index) => [glyph, index]));
  const glyphIndices = new Float32Array(TIMESTAMP_GPU_MAX_CHARS);
  glyphIndices.fill(-1);
  for (let index = 0; index < text.length; index += 1) {
    glyphIndices[index] = glyphIndexByChar.get(text[index] ?? "") ?? -1;
  }

  return {
    width: safeWidth,
    height: safeHeight,
    fontFamily: TIMESTAMP_FONTS,
    fontSizePx: fontSize,
    rectLeft,
    rectTop,
    rectWidth,
    rectHeight,
    textStartX,
    textStartY,
    cellWidth,
    cellHeight,
    charCount: text.length,
    glyphIndices,
    charset,
    backgroundColorRgba: new Uint8ClampedArray([0, 0, 0, Math.round(alpha * 0.34 * 255)]),
    textColorRgba: new Uint8ClampedArray([255, 250, 242, Math.round(alpha * 0.95 * 255)]),
  };
};

const buildTimestampOverlayRasterCacheKey = ({
  width,
  height,
  adjustments,
  timestampText,
}: {
  width: number;
  height: number;
  adjustments: TimestampOverlayAdjustments;
  timestampText?: string | null;
}) => {
  if (!adjustments.timestampEnabled) {
    return null;
  }

  const text = normalizeTimestampOverlayText(timestampText);
  if (!text) {
    return null;
  }

  const alpha = clamp(adjustments.timestampOpacity / 100, 0, 1);
  if (alpha <= 0.001) {
    return null;
  }

  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const fontSize = clamp(adjustments.timestampSize, 12, 48);

  return [
    "timestamp-overlay",
    `${safeWidth}x${safeHeight}`,
    adjustments.timestampPosition,
    fontSize,
    alpha.toFixed(4),
    text,
  ].join(":");
};

const releaseTimestampOverlayRaster = (canvas: HTMLCanvasElement) => {
  canvas.width = 0;
  canvas.height = 0;
};

const pruneTimestampOverlayRasterCache = () => {
  while (timestampOverlayRasterCache.size > TIMESTAMP_OVERLAY_RASTER_CACHE_MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;
    for (const [key, value] of timestampOverlayRasterCache.entries()) {
      if (value.lastUsedAt < oldestTime) {
        oldestTime = value.lastUsedAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) {
      break;
    }
    const oldest = timestampOverlayRasterCache.get(oldestKey);
    if (oldest) {
      releaseTimestampOverlayRaster(oldest.canvas);
    }
    timestampOverlayRasterCache.delete(oldestKey);
  }
};

const renderTimestampOverlayRaster = async ({
  width,
  height,
  adjustments,
  timestampText,
}: {
  width: number;
  height: number;
  adjustments: TimestampOverlayAdjustments;
  timestampText?: string | null;
}) => {
  if (typeof document === "undefined") {
    return null;
  }

  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const text = normalizeTimestampOverlayText(timestampText);
  if (!adjustments.timestampEnabled || !text) {
    return null;
  }

  const alpha = clamp(adjustments.timestampOpacity / 100, 0, 1);
  if (alpha <= 0.001) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = safeWidth;
  canvas.height = safeHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    releaseTimestampOverlayRaster(canvas);
    return null;
  }

  await ensureFontLoaded();

  const fontSize = clamp(adjustments.timestampSize, 12, 48);
  const margin = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) * 0.04));

  context.save();
  context.globalAlpha = alpha;
  context.font = `${Math.round(fontSize)}px ${TIMESTAMP_FONTS}`;
  context.textBaseline = "bottom";
  context.textAlign = "left";
  const textMetrics = context.measureText(text);
  const textWidth = textMetrics.width;
  const textHeight = Math.max(fontSize, fontSize * 1.1);

  let x = margin;
  let y = canvas.height - margin;
  switch (adjustments.timestampPosition) {
    case "bottom-left":
      x = margin;
      y = canvas.height - margin;
      context.textAlign = "left";
      context.textBaseline = "bottom";
      break;
    case "bottom-right":
      x = canvas.width - margin;
      y = canvas.height - margin;
      context.textAlign = "right";
      context.textBaseline = "bottom";
      break;
    case "top-left":
      x = margin;
      y = margin;
      context.textAlign = "left";
      context.textBaseline = "top";
      break;
    case "top-right":
      x = canvas.width - margin;
      y = margin;
      context.textAlign = "right";
      context.textBaseline = "top";
      break;
    default:
      break;
  }

  const bgPaddingX = fontSize * 0.5;
  const bgPaddingY = fontSize * 0.35;
  const rectWidth = textWidth + bgPaddingX * 2;
  const rectHeight = textHeight + bgPaddingY * 2;

  let rectLeft = x - bgPaddingX;
  if (context.textAlign === "right") {
    rectLeft = x - rectWidth + bgPaddingX;
  }
  let rectTop = y - rectHeight + bgPaddingY;
  if (context.textBaseline === "top") {
    rectTop = y - bgPaddingY;
  }
  rectLeft = clamp(rectLeft, 0, Math.max(0, canvas.width - rectWidth));
  rectTop = clamp(rectTop, 0, Math.max(0, canvas.height - rectHeight));

  context.fillStyle = "rgba(0, 0, 0, 0.34)";
  context.fillRect(rectLeft, rectTop, rectWidth, rectHeight);
  context.fillStyle = "rgba(255, 250, 242, 0.95)";
  context.fillText(text, x, y);
  context.restore();
  return canvas;
};

export const getOrCreateTimestampOverlayRaster = async ({
  width,
  height,
  adjustments,
  timestampText,
}: {
  width: number;
  height: number;
  adjustments: TimestampOverlayAdjustments;
  timestampText?: string | null;
}) => {
  const cacheKey = buildTimestampOverlayRasterCacheKey({
    width,
    height,
    adjustments,
    timestampText,
  });
  if (!cacheKey) {
    return null;
  }

  const cached = timestampOverlayRasterCache.get(cacheKey);
  if (cached) {
    cached.lastUsedAt = Date.now();
    return cached.canvas;
  }

  const canvas = await renderTimestampOverlayRaster({
    width,
    height,
    adjustments,
    timestampText,
  });
  if (!canvas) {
    return null;
  }

  timestampOverlayRasterCache.set(cacheKey, {
    canvas,
    lastUsedAt: Date.now(),
  });
  pruneTimestampOverlayRasterCache();
  return canvas;
};

export const clearTimestampOverlayRasterCache = () => {
  for (const { canvas } of timestampOverlayRasterCache.values()) {
    releaseTimestampOverlayRaster(canvas);
  }
  timestampOverlayRasterCache.clear();
};

export const applyTimestampOverlay = async (
  canvas: HTMLCanvasElement,
  adjustments: TimestampOverlayAdjustments,
  timestampText?: string | null
) => {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context || typeof context.drawImage !== "function") {
    return;
  }

  const raster = await getOrCreateTimestampOverlayRaster({
    width: canvas.width,
    height: canvas.height,
    adjustments,
    timestampText,
  });
  if (!raster) {
    return;
  }

  context.drawImage(raster, 0, 0, canvas.width, canvas.height);
};

export const applyTimestampOverlayToSurfaceIfSupported = async ({
  surface,
  adjustments,
  timestampText,
  slotId,
}: {
  surface: RenderSurfaceHandle;
  adjustments: TimestampOverlayAdjustments;
  timestampText?: string | null;
  slotId?: string;
}) => {
  const overlay = createTimestampOverlayGpuInput({
    width: surface.width,
    height: surface.height,
    adjustments,
    timestampText,
  });
  if (!overlay) {
    return surface;
  }

  return applyTimestampOverlayOnGpuToSurface({
    surface,
    overlay,
    slotId,
  });
};
