import {
  resolveRightAngleQuarterTurns,
} from "./imageProcessingKeys";
import type { RenderBoundaryMetrics } from "@/lib/renderSurfaceHandle";

export interface LoadedImageSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup?: () => void;
}

export interface LoadImageSourceOptions {
  signal?: AbortSignal;
  cacheKey?: string;
  useCache?: boolean;
}

const SOURCE_CACHE_MAX_ENTRIES = 8;

interface CachedBitmapEntry {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  lastUsedAt: number;
}

const _sourceBitmapCache = new Map<string, CachedBitmapEntry>();

export const clearSourceBitmapCache = () => {
  for (const entry of _sourceBitmapCache.values()) {
    entry.bitmap.close();
  }
  _sourceBitmapCache.clear();
};

const getCachedBitmapSource = (cacheKey: string): LoadedImageSource | null => {
  const cached = _sourceBitmapCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  cached.lastUsedAt = Date.now();
  return {
    source: cached.bitmap as CanvasImageSource,
    width: cached.width,
    height: cached.height,
  };
};

const setCachedBitmapSource = (cacheKey: string, bitmap: ImageBitmap) => {
  const existing = _sourceBitmapCache.get(cacheKey);
  if (existing && existing.bitmap !== bitmap) {
    existing.bitmap.close();
  }

  _sourceBitmapCache.set(cacheKey, {
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    lastUsedAt: Date.now(),
  });

  while (_sourceBitmapCache.size > SOURCE_CACHE_MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;
    for (const [key, value] of _sourceBitmapCache.entries()) {
      if (value.lastUsedAt < oldestTime) {
        oldestTime = value.lastUsedAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) {
      break;
    }
    const oldest = _sourceBitmapCache.get(oldestKey);
    if (oldest) {
      oldest.bitmap.close();
    }
    _sourceBitmapCache.delete(oldestKey);
  }
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
};

export type RenderImageSource = Blob | string | HTMLCanvasElement;

export const loadImageSource = async (
  source: RenderImageSource,
  options?: LoadImageSourceOptions
): Promise<LoadedImageSource> => {
  throwIfAborted(options?.signal);

  if (source instanceof HTMLCanvasElement) {
    return {
      source: source as CanvasImageSource,
      width: source.width,
      height: source.height,
    };
  }

  if (source instanceof Blob) {
    const cacheKey = options?.useCache ? options?.cacheKey : undefined;
    if (cacheKey) {
      const cached = getCachedBitmapSource(cacheKey);
      if (cached) {
        return cached;
      }
    }

    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
      throwIfAborted(options?.signal);

      if (cacheKey) {
        setCachedBitmapSource(cacheKey, bitmap);
        return {
          source: bitmap as CanvasImageSource,
          width: bitmap.width,
          height: bitmap.height,
        };
      }

      return {
        source: bitmap as CanvasImageSource,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    }

    const objectUrl = URL.createObjectURL(source);
    try {
      const loaded = await loadImageSource(objectUrl, options);
      return {
        ...loaded,
        cleanup: () => {
          loaded.cleanup?.();
          URL.revokeObjectURL(objectUrl);
        },
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  if (typeof createImageBitmap === "function") {
    try {
      const response = await fetch(source);
      if (response.ok) {
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob, {
          imageOrientation: "from-image",
        });
        throwIfAborted(options?.signal);
        return {
          source: bitmap as CanvasImageSource,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => bitmap.close(),
        };
      }
    } catch {
      // Fall back to HTMLImageElement below for unsupported URLs or fetch failures.
    }
  }

  const image = new Image();
  image.decoding = "async";
  image.src = source;
  throwIfAborted(options?.signal);

  try {
    await image.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to load image"));
    });
  }

  throwIfAborted(options?.signal);

  return {
    source: image as CanvasImageSource,
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
};

export const createOrientedSource = (
  loaded: LoadedImageSource,
  rightAngleRotation: number,
  boundaryMetrics?: RenderBoundaryMetrics
): LoadedImageSource => {
  const quarterTurns = resolveRightAngleQuarterTurns(rightAngleRotation);
  if (quarterTurns === 0) {
    return loaded;
  }

  const orientedCanvas = document.createElement("canvas");
  if (quarterTurns % 2 === 0) {
    orientedCanvas.width = loaded.width;
    orientedCanvas.height = loaded.height;
  } else {
    orientedCanvas.width = loaded.height;
    orientedCanvas.height = loaded.width;
  }

  const orientedContext = orientedCanvas.getContext("2d");
  if (!orientedContext) {
    return loaded;
  }

  orientedContext.save();
  if (quarterTurns === 1) {
    orientedContext.translate(orientedCanvas.width, 0);
    orientedContext.rotate(Math.PI / 2);
  } else if (quarterTurns === 2) {
    orientedContext.translate(orientedCanvas.width, orientedCanvas.height);
    orientedContext.rotate(Math.PI);
  } else {
    orientedContext.translate(0, orientedCanvas.height);
    orientedContext.rotate(-Math.PI / 2);
  }
  orientedContext.drawImage(loaded.source, 0, 0, loaded.width, loaded.height);
  orientedContext.restore();
  if (boundaryMetrics) boundaryMetrics.canvasClones += 1;

  return {
    source: orientedCanvas as CanvasImageSource,
    width: orientedCanvas.width,
    height: orientedCanvas.height,
    cleanup: () => {
      orientedCanvas.width = 0;
      orientedCanvas.height = 0;
    },
  };
};

export const hashSeedKey = (seedKey: string) => {
  let hash = 2166136261;
  for (let i = 0; i < seedKey.length; i += 1) {
    hash ^= seedKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const resolveSourceCacheKey = (
  source: RenderImageSource,
  seedKey?: string,
  explicitCacheKey?: string
) => {
  if (explicitCacheKey) {
    return explicitCacheKey;
  }
  if (source instanceof Blob && seedKey) {
    return `blob:${seedKey}:${source.size}:${source.type}`;
  }
  return undefined;
};
