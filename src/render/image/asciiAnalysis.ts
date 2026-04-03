import { runRendererPixelReadbackOperation } from "@/lib/renderer/gpuSurfaceOperation";
import { clamp } from "@/lib/math";
import type {
  ImageAnalysisSource,
  ImageRenderQuality,
  ImageRenderTargetSize,
} from "./types";

export interface AsciiAnalysisCacheKeyInput {
  revisionKey: string;
  stage: "carrier";
  analysisSource: ImageAnalysisSource;
  targetSize: ImageRenderTargetSize;
  quality: ImageRenderQuality;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  maskRevisionKey?: string | null;
}

export interface AsciiAnalysisEntry {
  key: string;
  columns: number;
  rows: number;
  rawRgbaByCell: Uint8ClampedArray;
  alphaByCell: Float32Array;
  luminanceByCell: Float32Array;
  edgeByCell: Float32Array;
}

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
    asciiAnalysisCache.delete(oldestKey);
  }
};

const buildEdgeMap = (luminance: Float32Array, columns: number, rows: number) => {
  const edge = new Float32Array(columns * rows);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const index = y * columns + x;
      const left = luminance[y * columns + Math.max(0, x - 1)] ?? 0;
      const right = luminance[y * columns + Math.min(columns - 1, x + 1)] ?? 0;
      const up = luminance[Math.max(0, y - 1) * columns + x] ?? 0;
      const down = luminance[Math.min(rows - 1, y + 1) * columns + x] ?? 0;
      edge[index] = clamp(Math.abs(right - left) + Math.abs(down - up), 0, 1);
    }
  }
  return edge;
};

const flipReadbackRows = (rgba: Uint8Array, columns: number, rows: number) => {
  const flipped = new Uint8ClampedArray(rgba.length);
  const rowStride = Math.max(1, columns) * 4;
  for (let sourceRow = 0; sourceRow < rows; sourceRow += 1) {
    const targetRow = rows - 1 - sourceRow;
    const sourceOffset = sourceRow * rowStride;
    const targetOffset = targetRow * rowStride;
    flipped.set(rgba.subarray(sourceOffset, sourceOffset + rowStride), targetOffset);
  }
  return flipped;
};

const buildAsciiAnalysisEntryFromRgba = ({
  key,
  columns,
  rows,
  rgba,
}: {
  key: string;
  columns: number;
  rows: number;
  rgba: Uint8ClampedArray;
}): AsciiAnalysisEntry => {
  const alphaByCell = new Float32Array(columns * rows);
  const luminanceByCell = new Float32Array(columns * rows);

  for (let index = 0; index < alphaByCell.length; index += 1) {
    const offset = index * 4;
    const alphaValue = (rgba[offset + 3] ?? 0) / 255;
    alphaByCell[index] = alphaValue;
    const red = (rgba[offset] ?? 0) / 255;
    const green = (rgba[offset + 1] ?? 0) / 255;
    const blue = (rgba[offset + 2] ?? 0) / 255;
    luminanceByCell[index] = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  }

  return {
    key,
    columns,
    rows,
    rawRgbaByCell: rgba,
    alphaByCell,
    luminanceByCell,
    edgeByCell: buildEdgeMap(luminanceByCell, columns, rows),
  };
};

const readAsciiCellRgbaOnCpu = ({
  sourceCanvas,
  columns,
  rows,
}: {
  sourceCanvas: HTMLCanvasElement;
  columns: number;
  rows: number;
}) => {
  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = columns;
  analysisCanvas.height = rows;
  const analysisContext = analysisCanvas.getContext("2d", { willReadFrequently: true });
  if (!analysisContext) {
    analysisCanvas.width = 0;
    analysisCanvas.height = 0;
    throw new Error("Failed to acquire ASCII analysis context.");
  }

  analysisContext.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height);
  analysisContext.drawImage(sourceCanvas, 0, 0, analysisCanvas.width, analysisCanvas.height);
  const imageData = analysisContext.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
  const rgba = new Uint8ClampedArray(imageData.data);
  analysisCanvas.width = 0;
  analysisCanvas.height = 0;
  return rgba;
};

