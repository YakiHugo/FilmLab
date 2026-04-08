import { clamp } from "@/lib/math";
import type {
  ImageAnalysisSource,
  ImageEffectPlacement,
  ImageRenderQuality,
  ImageRenderTargetSize,
} from "./types";

export interface AsciiAnalysisCacheKeyInput {
  revisionKey: string;
  placement: ImageEffectPlacement;
  analysisSource: ImageAnalysisSource;
  targetSize: ImageRenderTargetSize;
  quality: ImageRenderQuality;
  maskRevisionKey?: string | null;
}

export interface AsciiAnalysisEntry {
  key: string;
  analysisWidth: number;
  analysisHeight: number;
  rgba: Uint8ClampedArray;
  alpha: Float32Array;
  luminance: Float32Array;
  edge: Float32Array;
  sourceCanvas: HTMLCanvasElement;
  blurredSourceCanvasByRadius: Map<string, HTMLCanvasElement>;
}

const ANALYSIS_LONG_EDGE_CAP: Record<ImageRenderQuality, number> = {
  interactive: 768,
  full: 1536,
};

const ASCII_ANALYSIS_CACHE_MAX_ENTRIES = 6;

const asciiAnalysisCache = new Map<
  string,
  {
    entry: AsciiAnalysisEntry;
    lastUsedAt: number;
  }
>();

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const resolveAnalysisSize = (
  targetSize: ImageRenderTargetSize,
  quality: ImageRenderQuality
): ImageRenderTargetSize => {
  const width = Math.max(1, Math.round(targetSize.width));
  const height = Math.max(1, Math.round(targetSize.height));
  const longEdge = Math.max(width, height);
  const cap = ANALYSIS_LONG_EDGE_CAP[quality];
  if (longEdge <= cap) {
    return { width, height };
  }

  const scale = cap / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const cleanupAsciiAnalysisEntry = (entry: AsciiAnalysisEntry) => {
  entry.sourceCanvas.width = 0;
  entry.sourceCanvas.height = 0;
  for (const canvas of entry.blurredSourceCanvasByRadius.values()) {
    canvas.width = 0;
    canvas.height = 0;
  }
  entry.blurredSourceCanvasByRadius.clear();
};

const evictAsciiAnalysisCacheIfNeeded = () => {
  while (asciiAnalysisCache.size > ASCII_ANALYSIS_CACHE_MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;
    for (const [key, value] of asciiAnalysisCache.entries()) {
      if (value.lastUsedAt < oldestTime) {
        oldestTime = value.lastUsedAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) {
      break;
    }
    const oldest = asciiAnalysisCache.get(oldestKey);
    if (oldest) {
      cleanupAsciiAnalysisEntry(oldest.entry);
    }
    asciiAnalysisCache.delete(oldestKey);
  }
};

const cloneCanvas = (sourceCanvas: HTMLCanvasElement) => {
  const clone = document.createElement("canvas");
  clone.width = sourceCanvas.width;
  clone.height = sourceCanvas.height;
  const context = clone.getContext("2d", { willReadFrequently: true });
  if (!context) {
    clone.width = 0;
    clone.height = 0;
    throw new Error("Failed to acquire ASCII analysis clone context.");
  }
  context.clearRect(0, 0, clone.width, clone.height);
  context.drawImage(sourceCanvas, 0, 0);
  return clone;
};

const buildEdgeMap = (luminance: Float32Array, width: number, height: number) => {
  const edge = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const left = luminance[y * width + Math.max(0, x - 1)] ?? 0;
      const right = luminance[y * width + Math.min(width - 1, x + 1)] ?? 0;
      const up = luminance[Math.max(0, y - 1) * width + x] ?? 0;
      const down = luminance[Math.min(height - 1, y + 1) * width + x] ?? 0;
      edge[index] = clamp(Math.abs(right - left) + Math.abs(down - up), 0, 1);
    }
  }
  return edge;
};

