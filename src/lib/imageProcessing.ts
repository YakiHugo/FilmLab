import { resolveRenderProfile } from "@/lib/film";
import { normalizeAdjustments } from "@/lib/adjustments";
import { applyTimestampOverlay } from "@/lib/timestampOverlay";
import { clamp } from "@/lib/math";
import { getRendererRuntimeConfig } from "@/lib/renderer/config";
import type { EditingAdjustments } from "@/types";
import type { FilmProfileAny, ResolvedRenderProfile } from "@/types/film";
import type { RenderMode, FrameState } from "@/lib/renderer/RenderManager";
import type {
  GeometryUniforms,
  HSLUniforms,
  CurveUniforms,
  DetailUniforms,
  FilmUniforms,
  HalationBloomUniforms,
  MasterUniforms,
} from "@/lib/renderer/types";

export class RenderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RenderError";
  }
}

export const resolveAspectRatio = (
  value: EditingAdjustments["aspectRatio"],
  customAspectRatio: number,
  fallback?: number
) => {
  if (value === "original") {
    return fallback ?? 1;
  }
  if (value === "free") {
    if (Number.isFinite(customAspectRatio) && customAspectRatio > 0) {
      return customAspectRatio;
    }
    return fallback ?? 1;
  }
  const [w, h] = value.split(":").map(Number);
  if (!w || !h) {
    return fallback ?? 1;
  }
  return w / h;
};

const resolveRightAngleQuarterTurns = (rightAngleRotation: number) => {
  const quarterTurns = Math.round(rightAngleRotation / 90);
  return ((quarterTurns % 4) + 4) % 4;
};

export const resolveOrientedAspectRatio = (aspectRatio: number, rightAngleRotation: number) => {
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  return resolveRightAngleQuarterTurns(rightAngleRotation) % 2 === 1
    ? 1 / safeAspectRatio
    : safeAspectRatio;
};

const resolveTransform = (adjustments: EditingAdjustments, width: number, height: number) => {
  const scale = clamp(adjustments.scale / 100, 0.5, 2.0);
  const translateX = clamp(adjustments.horizontal / 5, -20, 20);
  const translateY = clamp(adjustments.vertical / 5, -20, 20);
  const flipHorizontal = adjustments.flipHorizontal ? -1 : 1;
  const flipVertical = adjustments.flipVertical ? -1 : 1;
  return {
    scale,
    rotate: (adjustments.rotate * Math.PI) / 180,
    translateX: (translateX / 100) * width,
    translateY: (translateY / 100) * height,
    flipHorizontal,
    flipVertical,
  };
};

interface LoadedImageSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup?: () => void;
}