const readAsciiCellRgbaOnGpuIfSupported = async ({
  sourceCanvas,
  columns,
  rows,
  quality,
}: {
  sourceCanvas: HTMLCanvasElement;
  columns: number;
  rows: number;
  quality: ImageRenderQuality;
}) => {
  const readback = await runRendererPixelReadbackOperation({
    mode: quality === "full" ? "export" : "preview",
    width: columns,
    height: rows,
    slotId: "ascii-analysis",
    render: (renderer) => {
      try {
        const captured = renderer.captureLinearSource(
          sourceCanvas,
          sourceCanvas.width,
          sourceCanvas.height,
          columns,
          rows,
          {
            decodeSrgb: false,
          }
        );
        try {
          renderer.presentTextureResult(captured, {
            inputLinear: false,
            enableDither: false,
          });
          return true;
        } finally {
          captured.release();
        }
      } catch {
        return false;
      }
    },
  });
  if (!readback || readback.length !== columns * rows * 4) {
    return null;
  }
  return flipReadbackRows(readback, columns, rows);
};

export const buildAsciiAnalysisCacheKey = ({
  revisionKey,
  stage,
  analysisSource,
  targetSize,
  quality,
  cellWidth,
  cellHeight,
  columns,
  rows,
  maskRevisionKey,
}: AsciiAnalysisCacheKeyInput) =>
  [
    "ascii-analysis",
    revisionKey,
    stage,
    analysisSource,
    quality,
    maskRevisionKey ?? "none",
    `${Math.max(1, Math.round(targetSize.width))}x${Math.max(1, Math.round(targetSize.height))}`,
    `${Math.max(1, Math.round(cellWidth))}x${Math.max(1, Math.round(cellHeight))}`,
    `${Math.max(1, Math.round(columns))}x${Math.max(1, Math.round(rows))}`,
    hashString(
      [
        revisionKey,
        stage,
        analysisSource,
        quality,
        maskRevisionKey ?? "none",
        Math.max(1, Math.round(targetSize.width)),
        Math.max(1, Math.round(targetSize.height)),
        Math.max(1, Math.round(cellWidth)),
        Math.max(1, Math.round(cellHeight)),
        Math.max(1, Math.round(columns)),
        Math.max(1, Math.round(rows)),
      ].join("|")
    ),
  ].join(":");

export const getOrCreateAsciiAnalysisEntry = async ({
  revisionKey,
  stage,
  analysisSource,
  targetSize,
  quality,
  cellWidth,
  cellHeight,
  columns,
  rows,
  maskRevisionKey,
  sourceCanvas,
}: AsciiAnalysisCacheKeyInput & {
  sourceCanvas: HTMLCanvasElement;
}) => {
  const key = buildAsciiAnalysisCacheKey({
    revisionKey,
    stage,
    analysisSource,
    targetSize,
    quality,
    cellWidth,
    cellHeight,
    columns,
    rows,
    maskRevisionKey,
  });
  const cached = asciiAnalysisCache.get(key);
  if (cached) {
    cached.lastUsedAt = Date.now();
    return cached.entry;
  }

  const safeColumns = Math.max(1, Math.round(columns));
  const safeRows = Math.max(1, Math.round(rows));
  const rgba =
    (await readAsciiCellRgbaOnGpuIfSupported({
      sourceCanvas,
      columns: safeColumns,
      rows: safeRows,
      quality,
    })) ??
    readAsciiCellRgbaOnCpu({
      sourceCanvas,
      columns: safeColumns,
      rows: safeRows,
    });
  const entry = buildAsciiAnalysisEntryFromRgba({
    key,
    columns: safeColumns,
    rows: safeRows,
    rgba,
  });

  asciiAnalysisCache.set(key, {
    entry,
    lastUsedAt: Date.now(),
  });
  evictAsciiAnalysisCacheIfNeeded();
  return entry;
};

export const clearAsciiAnalysisCache = () => {
  asciiAnalysisCache.clear();
};