export const buildAsciiAnalysisCacheKey = ({
  revisionKey,
  placement,
  analysisSource,
  targetSize,
  quality,
  maskRevisionKey,
}: AsciiAnalysisCacheKeyInput) => {
  const normalizedTargetSize = resolveAnalysisSize(targetSize, quality);
  return [
    "ascii-analysis",
    revisionKey,
    placement,
    analysisSource,
    quality,
    maskRevisionKey ?? "none",
    `${normalizedTargetSize.width}x${normalizedTargetSize.height}`,
    hashString(
      [
        revisionKey,
        placement,
        analysisSource,
        quality,
        maskRevisionKey ?? "none",
        normalizedTargetSize.width,
        normalizedTargetSize.height,
      ].join("|")
    ),
  ].join(":");
};

export const getOrCreateAsciiAnalysisEntry = ({
  revisionKey,
  placement,
  analysisSource,
  targetSize,
  quality,
  maskRevisionKey,
  sourceCanvas,
}: AsciiAnalysisCacheKeyInput & {
  sourceCanvas: HTMLCanvasElement;
}) => {
  const key = buildAsciiAnalysisCacheKey({
    revisionKey,
    placement,
    analysisSource,
    targetSize,
    quality,
    maskRevisionKey,
  });
  const cached = asciiAnalysisCache.get(key);
  if (cached) {
    cached.lastUsedAt = Date.now();
    return cached.entry;
  }

  const analysisSize = resolveAnalysisSize(targetSize, quality);
  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = analysisSize.width;
  analysisCanvas.height = analysisSize.height;
  const analysisContext = analysisCanvas.getContext("2d", { willReadFrequently: true });
  if (!analysisContext) {
    analysisCanvas.width = 0;
    analysisCanvas.height = 0;
    throw new Error("Failed to acquire ASCII analysis context.");
  }

  analysisContext.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height);
  analysisContext.drawImage(sourceCanvas, 0, 0, analysisCanvas.width, analysisCanvas.height);
  const imageData = analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
  const alpha = new Float32Array(analysisCanvas.width * analysisCanvas.height);
  const luminance = new Float32Array(analysisCanvas.width * analysisCanvas.height);

  for (let index = 0; index < alpha.length; index += 1) {
    const offset = index * 4;
    const alphaValue = (imageData.data[offset + 3] ?? 0) / 255;
    alpha[index] = alphaValue;
    const red = (imageData.data[offset] ?? 0) / 255;
    const green = (imageData.data[offset + 1] ?? 0) / 255;
    const blue = (imageData.data[offset + 2] ?? 0) / 255;
    luminance[index] = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  }

  const entry: AsciiAnalysisEntry = {
    key,
    analysisWidth: analysisCanvas.width,
    analysisHeight: analysisCanvas.height,
    rgba: new Uint8ClampedArray(imageData.data),
    alpha,
    luminance,
    edge: buildEdgeMap(luminance, analysisCanvas.width, analysisCanvas.height),
    sourceCanvas: cloneCanvas(sourceCanvas),
    blurredSourceCanvasByRadius: new Map(),
  };

  analysisCanvas.width = 0;
  analysisCanvas.height = 0;
  asciiAnalysisCache.set(key, {
    entry,
    lastUsedAt: Date.now(),
  });
  evictAsciiAnalysisCacheIfNeeded();
  return entry;
};

export const getAsciiBlurredSourceCanvas = (
  entry: AsciiAnalysisEntry,
  blurRadiusPx: number
) => {
  if (blurRadiusPx <= 0.001) {
    return entry.sourceCanvas;
  }

  const blurKey = blurRadiusPx.toFixed(2);
  const cached = entry.blurredSourceCanvasByRadius.get(blurKey);
  if (cached) {
    return cached;
  }

  const blurredCanvas = document.createElement("canvas");
  blurredCanvas.width = entry.sourceCanvas.width;
  blurredCanvas.height = entry.sourceCanvas.height;
  const context = blurredCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    blurredCanvas.width = 0;
    blurredCanvas.height = 0;
    throw new Error("Failed to acquire ASCII blurred-source context.");
  }

  context.save();
  context.filter = `blur(${blurKey}px)`;
  context.drawImage(entry.sourceCanvas, 0, 0);
  context.restore();
  entry.blurredSourceCanvasByRadius.set(blurKey, blurredCanvas);
  return blurredCanvas;
};

export const clearAsciiAnalysisCache = () => {
  for (const { entry } of asciiAnalysisCache.values()) {
    cleanupAsciiAnalysisEntry(entry);
  }
  asciiAnalysisCache.clear();
};