interface LoadImageSourceOptions {
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

const clearSourceBitmapCache = () => {
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

const loadImageSource = async (
  source: Blob | string,
  options?: LoadImageSourceOptions
): Promise<LoadedImageSource> => {
  throwIfAborted(options?.signal);

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

const createOrientedSource = (
  loaded: LoadedImageSource,
  rightAngleRotation: number
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

interface RenderTargetSize {
  width: number;
  height: number;
}

export type RenderQualityProfile = "interactive" | "full";

interface RenderImageOptions {
  canvas: HTMLCanvasElement;
  source: Blob | string;
  adjustments: EditingAdjustments;
  filmProfile?: FilmProfileAny;
  timestampText?: string | null;
  targetSize?: RenderTargetSize;
  maxDimension?: number;
  seedKey?: string;
  renderSeed?: number;
  exportSeed?: number;
  skipHalationBloom?: boolean;
  signal?: AbortSignal;
  mode?: RenderMode;
  qualityProfile?: RenderQualityProfile;
  strictErrors?: boolean;
  sourceCacheKey?: string;
  renderSlot?: string;
}

const hashSeedKey = (seedKey: string) => {
  let hash = 2166136261;
  for (let i = 0; i < seedKey.length; i += 1) {
    hash ^= seedKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const resolveSourceCacheKey = (
  source: Blob | string,
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

let _maxTextureSizeCache: number | null = null;

const resolveMaxTextureSize = () => {
  if (_maxTextureSizeCache) {
    return _maxTextureSizeCache;
  }
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    if (gl) {
      _maxTextureSizeCache = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
      return _maxTextureSizeCache;
    }
  } catch {
    // Fallback below.
  }
  _maxTextureSizeCache = 4096;
  return _maxTextureSizeCache;
};

interface RenderWithPixiOptions {
  mode: RenderMode;
  slotId: string;
  strictErrors: boolean;
  resolvedProfile: ResolvedRenderProfile;
  geometryUniforms: GeometryUniforms;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  uploadKey: string;
  sourceKey: string;
  geometryKey: string;
  masterKey: string;
  hslKey: string;
  curveKey: string;
  detailKey: string;
  filmKey: string;
  opticsKey: string;
  grainSeed: number;
  forceRerender?: boolean;
  skipHsl?: boolean;
  skipCurve?: boolean;
  skipDetail?: boolean;
  skipFilm?: boolean;
  skipHalationBloom?: boolean;
}

interface RenderWithPixiResult {
  canvas: HTMLCanvasElement;
  rendered: boolean;
  pixiKey: string;
  renderMetrics: {
    totalMs: number;
    updateUniformsMs: number;
    filterChainMs: number;
    drawMs: number;
    passCpuMs: {
      geometry: number;
      master: number;
      hsl: number;
      curve: number;
      detail: number;
      film: number;
      optics: number;
    };
    activePasses: string[];
  };
}

interface PixiModuleCache {
  RenderManager: typeof import("@/lib/renderer/RenderManager").RenderManager;
  resolveFromAdjustments: typeof import("@/lib/renderer/uniformResolvers").resolveFromAdjustments;
  resolveHslUniforms: typeof import("@/lib/renderer/uniformResolvers").resolveHslUniforms;
  resolveCurveUniforms: typeof import("@/lib/renderer/uniformResolvers").resolveCurveUniforms;
  resolveDetailUniforms: typeof import("@/lib/renderer/uniformResolvers").resolveDetailUniforms;
  resolveFilmUniforms: typeof import("@/lib/renderer/uniformResolvers").resolveFilmUniforms;
  resolveHalationBloomUniforms: typeof import("@/lib/renderer/uniformResolvers").resolveHalationBloomUniforms;
  resolveFilmUniformsV2: typeof import("@/lib/renderer/uniformResolvers").resolveFilmUniformsV2;
  resolveHalationBloomUniformsV2: typeof import("@/lib/renderer/uniformResolvers").resolveHalationBloomUniformsV2;
}

let _pixiModuleCache: PixiModuleCache | null = null;
let _renderManagerInstance: InstanceType<
  typeof import("@/lib/renderer/RenderManager").RenderManager
> | null = null;
let _nextCanvasRuntimeId = 1;

interface UniformScratchState {
  master?: MasterUniforms;
  hsl?: HSLUniforms;
  curve?: CurveUniforms;
  detail?: DetailUniforms;
  film?: FilmUniforms;
  halation?: HalationBloomUniforms;
}

const _uniformScratchByMode: Record<RenderMode, UniformScratchState> = {
  preview: {},
  export: {},
};
const _canvasRuntimeIds = new WeakMap<HTMLCanvasElement, number>();

const clearUniformScratch = (mode?: RenderMode) => {
  if (mode) {
    _uniformScratchByMode[mode] = {};
    return;
  }
  _uniformScratchByMode.preview = {};
  _uniformScratchByMode.export = {};
};

const toNumberKey = (value: number, precision = 4) => {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return value.toFixed(precision);
};

const hashString = (input: string) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const getCanvasRuntimeId = (canvas: HTMLCanvasElement) => {
  const cached = _canvasRuntimeIds.get(canvas);
  if (cached) {
    return cached;
  }
  const nextId = _nextCanvasRuntimeId;
  _nextCanvasRuntimeId += 1;
  _canvasRuntimeIds.set(canvas, nextId);
  return nextId;
};

const createSourceIdentityKey = (
  source: Blob | string,
  loaded: LoadedImageSource,
  resolvedSourceCacheKey?: string
) => {
  if (resolvedSourceCacheKey) {
    return resolvedSourceCacheKey;
  }
  if (typeof source === "string") {
    return `url:${source}`;
  }
  return `blob:${source.type}:${source.size}:${loaded.width}x${loaded.height}`;
};

const createMasterKey = (adj: EditingAdjustments) =>
  [
    "m",
    toNumberKey(adj.exposure, 3),
    toNumberKey(adj.contrast, 3),
    toNumberKey(adj.highlights, 3),
    toNumberKey(adj.shadows, 3),
    toNumberKey(adj.whites, 3),
    toNumberKey(adj.blacks, 3),
    toNumberKey(adj.temperature, 3),
    toNumberKey(adj.tint, 3),
    toNumberKey(adj.saturation, 3),
    toNumberKey(adj.vibrance, 3),
    toNumberKey(adj.colorGrading.shadows.hue, 3),
    toNumberKey(adj.colorGrading.shadows.saturation, 3),
    toNumberKey(adj.colorGrading.shadows.luminance, 3),
    toNumberKey(adj.colorGrading.midtones.hue, 3),
    toNumberKey(adj.colorGrading.midtones.saturation, 3),
    toNumberKey(adj.colorGrading.midtones.luminance, 3),
    toNumberKey(adj.colorGrading.highlights.hue, 3),
    toNumberKey(adj.colorGrading.highlights.saturation, 3),
    toNumberKey(adj.colorGrading.highlights.luminance, 3),
    toNumberKey(adj.colorGrading.blend, 3),
    toNumberKey(adj.colorGrading.balance, 3),
    toNumberKey(adj.dehaze, 3),
  ].join("|");

const createHslKey = (adj: EditingAdjustments) =>
  [
    "h",
    toNumberKey(adj.hsl.red.hue, 2),
    toNumberKey(adj.hsl.red.saturation, 2),
    toNumberKey(adj.hsl.red.luminance, 2),
    toNumberKey(adj.hsl.orange.hue, 2),
    toNumberKey(adj.hsl.orange.saturation, 2),
    toNumberKey(adj.hsl.orange.luminance, 2),
    toNumberKey(adj.hsl.yellow.hue, 2),
    toNumberKey(adj.hsl.yellow.saturation, 2),
    toNumberKey(adj.hsl.yellow.luminance, 2),
    toNumberKey(adj.hsl.green.hue, 2),
    toNumberKey(adj.hsl.green.saturation, 2),
    toNumberKey(adj.hsl.green.luminance, 2),
    toNumberKey(adj.hsl.aqua.hue, 2),
    toNumberKey(adj.hsl.aqua.saturation, 2),
    toNumberKey(adj.hsl.aqua.luminance, 2),
    toNumberKey(adj.hsl.blue.hue, 2),
    toNumberKey(adj.hsl.blue.saturation, 2),
    toNumberKey(adj.hsl.blue.luminance, 2),
    toNumberKey(adj.hsl.purple.hue, 2),
    toNumberKey(adj.hsl.purple.saturation, 2),
    toNumberKey(adj.hsl.purple.luminance, 2),
    toNumberKey(adj.hsl.magenta.hue, 2),
    toNumberKey(adj.hsl.magenta.saturation, 2),
    toNumberKey(adj.hsl.magenta.luminance, 2),
  ].join("|");

const serializeCurvePoints = (points: EditingAdjustments["pointCurve"]["rgb"]) =>
  points.map((point) => `${toNumberKey(point.x, 0)}:${toNumberKey(point.y, 0)}`).join(",");

const createCurveKey = (adj: EditingAdjustments) =>
  [
    "c",
    toNumberKey(adj.curveHighlights, 2),
    toNumberKey(adj.curveLights, 2),
    toNumberKey(adj.curveDarks, 2),
    toNumberKey(adj.curveShadows, 2),
    serializeCurvePoints(adj.pointCurve.rgb),
    serializeCurvePoints(adj.pointCurve.red),
    serializeCurvePoints(adj.pointCurve.green),
    serializeCurvePoints(adj.pointCurve.blue),
  ].join("|");

const createDetailKey = (adj: EditingAdjustments) =>
  [
    "d",
    toNumberKey(adj.texture, 2),
    toNumberKey(adj.clarity, 2),
    toNumberKey(adj.sharpening, 2),
    toNumberKey(adj.sharpenRadius, 2),
    toNumberKey(adj.sharpenDetail, 2),
    toNumberKey(adj.masking, 2),
    toNumberKey(adj.noiseReduction, 2),
    toNumberKey(adj.colorNoiseReduction, 2),
  ].join("|");

const createFilmKey = (resolvedProfile: ResolvedRenderProfile, grainSeed: number) => {
  const sourceProfileHash =
    typeof resolvedProfile.source === "object" && resolvedProfile.source
      ? hashString(JSON.stringify(resolvedProfile.source))
      : "none";
  const lutKey = resolvedProfile.lut
    ? `${resolvedProfile.lut.path}:${resolvedProfile.lut.size}:${toNumberKey(
        resolvedProfile.lut.intensity,
        4
      )}`
    : "none";
  return [
    "f",
    resolvedProfile.mode,
    sourceProfileHash,
    lutKey,
    toNumberKey(grainSeed, 0),
  ].join("|");
};

const createOpticsKey = (resolvedProfile: ResolvedRenderProfile, skipHalationBloom?: boolean) => {
  const halation = resolvedProfile.v2.halation
    ? JSON.stringify(resolvedProfile.v2.halation)
    : "none";
  const bloom = resolvedProfile.v2.bloom ? JSON.stringify(resolvedProfile.v2.bloom) : "none";
  return ["o", skipHalationBloom ? "1" : "0", hashString(halation), hashString(bloom)].join("|");
};

const createGeometryKey = (params: {
  sourceKey: string;
  rightAngleRotation: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  outputWidth: number;
  outputHeight: number;
  rotate: number;
  scale: number;
  horizontal: number;
  vertical: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  qualityProfile: RenderQualityProfile;
}) =>
  [
    "g",
    params.sourceKey,
    toNumberKey(params.rightAngleRotation, 0),
    toNumberKey(params.cropX, 3),
    toNumberKey(params.cropY, 3),
    toNumberKey(params.cropWidth, 3),
    toNumberKey(params.cropHeight, 3),
    toNumberKey(params.outputWidth, 0),
    toNumberKey(params.outputHeight, 0),
    toNumberKey(params.rotate, 3),
    toNumberKey(params.scale, 3),
    toNumberKey(params.horizontal, 3),
    toNumberKey(params.vertical, 3),
    params.flipHorizontal ? "1" : "0",
    params.flipVertical ? "1" : "0",
    params.qualityProfile,
  ].join("|");

const createUploadKey = (params: {
  sourceKey: string;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
}) =>
  [
    "u",
    params.sourceKey,
    `${params.sourceWidth}x${params.sourceHeight}`,
    `${params.targetWidth}x${params.targetHeight}`,
  ].join("|");

const createGeometryUniforms = (params: {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  adjustments: EditingAdjustments;
}): GeometryUniforms => {
  const sourceWidth = Math.max(1, params.sourceWidth);
  const sourceHeight = Math.max(1, params.sourceHeight);
  const outputWidth = Math.max(1, params.outputWidth);
  const outputHeight = Math.max(1, params.outputHeight);
  const transform = resolveTransform(params.adjustments, outputWidth, outputHeight);

  return {
    enabled: true,
    cropRect: [
      params.cropX / sourceWidth,
      params.cropY / sourceHeight,
      params.cropWidth / sourceWidth,
      params.cropHeight / sourceHeight,
    ],
    outputSize: [outputWidth, outputHeight],
    translatePx: [transform.translateX, transform.translateY],
    rotate: transform.rotate,
    scale: transform.scale,
    flip: [transform.flipHorizontal, transform.flipVertical],
  };
};

const createPassthroughGeometryUniforms = (
  outputWidth: number,
  outputHeight: number
): GeometryUniforms => ({
  enabled: false,
  cropRect: [0, 0, 1, 1],
  outputSize: [Math.max(1, outputWidth), Math.max(1, outputHeight)],
  translatePx: [0, 0],
  rotate: 0,
  scale: 1,
  flip: [1, 1],
});

const createOutputKey = (params: {
  canvas: HTMLCanvasElement;
  pixiKey: string;
  timestampText?: string | null;
  adjustments: EditingAdjustments;
}) => {
  const timestampToken = params.adjustments.timestampEnabled
    ? `${params.adjustments.timestampPosition}:${toNumberKey(
        params.adjustments.timestampSize,
        0
      )}:${toNumberKey(params.adjustments.timestampOpacity, 0)}:${params.timestampText ?? ""}`
    : "off";
  return [
    "out",
    getCanvasRuntimeId(params.canvas),
    `${params.canvas.width}x${params.canvas.height}`,
    params.pixiKey,
    timestampToken,
  ].join("|");
};

const ensurePixiModules = async (): Promise<PixiModuleCache> => {
  if (_pixiModuleCache) {
    return _pixiModuleCache;
  }

  const [managerMod, uniformsMod] = await Promise.all([
    import("@/lib/renderer/RenderManager"),
    import("@/lib/renderer/uniformResolvers"),
  ]);

  _pixiModuleCache = {
    RenderManager: managerMod.RenderManager,
    resolveFromAdjustments: uniformsMod.resolveFromAdjustments,
    resolveHslUniforms: uniformsMod.resolveHslUniforms,
    resolveCurveUniforms: uniformsMod.resolveCurveUniforms,
    resolveDetailUniforms: uniformsMod.resolveDetailUniforms,
    resolveFilmUniforms: uniformsMod.resolveFilmUniforms,
    resolveHalationBloomUniforms: uniformsMod.resolveHalationBloomUniforms,
    resolveFilmUniformsV2: uniformsMod.resolveFilmUniformsV2,
    resolveHalationBloomUniformsV2: uniformsMod.resolveHalationBloomUniformsV2,
  };

  return _pixiModuleCache;
};

const getRenderManager = async () => {
  const modules = await ensurePixiModules();
  if (!_renderManagerInstance) {
    _renderManagerInstance = new modules.RenderManager();
  }
  return _renderManagerInstance;
};

/**
 * Lazy-load and invoke the PixiJS multi-pass renderer.
 * This is the sole GPU rendering path and throws RenderError on failure.
 */
const renderWithPixi = async (
  sourceImage: CanvasImageSource,
  adjustments: EditingAdjustments,
  frameState: FrameState,
  options: RenderWithPixiOptions
): Promise<RenderWithPixiResult> => {
  const emptyMetrics: RenderWithPixiResult["renderMetrics"] = {
    totalMs: 0,
    updateUniformsMs: 0,
    filterChainMs: 0,
    drawMs: 0,
    passCpuMs: {
      geometry: 0,
      master: 0,
      hsl: 0,
      curve: 0,
      detail: 0,
      film: 0,
      optics: 0,
    },
    activePasses: [],
  };
  try {
    const modules = await ensurePixiModules();
    const renderManager = await getRenderManager();
    const renderer = renderManager.getRenderer(
      options.mode,
      options.targetWidth,
      options.targetHeight,
      options.slotId
    );

    if (!renderer.isWebGL2) {
      renderManager.dispose(options.mode, options.slotId);
      throw new RenderError(
        "WebGL2 is not available. FilmLab requires a browser with WebGL2 support for rendering."
      );
    }

    if (options.targetWidth > renderer.maxTextureSize || options.targetHeight > renderer.maxTextureSize) {
      throw new RenderError(
        `Render target ${options.targetWidth}x${options.targetHeight} exceeds max texture size ${renderer.maxTextureSize}.`
      );
    }

    const sourceDirty = frameState.sourceKey !== options.sourceKey;
    const masterDirty = frameState.masterKey !== options.masterKey;
    const hslDirty = frameState.hslKey !== options.hslKey;
    const curveDirty = frameState.curveKey !== options.curveKey;
    const detailDirty = frameState.detailKey !== options.detailKey;
    const filmDirty = frameState.filmKey !== options.filmKey;
    const opticsDirty = frameState.opticsKey !== options.opticsKey;
    const uploadNeeded =
      !!options.forceRerender || sourceDirty || frameState.uploadedGeometryKey !== options.uploadKey;
    const pixiKey = [
      options.geometryKey,
      options.masterKey,
      options.hslKey,
      options.curveKey,
      options.detailKey,
      options.filmKey,
      options.opticsKey,
      options.skipHsl ? "h:0" : "h:1",
      options.skipCurve ? "c:0" : "c:1",
      options.skipDetail ? "d:0" : "d:1",
      options.skipFilm ? "f:0" : "f:1",
      options.skipHalationBloom ? "hb:1" : "hb:0",
    ].join("|");
    const renderNeeded =
      !!options.forceRerender ||
      uploadNeeded ||
      masterDirty ||
      hslDirty ||
      curveDirty ||
      detailDirty ||
      filmDirty ||
      opticsDirty ||
      frameState.pixiKey !== pixiKey;

    if (uploadNeeded) {
      renderer.updateSource(
        sourceImage as TexImageSource,
        options.sourceWidth,
        options.sourceHeight,
        options.targetWidth,
        options.targetHeight
      );
    }

    if (renderNeeded) {
      const scratch = _uniformScratchByMode[options.mode];
      const masterUniforms = modules.resolveFromAdjustments(adjustments, scratch.master);
      scratch.master = masterUniforms;
      const hslUniforms = modules.resolveHslUniforms(adjustments, scratch.hsl);
      scratch.hsl = hslUniforms;
      const curveUniforms = modules.resolveCurveUniforms(adjustments, scratch.curve);
      scratch.curve = curveUniforms;
      const detailUniforms = modules.resolveDetailUniforms(adjustments, scratch.detail);
      scratch.detail = detailUniforms;

      let filmUniforms: ReturnType<typeof modules.resolveFilmUniforms> | ReturnType<
        typeof modules.resolveFilmUniformsV2
      > | null = null;
      let halationBloomUniforms: ReturnType<typeof modules.resolveHalationBloomUniforms> | ReturnType<
        typeof modules.resolveHalationBloomUniformsV2
      > | null = null;
      const enableFilmPath = !options.skipFilm;
      const enableOpticsPath = !options.skipHalationBloom;

      if (options.resolvedProfile.mode === "v2") {
        if (enableFilmPath) {
          filmUniforms = modules.resolveFilmUniformsV2(
            options.resolvedProfile.v2,
            {
              grainSeed: options.grainSeed,
            },
            scratch.film
          );
          scratch.film = filmUniforms;
          filmUniforms.u_lutEnabled = filmUniforms.u_lutEnabled && !!options.resolvedProfile.lut;
          if (!filmUniforms.u_lutEnabled) {
            filmUniforms.u_lutIntensity = 0;
          }
          if (options.resolvedProfile.lut) {
            await renderer.ensureLUT({
              url: options.resolvedProfile.lut.path,
              level: options.resolvedProfile.lut.size,
            });
          }
        }
        if (enableOpticsPath) {
          halationBloomUniforms = modules.resolveHalationBloomUniformsV2(
            options.resolvedProfile.v2,
            scratch.halation
          );
          scratch.halation = halationBloomUniforms;
        }
      } else if (options.resolvedProfile.legacyV1) {
        if (enableFilmPath) {
          filmUniforms = modules.resolveFilmUniforms(
            options.resolvedProfile.legacyV1,
            {
              grainSeed: options.grainSeed,
            },
            scratch.film
          );
          scratch.film = filmUniforms;
        }
        if (enableOpticsPath) {
          halationBloomUniforms = modules.resolveHalationBloomUniforms(
            options.resolvedProfile.legacyV1,
            scratch.halation
          );
          scratch.halation = halationBloomUniforms;
        }
      }

      const renderMetrics = renderer.render(
        options.geometryUniforms,
        masterUniforms,
        hslUniforms,
        curveUniforms,
        detailUniforms,
        filmUniforms,
        {
          skipHsl: options.skipHsl,
          skipCurve: options.skipCurve,
          skipDetail: options.skipDetail,
          skipFilm: options.skipFilm,
          skipHalationBloom: options.skipHalationBloom,
        },
        halationBloomUniforms
      );

      frameState.sourceKey = options.sourceKey;
      frameState.geometryKey = options.geometryKey;
      frameState.masterKey = options.masterKey;
      frameState.hslKey = options.hslKey;
      frameState.curveKey = options.curveKey;
      frameState.detailKey = options.detailKey;
      frameState.filmKey = options.filmKey;
      frameState.opticsKey = options.opticsKey;
      frameState.uploadedGeometryKey = options.uploadKey;
      frameState.pixiKey = pixiKey;
      frameState.lastRenderError = null;

      return {
        canvas: renderer.canvas,
        rendered: true,
        pixiKey,
        renderMetrics,
      };
    }

    frameState.sourceKey = options.sourceKey;
    frameState.geometryKey = options.geometryKey;
    frameState.masterKey = options.masterKey;
    frameState.hslKey = options.hslKey;
    frameState.curveKey = options.curveKey;
    frameState.detailKey = options.detailKey;
    frameState.filmKey = options.filmKey;
    frameState.opticsKey = options.opticsKey;
    frameState.uploadedGeometryKey = options.uploadKey;
    frameState.pixiKey = pixiKey;
    frameState.lastRenderError = null;

    return {
      canvas: renderer.canvas,
      rendered: false,
      pixiKey,
      renderMetrics: emptyMetrics,
    };
  } catch (e) {
    const shouldRecycleRenderer = !(
      options.mode === "preview" &&
      !options.strictErrors
    );
    if (
      _renderManagerInstance &&
      shouldRecycleRenderer &&
      !(e instanceof RenderError && e.message.startsWith("WebGL2 is not"))
    ) {
      _renderManagerInstance.dispose(options.mode, options.slotId);
      clearUniformScratch(options.mode);
    }
    if (e instanceof RenderError) {
      throw e;
    }
    throw new RenderError("PixiJS render failed", { cause: e });
  }
};

interface RenderTimings {
  decodeMs: number;
  geometryMs: number;
  pixiMs: number;
  composeMs: number;
  totalMs: number;
  pixiMetrics?: RenderWithPixiResult["renderMetrics"];
}

const shouldLogRenderTimings = (runtimeConfig: ReturnType<typeof getRendererRuntimeConfig>) =>
  runtimeConfig.diagnostics.renderTimings;

const logRenderTimings = (
  mode: RenderMode,
  runtimeConfig: ReturnType<typeof getRendererRuntimeConfig>,
  timings: RenderTimings,
  dirty: {
    sourceDirty: boolean;
    geometryDirty: boolean;
    masterDirty: boolean;
    hslDirty: boolean;
    curveDirty: boolean;
    detailDirty: boolean;
    filmDirty: boolean;
    opticsDirty: boolean;
    outputDirty: boolean;
  }
) => {
  if (!shouldLogRenderTimings(runtimeConfig)) {
    return;
  }
  const verbose = runtimeConfig.diagnostics.verboseRenderTimings;
  const metrics = timings.pixiMetrics;
  const detailSuffix =
    verbose && metrics
      ? ` pixiDetail(update=${metrics.updateUniformsMs.toFixed(
          2
        )}ms,chain=${metrics.filterChainMs.toFixed(2)}ms,draw=${metrics.drawMs.toFixed(
          2
        )}ms,passes=${metrics.activePasses.join(">")},cpu=[g:${metrics.passCpuMs.geometry.toFixed(
          2
        )},m:${metrics.passCpuMs.master.toFixed(2)},h:${metrics.passCpuMs.hsl.toFixed(
          2
        )},c:${metrics.passCpuMs.curve.toFixed(2)},d:${metrics.passCpuMs.detail.toFixed(
          2
        )},f:${metrics.passCpuMs.film.toFixed(2)},o:${metrics.passCpuMs.optics.toFixed(2)}])`
      : "";
  console.info(
    `[FilmLab][${mode}] decode=${timings.decodeMs.toFixed(2)}ms geometry=${timings.geometryMs.toFixed(
      2
    )}ms pixi=${timings.pixiMs.toFixed(2)}ms compose=${timings.composeMs.toFixed(
      2
    )}ms total=${timings.totalMs.toFixed(2)}ms ` +
      `dirty(s=${dirty.sourceDirty ? 1 : 0},g=${dirty.geometryDirty ? 1 : 0},m=${
        dirty.masterDirty ? 1 : 0
      },h=${dirty.hslDirty ? 1 : 0},c=${dirty.curveDirty ? 1 : 0},d=${
        dirty.detailDirty ? 1 : 0
      },f=${dirty.filmDirty ? 1 : 0},o=${dirty.opticsDirty ? 1 : 0},out=${
        dirty.outputDirty ? 1 : 0
      })${detailSuffix}`
  );
};

const drawGeometryStage = (params: {
  geometryCanvas: HTMLCanvasElement;
  orientedSource: LoadedImageSource;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  outputWidth: number;
  outputHeight: number;
  adjustments: EditingAdjustments;
  qualityProfile: RenderQualityProfile;
}) => {
  const geometryCanvas = params.geometryCanvas;
  geometryCanvas.width = Math.max(1, Math.round(params.outputWidth));
  geometryCanvas.height = Math.max(1, Math.round(params.outputHeight));
  const geometryContext = geometryCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!geometryContext) {
    throw new RenderError("Failed to acquire geometry canvas context.");
  }

  geometryContext.clearRect(0, 0, geometryCanvas.width, geometryCanvas.height);
  geometryContext.imageSmoothingQuality = params.qualityProfile === "full" ? "high" : "medium";

  const transform = resolveTransform(params.adjustments, geometryCanvas.width, geometryCanvas.height);
  geometryContext.save();
  geometryContext.translate(
    geometryCanvas.width / 2 + transform.translateX,
    geometryCanvas.height / 2 + transform.translateY
  );
  geometryContext.rotate(transform.rotate);
  geometryContext.scale(
    transform.scale * transform.flipHorizontal,
    transform.scale * transform.flipVertical
  );
  geometryContext.drawImage(
    params.orientedSource.source,
    params.cropX,
    params.cropY,
    params.cropWidth,
    params.cropHeight,
    -geometryCanvas.width / 2,
    -geometryCanvas.height / 2,
    geometryCanvas.width,
    geometryCanvas.height
  );
  geometryContext.restore();
};

const getGeometryCanvas = (frameState: FrameState): HTMLCanvasElement => {
  if (!frameState.geometryCanvas) {
    frameState.geometryCanvas = document.createElement("canvas");
  }
  return frameState.geometryCanvas;
};

const _renderMutexPromises = new Map<string, Promise<void>>();

const acquireRenderMutex = (mode: RenderMode, slotId: string): Promise<() => void> => {
  const key = `${mode}:${slotId}`;
  const previous = _renderMutexPromises.get(key) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  _renderMutexPromises.set(key, current);
  return previous.then(() => () => {
    release();
    if (_renderMutexPromises.get(key) === current) {
      _renderMutexPromises.delete(key);
    }
  });
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (_renderManagerInstance) {
      _renderManagerInstance.disposeAll();
      _renderManagerInstance = null;
    }
    clearUniformScratch();
    clearSourceBitmapCache();
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (_renderManagerInstance) {
      _renderManagerInstance.disposeAll();
      _renderManagerInstance = null;
    }
    _pixiModuleCache = null;
    clearUniformScratch();
    clearSourceBitmapCache();
  });

  import.meta.hot.accept(["@/lib/renderer/RenderManager", "@/lib/renderer/uniformResolvers"], () => {
    _pixiModuleCache = null;
    clearUniformScratch();
  });
}

export const renderImageToCanvas = async ({
  canvas,
  source,
  adjustments,
  filmProfile,
  timestampText,
  targetSize,
  maxDimension,
  seedKey,
  renderSeed,
  exportSeed,
  skipHalationBloom,
  signal,
  mode = "preview",
  qualityProfile = "interactive",
  strictErrors = mode === "export",
  sourceCacheKey,
  renderSlot,
}: RenderImageOptions) => {
  const callStartAt = performance.now();
  const runtimeConfig = getRendererRuntimeConfig();
  const featureFlags = runtimeConfig.features;
  const incrementalPipeline = featureFlags.incrementalPipeline;
  const useGpuGeometryPass = featureFlags.gpuGeometryPass;
  const skipHslPass = !featureFlags.enableHslPass;
  const skipCurvePass = !featureFlags.enableCurvePass;
  const skipDetailPass = !featureFlags.enableDetailPass;
  const skipFilmPass = !featureFlags.enableFilmPass;
  const skipOpticsPass = skipHalationBloom || !featureFlags.enableOpticsPass;
  const timings: RenderTimings = {
    decodeMs: 0,
    geometryMs: 0,
    pixiMs: 0,
    composeMs: 0,
    totalMs: 0,
  };

  const normalizedAdjustments = normalizeAdjustments(adjustments);
  const resolvedProfile = resolveRenderProfile(normalizedAdjustments, filmProfile);
  const resolvedSourceCacheKey = resolveSourceCacheKey(source, seedKey, sourceCacheKey);
  const grainSeed = exportSeed ?? renderSeed ?? (seedKey ? hashSeedKey(seedKey) : Date.now());
  const slotId = mode === "preview" ? "preview-main" : renderSlot ?? "export-main";
  const renderManager = await getRenderManager();
  const frameState = renderManager.getFrameState(mode, slotId);

  let loaded: LoadedImageSource | null = null;
  let orientedSource: LoadedImageSource | null = null;

  try {
    const decodeStartAt = performance.now();
    loaded = await loadImageSource(source, {
      signal,
      cacheKey: resolvedSourceCacheKey,
      useCache: mode === "preview",
    });
    throwIfAborted(signal);
    timings.decodeMs = performance.now() - decodeStartAt;

    orientedSource = createOrientedSource(loaded, normalizedAdjustments.rightAngleRotation);

    const fallbackRatio = targetSize
      ? targetSize.width / Math.max(1, targetSize.height)
      : orientedSource.width / Math.max(1, orientedSource.height);
    const targetRatio = resolveAspectRatio(
      normalizedAdjustments.aspectRatio,
      normalizedAdjustments.customAspectRatio,
      fallbackRatio
    );
    const sourceRatio = orientedSource.width / Math.max(1, orientedSource.height);
    let cropWidth = orientedSource.width;
    let cropHeight = orientedSource.height;
    if (Math.abs(sourceRatio - targetRatio) > 0.001) {
      if (sourceRatio > targetRatio) {
        cropWidth = orientedSource.height * targetRatio;
      } else {
        cropHeight = orientedSource.width / targetRatio;
      }
    }
    const cropX = (orientedSource.width - cropWidth) / 2;
    const cropY = (orientedSource.height - cropHeight) / 2;

    let outputWidth = cropWidth;
    let outputHeight = cropHeight;
    if (targetSize?.width && targetSize?.height) {
      outputWidth = targetSize.width;
      outputHeight = targetSize.height;
    } else if (maxDimension) {
      const scale = Math.min(1, maxDimension / Math.max(cropWidth, cropHeight));
      outputWidth = Math.max(1, Math.round(cropWidth * scale));
      outputHeight = Math.max(1, Math.round(cropHeight * scale));
    }

    let maxTextureSize = resolveMaxTextureSize();
    try {
      maxTextureSize = Math.min(maxTextureSize, renderManager.getMaxTextureSize(mode, slotId));
    } catch {
      // If renderer bootstrap fails (e.g. no WebGL2), keep the probe value.
      // The Pixi stage will handle strict/non-strict error semantics.
    }
    const largestOutputDimension = Math.max(outputWidth, outputHeight);
    if (largestOutputDimension > maxTextureSize) {
      const textureScale = maxTextureSize / largestOutputDimension;
      outputWidth = Math.max(1, Math.floor(outputWidth * textureScale));
      outputHeight = Math.max(1, Math.floor(outputHeight * textureScale));
      console.warn(
        `[FilmLab] Output clamped to ${outputWidth}x${outputHeight} due to MAX_TEXTURE_SIZE=${maxTextureSize}.`
      );
    }

    const nextCanvasWidth = Math.max(1, Math.round(outputWidth));
    const nextCanvasHeight = Math.max(1, Math.round(outputHeight));
    if (canvas.width !== nextCanvasWidth) {
      canvas.width = nextCanvasWidth;
    }
    if (canvas.height !== nextCanvasHeight) {
      canvas.height = nextCanvasHeight;
    }
    const outputContext = canvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!outputContext) {
      throw new RenderError("Failed to acquire 2D canvas context.");
    }

    const sourceKey = createSourceIdentityKey(source, loaded, resolvedSourceCacheKey);
    const geometryKey = createGeometryKey({
      sourceKey,
      rightAngleRotation: normalizedAdjustments.rightAngleRotation,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      outputWidth: canvas.width,
      outputHeight: canvas.height,
      rotate: normalizedAdjustments.rotate,
      scale: normalizedAdjustments.scale,
      horizontal: normalizedAdjustments.horizontal,
      vertical: normalizedAdjustments.vertical,
      flipHorizontal: normalizedAdjustments.flipHorizontal,
      flipVertical: normalizedAdjustments.flipVertical,
      qualityProfile,
    });
    const masterKey = createMasterKey(normalizedAdjustments);
    const hslKey = createHslKey(normalizedAdjustments);
    const curveKey = createCurveKey(normalizedAdjustments);
    const detailKey = createDetailKey(normalizedAdjustments);
    const filmKey = createFilmKey(resolvedProfile, grainSeed);
    const opticsKey = createOpticsKey(resolvedProfile, skipOpticsPass);

    const sourceDirty = !incrementalPipeline || frameState.sourceKey !== sourceKey;
    const geometryDirty = !incrementalPipeline || sourceDirty || frameState.geometryKey !== geometryKey;
    const masterDirty = !incrementalPipeline || frameState.masterKey !== masterKey;
    const hslDirty = !incrementalPipeline || frameState.hslKey !== hslKey;
    const curveDirty = !incrementalPipeline || frameState.curveKey !== curveKey;
    const detailDirty = !incrementalPipeline || frameState.detailKey !== detailKey;
    const filmDirty = !incrementalPipeline || frameState.filmKey !== filmKey;
    const opticsDirty = !incrementalPipeline || frameState.opticsKey !== opticsKey;

    const geometryStartAt = performance.now();
    let geometryUniforms = createGeometryUniforms({
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      sourceWidth: orientedSource.width,
      sourceHeight: orientedSource.height,
      outputWidth: canvas.width,
      outputHeight: canvas.height,
      adjustments: normalizedAdjustments,
    });
    let uploadKey = createUploadKey({
      sourceKey,
      sourceWidth: orientedSource.width,
      sourceHeight: orientedSource.height,
      targetWidth: canvas.width,
      targetHeight: canvas.height,
    });
    let pixiSource: CanvasImageSource = orientedSource.source;
    let pixiSourceWidth = orientedSource.width;
    let pixiSourceHeight = orientedSource.height;

    if (!useGpuGeometryPass) {
      const geometryCanvas = getGeometryCanvas(frameState);
      const needsCpuGeometryDraw =
        !incrementalPipeline ||
        geometryDirty ||
        geometryCanvas.width !== canvas.width ||
        geometryCanvas.height !== canvas.height;
      if (needsCpuGeometryDraw) {
        drawGeometryStage({
          geometryCanvas,
          orientedSource,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          outputWidth: canvas.width,
          outputHeight: canvas.height,
          adjustments: normalizedAdjustments,
          qualityProfile,
        });
      }
      geometryUniforms = createPassthroughGeometryUniforms(canvas.width, canvas.height);
      uploadKey = `cpu:${geometryKey}`;
      pixiSource = geometryCanvas;
      pixiSourceWidth = geometryCanvas.width;
      pixiSourceHeight = geometryCanvas.height;
    }
    timings.geometryMs = performance.now() - geometryStartAt;

    // Preserve CPU-stage dirty state even if GPU rendering fails, so repeated
    // preview retries do not re-run geometry work unnecessarily.
    frameState.sourceKey = sourceKey;
    frameState.geometryKey = geometryKey;

    const releaseMutex = await acquireRenderMutex(mode, slotId);
    let outputDirty = false;
    try {
      throwIfAborted(signal);

      const pixiStartAt = performance.now();
      const pixiResult = await renderWithPixi(pixiSource, normalizedAdjustments, frameState, {
        mode,
        slotId,
        strictErrors,
        resolvedProfile,
        geometryUniforms,
        sourceWidth: pixiSourceWidth,
        sourceHeight: pixiSourceHeight,
        targetWidth: canvas.width,
        targetHeight: canvas.height,
        uploadKey,
        sourceKey,
        geometryKey,
        masterKey,
        hslKey,
        curveKey,
        detailKey,
        filmKey,
        opticsKey,
        grainSeed,
        forceRerender: !incrementalPipeline,
        skipHsl: skipHslPass,
        skipCurve: skipCurvePass,
        skipDetail: skipDetailPass,
        skipFilm: skipFilmPass,
        skipHalationBloom: skipOpticsPass,
      });
      timings.pixiMs = performance.now() - pixiStartAt;
      timings.pixiMetrics = pixiResult.renderMetrics;

      const outputKey = createOutputKey({
        canvas,
        pixiKey: pixiResult.pixiKey,
        timestampText,
        adjustments: normalizedAdjustments,
      });
      outputDirty = !incrementalPipeline || frameState.outputKey !== outputKey;

      const composeStartAt = performance.now();
      if (pixiResult.rendered || outputDirty) {
        outputContext.clearRect(0, 0, canvas.width, canvas.height);
        outputContext.drawImage(pixiResult.canvas, 0, 0, canvas.width, canvas.height);
        applyTimestampOverlay(canvas, normalizedAdjustments, timestampText);
        frameState.outputKey = outputKey;
        frameState.lastRenderError = null;
      }
      timings.composeMs = performance.now() - composeStartAt;

      timings.totalMs = performance.now() - callStartAt;
      logRenderTimings(mode, runtimeConfig, timings, {
        sourceDirty,
        geometryDirty,
        masterDirty,
        hslDirty,
        curveDirty,
        detailDirty,
        filmDirty,
        opticsDirty,
        outputDirty,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw e;
      }
      frameState.lastRenderError = e instanceof Error ? e.message : String(e);
      if (strictErrors) {
        throw e;
      }

      if (
        mode === "preview" &&
        featureFlags.keepLastPreviewFrameOnError &&
        frameState.outputKey
      ) {
        try {
          const previewRenderer = renderManager.getRenderer(mode, canvas.width, canvas.height, slotId);
          const composeStartAt = performance.now();
          outputContext.clearRect(0, 0, canvas.width, canvas.height);
          outputContext.drawImage(previewRenderer.canvas, 0, 0, canvas.width, canvas.height);
          applyTimestampOverlay(canvas, normalizedAdjustments, timestampText);
          timings.composeMs = performance.now() - composeStartAt;
          timings.totalMs = performance.now() - callStartAt;
          logRenderTimings(mode, runtimeConfig, timings, {
            sourceDirty,
            geometryDirty,
            masterDirty,
            hslDirty,
            curveDirty,
            detailDirty,
            filmDirty,
            opticsDirty,
            outputDirty: false,
          });
          return;
        } catch {
          // Fallback below.
        }
      }

      console.warn("[FilmLab] PixiJS render failed, showing geometry fallback preview:", e);
      const composeStartAt = performance.now();
      const fallbackGeometryCanvas = getGeometryCanvas(frameState);
      drawGeometryStage({
        geometryCanvas: fallbackGeometryCanvas,
        orientedSource,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        outputWidth: canvas.width,
        outputHeight: canvas.height,
        adjustments: normalizedAdjustments,
        qualityProfile,
      });
      outputContext.clearRect(0, 0, canvas.width, canvas.height);
      outputContext.drawImage(fallbackGeometryCanvas, 0, 0, canvas.width, canvas.height);
      applyTimestampOverlay(canvas, normalizedAdjustments, timestampText);
      frameState.outputKey = createOutputKey({
        canvas,
        pixiKey: `fallback:${geometryKey}`,
        timestampText,
        adjustments: normalizedAdjustments,
      });
      timings.composeMs = performance.now() - composeStartAt;

      timings.totalMs = performance.now() - callStartAt;
      logRenderTimings(mode, runtimeConfig, timings, {
        sourceDirty,
        geometryDirty,
        masterDirty,
        hslDirty,
        curveDirty,
        detailDirty,
        filmDirty,
        opticsDirty,
        outputDirty: true,
      });
    } finally {
      releaseMutex();
    }
  } finally {
    timings.totalMs = performance.now() - callStartAt;
    if (orientedSource && orientedSource !== loaded) {
      orientedSource.cleanup?.();
    }
    loaded?.cleanup?.();
  }
};

interface RenderBlobOptions {
  type?: string;
  quality?: number;
  maxDimension?: number;
  filmProfile?: FilmProfileAny;
  timestampText?: string | null;
  seedKey?: string;
  exportSeed?: number;
  sourceCacheKey?: string;
  renderSlot?: string;
}

export const renderImageToBlob = async (
  source: Blob | string,
  adjustments: EditingAdjustments,
  options?: RenderBlobOptions
) => {
  const canvas = document.createElement("canvas");
  try {
    await renderImageToCanvas({
      canvas,
      source,
      adjustments,
      filmProfile: options?.filmProfile,
      timestampText: options?.timestampText,
      maxDimension: options?.maxDimension,
      seedKey: options?.seedKey,
      exportSeed: options?.exportSeed,
      sourceCacheKey: options?.sourceCacheKey,
      mode: "export",
      qualityProfile: "full",
      strictErrors: true,
      renderSlot: options?.renderSlot,
    });

    const outputType = options?.type ?? "image/jpeg";
    const quality = options?.quality ?? 0.92;
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputType, quality);
    });
    if (!blob) {
      throw new RenderError("Failed to render image blob.");
    }
    return blob;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
};
