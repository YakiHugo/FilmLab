import { resolveRenderProfile } from "@/lib/film";
import { normalizeAdjustments } from "@/lib/adjustments";
import { applyTimestampOverlay } from "@/lib/timestampOverlay";
import { clamp } from "@/lib/math";
import { getRendererRuntimeConfig } from "@/lib/renderer/config";
import type {
  EditingAdjustments,
  LocalAdjustment,
  LocalAdjustmentDelta,
  LocalAdjustmentMask,
} from "@/types";
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

const LOCAL_DELTA_KEYS: Array<keyof LocalAdjustmentDelta> = [
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "temperature",
  "tint",
  "vibrance",
  "saturation",
  "texture",
  "clarity",
  "dehaze",
  "sharpening",
  "noiseReduction",
  "colorNoiseReduction",
];

const hasLocalAdjustmentDelta = (delta: LocalAdjustmentDelta) =>
  LOCAL_DELTA_KEYS.some((key) => Math.abs(delta[key] ?? 0) > 0.0001);

const resolveActiveLocalAdjustments = (localAdjustments: LocalAdjustment[] | undefined) =>
  (localAdjustments ?? []).filter(
    (local) =>
      local.enabled &&
      local.amount > 0.0001 &&
      hasLocalAdjustmentDelta(local.adjustments)
  );

const serializeLocalMask = (mask: LocalAdjustmentMask) => {
  const lumaMin = clamp(mask.lumaMin ?? 0, 0, 1);
  const lumaMax = clamp(mask.lumaMax ?? 1, 0, 1);
  const lumaFeather = clamp(mask.lumaFeather ?? 0, 0, 1);
  const hueCenter = ((mask.hueCenter ?? 0) % 360 + 360) % 360;
  const hueRange = clamp(mask.hueRange ?? 180, 0, 180);
  const hueFeather = clamp(mask.hueFeather ?? 0, 0, 180);
  const satMin = clamp(mask.satMin ?? 0, 0, 1);
  const satFeather = clamp(mask.satFeather ?? 0, 0, 1);
  if (mask.mode === "brush") {
    const pointSignature = hashString(
      mask.points
        .map((point) =>
          [
            toNumberKey(point.x, 4),
            toNumberKey(point.y, 4),
            toNumberKey(point.pressure ?? 1, 3),
          ].join(":")
        )
        .join("|")
    );
    return [
      "b",
      toNumberKey(mask.brushSize, 4),
      toNumberKey(mask.feather, 4),
      toNumberKey(mask.flow, 4),
      pointSignature,
      toNumberKey(Math.min(lumaMin, lumaMax), 4),
      toNumberKey(Math.max(lumaMin, lumaMax), 4),
      toNumberKey(lumaFeather, 4),
      toNumberKey(hueCenter, 2),
      toNumberKey(hueRange, 2),
      toNumberKey(hueFeather, 2),
      toNumberKey(satMin, 4),
      toNumberKey(satFeather, 4),
      mask.invert ? "1" : "0",
    ].join(",");
  }
  if (mask.mode === "radial") {
    return [
      "r",
      toNumberKey(mask.centerX, 4),
      toNumberKey(mask.centerY, 4),
      toNumberKey(mask.radiusX, 4),
      toNumberKey(mask.radiusY, 4),
      toNumberKey(mask.feather, 4),
      toNumberKey(Math.min(lumaMin, lumaMax), 4),
      toNumberKey(Math.max(lumaMin, lumaMax), 4),
      toNumberKey(lumaFeather, 4),
      toNumberKey(hueCenter, 2),
      toNumberKey(hueRange, 2),
      toNumberKey(hueFeather, 2),
      toNumberKey(satMin, 4),
      toNumberKey(satFeather, 4),
      mask.invert ? "1" : "0",
    ].join(",");
  }
  return [
    "l",
    toNumberKey(mask.startX, 4),
    toNumberKey(mask.startY, 4),
    toNumberKey(mask.endX, 4),
    toNumberKey(mask.endY, 4),
    toNumberKey(mask.feather, 4),
    toNumberKey(Math.min(lumaMin, lumaMax), 4),
    toNumberKey(Math.max(lumaMin, lumaMax), 4),
    toNumberKey(lumaFeather, 4),
    toNumberKey(hueCenter, 2),
    toNumberKey(hueRange, 2),
    toNumberKey(hueFeather, 2),
    toNumberKey(satMin, 4),
    toNumberKey(satFeather, 4),
    mask.invert ? "1" : "0",
  ].join(",");
};

const createLocalAdjustmentsKey = (localAdjustments: LocalAdjustment[]) => {
  if (localAdjustments.length === 0) {
    return "local:none";
  }
  const serialized = localAdjustments
    .map((local) =>
      [
        local.id,
        toNumberKey(local.amount, 3),
        serializeLocalMask(local.mask),
        ...LOCAL_DELTA_KEYS.map((key) => toNumberKey(local.adjustments[key] ?? 0, 3)),
      ].join("|")
    )
    .join("||");
  return `local:${hashString(serialized)}`;
};

const applyLocalAdjustmentDelta = (
  base: EditingAdjustments,
  local: LocalAdjustment
): EditingAdjustments => {
  const next: EditingAdjustments = {
    ...base,
    localAdjustments: [],
  };
  const delta = local.adjustments;
  const applySigned = (
    key:
      | "exposure"
      | "contrast"
      | "highlights"
      | "shadows"
      | "whites"
      | "blacks"
      | "temperature"
      | "tint"
      | "vibrance"
      | "saturation"
      | "texture"
      | "clarity"
      | "dehaze",
    min = -100,
    max = 100
  ) => {
    const value = delta[key];
    if (!Number.isFinite(value ?? NaN)) {
      return;
    }
    next[key] = clamp((base[key] ?? 0) + (value as number), min, max);
  };
  applySigned("exposure");
  applySigned("contrast");
  applySigned("highlights");
  applySigned("shadows");
  applySigned("whites");
  applySigned("blacks");
  applySigned("temperature");
  applySigned("tint");
  applySigned("vibrance");
  applySigned("saturation");
  applySigned("texture");
  applySigned("clarity");
  applySigned("dehaze");

  const applyUnsigned = (
    key: "sharpening" | "noiseReduction" | "colorNoiseReduction",
    min = 0,
    max = 100
  ) => {
    const value = delta[key];
    if (!Number.isFinite(value ?? NaN)) {
      return;
    }
    next[key] = clamp((base[key] ?? 0) + (value as number), min, max);
  };
  applyUnsigned("sharpening");
  applyUnsigned("noiseReduction");
  applyUnsigned("colorNoiseReduction");
  return next;
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
    Number.isFinite(adj.temperatureKelvin ?? NaN)
      ? toNumberKey(adj.temperatureKelvin as number, 2)
      : "kelvin:na",
    Number.isFinite(adj.tintMG ?? NaN) ? toNumberKey(adj.tintMG as number, 2) : "tintmg:na",
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
    adj.bwEnabled ? "bw:1" : "bw:0",
    toNumberKey(adj.bwMix?.red ?? 0, 2),
    toNumberKey(adj.bwMix?.green ?? 0, 2),
    toNumberKey(adj.bwMix?.blue ?? 0, 2),
    toNumberKey(adj.calibration?.redHue ?? 0, 2),
    toNumberKey(adj.calibration?.redSaturation ?? 0, 2),
    toNumberKey(adj.calibration?.greenHue ?? 0, 2),
    toNumberKey(adj.calibration?.greenSaturation ?? 0, 2),
    toNumberKey(adj.calibration?.blueHue ?? 0, 2),
    toNumberKey(adj.calibration?.blueSaturation ?? 0, 2),
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
  perspectiveEnabled: boolean;
  perspectiveHorizontal: number;
  perspectiveVertical: number;
  scale: number;
  horizontal: number;
  vertical: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  opticsProfile: boolean;
  opticsCA: boolean;
  opticsVignette: number;
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
    params.perspectiveEnabled ? "p:1" : "p:0",
    toNumberKey(params.perspectiveHorizontal, 3),
    toNumberKey(params.perspectiveVertical, 3),
    toNumberKey(params.scale, 3),
    toNumberKey(params.horizontal, 3),
    toNumberKey(params.vertical, 3),
    params.flipHorizontal ? "1" : "0",
    params.flipVertical ? "1" : "0",
    params.opticsProfile ? "op:1" : "op:0",
    params.opticsCA ? "oca:1" : "oca:0",
    toNumberKey(params.opticsVignette, 2),
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
  const perspectiveHorizontal = params.adjustments.perspectiveHorizontal ?? 0;
  const perspectiveVertical = params.adjustments.perspectiveVertical ?? 0;
  const perspectiveEnabled = Boolean(params.adjustments.perspectiveEnabled);
  const kx = (perspectiveHorizontal / 100) * 0.35;
  const ky = (perspectiveVertical / 100) * 0.35;
  const homography = perspectiveEnabled
    ? [1, 0, 0, 0, 1, 0, kx, ky, 1]
    : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const lensEnabled = params.adjustments.opticsProfile;
  const opticsStrength = lensEnabled ? clamp(params.adjustments.opticsVignette / 100, 0, 1) : 0;
  // Two-term Brown-Conrady approximation: k1 controls most of the radial correction,
  // k2 adds edge behavior so wide-angle frames do not look over-corrected at corners.
  const lensK1 = lensEnabled ? 0.055 + opticsStrength * 0.05 : 0;
  const lensK2 = lensEnabled ? -0.015 - opticsStrength * 0.025 : 0;
  const caEnabled = params.adjustments.opticsCA;
  const caAmountBasePx = caEnabled ? 1.1 + opticsStrength * 0.9 : 0;

  return {
    enabled: true,
    cropRect: [
      params.cropX / sourceWidth,
      params.cropY / sourceHeight,
      params.cropWidth / sourceWidth,
      params.cropHeight / sourceHeight,
    ],
    sourceSize: [sourceWidth, sourceHeight],
    outputSize: [outputWidth, outputHeight],
    translatePx: [transform.translateX, transform.translateY],
    rotate: transform.rotate,
    perspectiveEnabled,
    homography,
    scale: transform.scale,
    flip: [transform.flipHorizontal, transform.flipVertical],
    lensEnabled,
    lensK1,
    lensK2,
    lensVignetteBoost: opticsStrength,
    caEnabled,
    // Signed RGB offsets (px at frame edge); blue shifts opposite red.
    caAmountPxRgb: [caAmountBasePx, 0, -caAmountBasePx * 0.9],
  };
};

const createPassthroughGeometryUniforms = (
  outputWidth: number,
  outputHeight: number
): GeometryUniforms => ({
  enabled: false,
  cropRect: [0, 0, 1, 1],
  sourceSize: [Math.max(1, outputWidth), Math.max(1, outputHeight)],
  outputSize: [Math.max(1, outputWidth), Math.max(1, outputHeight)],
  translatePx: [0, 0],
  rotate: 0,
  perspectiveEnabled: false,
  homography: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  scale: 1,
  flip: [1, 1],
  lensEnabled: false,
  lensK1: 0,
  lensK2: 0,
  lensVignetteBoost: 0,
  caEnabled: false,
  caAmountPxRgb: [0, 0, 0],
});

const createOutputKey = (params: {
  canvas: HTMLCanvasElement;
  pixiKey: string;
  localAdjustmentsKey: string;
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
    params.localAdjustmentsKey,
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
    const preFilmKey = [
      options.geometryKey,
      options.masterKey,
      options.hslKey,
      options.curveKey,
      options.detailKey,
      options.skipHsl ? "h:0" : "h:1",
      options.skipCurve ? "c:0" : "c:1",
      options.skipDetail ? "d:0" : "d:1",
    ].join("|");
    const preFilmNeeded =
      !!options.forceRerender ||
      uploadNeeded ||
      masterDirty ||
      hslDirty ||
      curveDirty ||
      detailDirty ||
      frameState.preFilmKey !== preFilmKey ||
      !frameState.preFilmCanvas;
    const pixiKey = [
      preFilmKey,
      options.filmKey,
      options.opticsKey,
      options.skipFilm ? "f:0" : "f:1",
      options.skipHalationBloom ? "hb:1" : "hb:0",
    ].join("|");
    const renderNeeded =
      !!options.forceRerender ||
      preFilmNeeded ||
      filmDirty ||
      opticsDirty ||
      frameState.pixiKey !== pixiKey;

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

      // Safety: when optics are intentionally skipped (rapid preview),
      // keep a disabled passthrough optics filter in the chain if Film is active.
      // This avoids a WebGL feedback-loop edge case seen with a single custom Film pass.
      if (enableFilmPath && !halationBloomUniforms) {
        const safeHalation = (scratch.halation ?? {
          halationEnabled: false,
          halationThreshold: 0.9,
          halationIntensity: 0,
          halationColor: [1.0, 0.3, 0.1],
          bloomEnabled: false,
          bloomThreshold: 0.85,
          bloomIntensity: 0,
        }) as HalationBloomUniforms;
        safeHalation.halationEnabled = false;
        safeHalation.halationIntensity = 0;
        safeHalation.bloomEnabled = false;
        safeHalation.bloomIntensity = 0;
        halationBloomUniforms = safeHalation;
        scratch.halation = safeHalation;
      }

      const renderMetrics = structuredClone(emptyMetrics);
      const mergeMetrics = (metrics: RenderWithPixiResult["renderMetrics"]) => {
        renderMetrics.totalMs += metrics.totalMs;
        renderMetrics.updateUniformsMs += metrics.updateUniformsMs;
        renderMetrics.filterChainMs += metrics.filterChainMs;
        renderMetrics.drawMs += metrics.drawMs;
        renderMetrics.passCpuMs.geometry += metrics.passCpuMs.geometry;
        renderMetrics.passCpuMs.master += metrics.passCpuMs.master;
        renderMetrics.passCpuMs.hsl += metrics.passCpuMs.hsl;
        renderMetrics.passCpuMs.curve += metrics.passCpuMs.curve;
        renderMetrics.passCpuMs.detail += metrics.passCpuMs.detail;
        renderMetrics.passCpuMs.film += metrics.passCpuMs.film;
        renderMetrics.passCpuMs.optics += metrics.passCpuMs.optics;
        if (metrics.activePasses.length > 0) {
          renderMetrics.activePasses = Array.from(
            new Set([...renderMetrics.activePasses, ...metrics.activePasses])
          );
        }
      };

      if (preFilmNeeded) {
        renderer.updateSource(
          sourceImage as TexImageSource,
          options.sourceWidth,
          options.sourceHeight,
          options.targetWidth,
          options.targetHeight
        );

        const preFilmMetrics = renderer.render(
          options.geometryUniforms,
          masterUniforms,
          hslUniforms,
          curveUniforms,
          detailUniforms,
          null,
          {
            skipHsl: options.skipHsl,
            skipCurve: options.skipCurve,
            skipDetail: options.skipDetail,
            skipFilm: true,
            skipHalationBloom: true,
          },
          null
        );
        mergeMetrics(preFilmMetrics);

        if (!frameState.preFilmCanvas) {
          frameState.preFilmCanvas = document.createElement("canvas");
        }
        const preFilmCanvas = frameState.preFilmCanvas;
        if (preFilmCanvas.width !== options.targetWidth) {
          preFilmCanvas.width = options.targetWidth;
        }
        if (preFilmCanvas.height !== options.targetHeight) {
          preFilmCanvas.height = options.targetHeight;
        }
        const preFilmContext = preFilmCanvas.getContext("2d");
        if (!preFilmContext) {
          throw new RenderError("Failed to acquire intermediate pre-film canvas context.");
        }
        preFilmContext.clearRect(0, 0, preFilmCanvas.width, preFilmCanvas.height);
        preFilmContext.drawImage(renderer.canvas, 0, 0, preFilmCanvas.width, preFilmCanvas.height);
        frameState.preFilmKey = preFilmKey;
        frameState.uploadedGeometryKey = options.uploadKey;
      }

      const preFilmCanvas = frameState.preFilmCanvas;
      if (!preFilmCanvas) {
        throw new RenderError("Missing pre-film cache canvas for final stage rendering.");
      }

      renderer.updateSource(
        preFilmCanvas,
        options.targetWidth,
        options.targetHeight,
        options.targetWidth,
        options.targetHeight
      );
      const finalStageMetrics = renderer.render(
        options.geometryUniforms,
        masterUniforms,
        hslUniforms,
        curveUniforms,
        detailUniforms,
        filmUniforms,
        {
          skipGeometry: true,
          skipMaster: true,
          skipHsl: true,
          skipCurve: true,
          skipDetail: true,
          skipFilm: options.skipFilm,
          skipHalationBloom: !halationBloomUniforms,
        },
        halationBloomUniforms
      );
      mergeMetrics(finalStageMetrics);

      frameState.sourceKey = options.sourceKey;
      frameState.geometryKey = options.geometryKey;
      frameState.masterKey = options.masterKey;
      frameState.hslKey = options.hslKey;
      frameState.curveKey = options.curveKey;
      frameState.detailKey = options.detailKey;
      frameState.filmKey = options.filmKey;
      frameState.opticsKey = options.opticsKey;
      frameState.preFilmKey = preFilmKey;
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
    frameState.preFilmKey = preFilmKey;
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

const describeRenderError = (error: unknown): string => {
  if (error instanceof Error) {
    const causeMessage =
      error.cause !== undefined && error.cause !== null
        ? describeRenderError(error.cause)
        : "";
    return causeMessage ? `${error.message} | cause: ${causeMessage}` : error.message;
  }
  return String(error);
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

const getLocalMaskCanvas = (frameState: FrameState): HTMLCanvasElement => {
  if (!frameState.localMaskCanvas) {
    frameState.localMaskCanvas = document.createElement("canvas");
  }
  return frameState.localMaskCanvas;
};

const getLocalBlendCanvas = (frameState: FrameState): HTMLCanvasElement => {
  if (!frameState.localBlendCanvas) {
    frameState.localBlendCanvas = document.createElement("canvas");
  }
  return frameState.localBlendCanvas;
};

const ensureCanvasSize = (canvas: HTMLCanvasElement, width: number, height: number) => {
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
};

const drawLocalMaskShape = (
  context: CanvasRenderingContext2D,
  mask: LocalAdjustmentMask,
  width: number,
  height: number
) => {
  if (mask.mode === "brush") {
    const minDimension = Math.max(1, Math.min(width, height));
    const brushSizePx = Math.max(1, clamp(mask.brushSize, 0.005, 0.25) * minDimension);
    const feather = clamp(mask.feather, 0, 1);
    const flow = clamp(mask.flow, 0.05, 1);
    if (mask.points.length === 0) {
      return;
    }
    for (const point of mask.points) {
      const px = clamp(point.x, 0, 1) * width;
      const py = clamp(point.y, 0, 1) * height;
      const pressure = clamp(point.pressure ?? 1, 0.1, 1);
      const radius = Math.max(1, brushSizePx * pressure);
      if (feather <= 0.001) {
        context.fillStyle = `rgba(255,255,255,${flow})`;
      } else {
        const innerRadius = Math.max(0, radius * (1 - feather));
        const gradient = context.createRadialGradient(px, py, innerRadius, px, py, radius);
        gradient.addColorStop(0, `rgba(255,255,255,${flow})`);
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = gradient;
      }
      context.beginPath();
      context.arc(px, py, radius, 0, Math.PI * 2);
      context.closePath();
      context.fill();
    }
    return;
  }
  if (mask.mode === "radial") {
    const centerX = clamp(mask.centerX, 0, 1) * width;
    const centerY = clamp(mask.centerY, 0, 1) * height;
    const radiusX = Math.max(1, clamp(mask.radiusX, 0.01, 1) * width);
    const radiusY = Math.max(1, clamp(mask.radiusY, 0.01, 1) * height);
    const feather = clamp(mask.feather, 0, 1);

    context.save();
    context.translate(centerX, centerY);
    context.scale(radiusX, radiusY);
    if (feather <= 0.001) {
      context.fillStyle = "rgba(255,255,255,1)";
    } else {
      const innerRadius = Math.max(0, 1 - feather);
      const gradient = context.createRadialGradient(0, 0, innerRadius, 0, 0, 1);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
    }
    context.beginPath();
    context.arc(0, 0, 1, 0, Math.PI * 2);
    context.closePath();
    context.fill();
    context.restore();
    return;
  }

  const startX = clamp(mask.startX, 0, 1) * width;
  const startY = clamp(mask.startY, 0, 1) * height;
  const endX = clamp(mask.endX, 0, 1) * width;
  let endY = clamp(mask.endY, 0, 1) * height;
  if ((endX - startX) * (endX - startX) + (endY - startY) * (endY - startY) < 1e-6) {
    endY += 1;
  }

  const feather = clamp(mask.feather, 0, 1);
  const gradient = context.createLinearGradient(startX, startY, endX, endY);
  if (feather <= 0.001) {
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.499, "rgba(255,255,255,1)");
    gradient.addColorStop(0.501, "rgba(255,255,255,0)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
  } else {
    const transitionStart = clamp(0.5 - feather * 0.5, 0, 1);
    const transitionEnd = clamp(0.5 + feather * 0.5, 0, 1);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(transitionStart, "rgba(255,255,255,1)");
    gradient.addColorStop(transitionEnd, "rgba(255,255,255,0)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
};

const resolveLocalMaskLumaRange = (mask: LocalAdjustmentMask) => {
  const min = clamp(mask.lumaMin ?? 0, 0, 1);
  const max = clamp(mask.lumaMax ?? 1, 0, 1);
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
    feather: clamp(mask.lumaFeather ?? 0, 0, 1),
  };
};

const resolveLocalMaskColorRange = (mask: LocalAdjustmentMask) => ({
  hueCenter: ((mask.hueCenter ?? 0) % 360 + 360) % 360,
  hueRange: clamp(mask.hueRange ?? 180, 0, 180),
  hueFeather: clamp(mask.hueFeather ?? 0, 0, 180),
  satMin: clamp(mask.satMin ?? 0, 0, 1),
  satFeather: clamp(mask.satFeather ?? 0, 0, 1),
});

const smoothstep = (edge0: number, edge1: number, x: number) => {
  if (Math.abs(edge1 - edge0) < 1e-6) {
    return x >= edge1 ? 1 : 0;
  }
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const resolveHueDistance = (a: number, b: number) => {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
};

const resolveHueSatFromRgb = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  const sat = max <= 1e-6 ? 0 : diff / max;
  if (diff <= 1e-6) {
    return { hue: 0, sat };
  }

  let hue: number;
  if (max === r) {
    hue = ((g - b) / diff) % 6;
  } else if (max === g) {
    hue = (b - r) / diff + 2;
  } else {
    hue = (r - g) / diff + 4;
  }
  hue *= 60;
  if (hue < 0) {
    hue += 360;
  }
  return {
    hue,
    sat,
  };
};

const resolveLocalMaskLumaWeight = (
  luma: number,
  range: { min: number; max: number; feather: number }
) => {
  if (luma < range.min) {
    if (range.feather <= 1e-4) {
      return 0;
    }
    return smoothstep(range.min - range.feather, range.min, luma);
  }
  if (luma > range.max) {
    if (range.feather <= 1e-4) {
      return 0;
    }
    return 1 - smoothstep(range.max, range.max + range.feather, luma);
  }
  return 1;
};

const resolveLocalMaskColorWeight = (
  hue: number,
  sat: number,
  range: {
    hueCenter: number;
    hueRange: number;
    hueFeather: number;
    satMin: number;
    satFeather: number;
  }
) => {
  let hueWeight = 1;
  if (range.hueRange < 179.999) {
    if (sat <= 1e-3) {
      return 0;
    }
    const distance = resolveHueDistance(hue, range.hueCenter);
    if (distance <= range.hueRange) {
      hueWeight = 1;
    } else if (range.hueFeather <= 1e-4) {
      hueWeight = 0;
    } else {
      hueWeight =
        1 - smoothstep(range.hueRange, Math.min(180, range.hueRange + range.hueFeather), distance);
    }
  }

  let satWeight = 1;
  if (range.satMin > 1e-4) {
    if (range.satFeather <= 1e-4) {
      satWeight = sat >= range.satMin ? 1 : 0;
    } else {
      satWeight = smoothstep(range.satMin, Math.min(1, range.satMin + range.satFeather), sat);
    }
  }

  return hueWeight * satWeight;
};

const applyLocalMaskLumaRange = (
  maskContext: CanvasRenderingContext2D,
  referenceContext: CanvasRenderingContext2D,
  mask: LocalAdjustmentMask,
  width: number,
  height: number
) => {
  const lumaRange = resolveLocalMaskLumaRange(mask);
  const colorRange = resolveLocalMaskColorRange(mask);
  const hasLumaRange = !(lumaRange.min <= 0.0001 && lumaRange.max >= 0.9999);
  const hasColorRange = !(colorRange.hueRange >= 179.999 && colorRange.satMin <= 1e-4);
  if (!hasLumaRange && !hasColorRange) {
    return;
  }

  const maskImage = maskContext.getImageData(0, 0, width, height);
  const sourceImage = referenceContext.getImageData(0, 0, width, height);
  const maskPixels = maskImage.data;
  const sourcePixels = sourceImage.data;

  for (let index = 0; index < maskPixels.length; index += 4) {
    const alpha = maskPixels[index + 3] ?? 0;
    if (alpha <= 0) {
      continue;
    }
    const r = (sourcePixels[index] ?? 0) / 255;
    const g = (sourcePixels[index + 1] ?? 0) / 255;
    const b = (sourcePixels[index + 2] ?? 0) / 255;
    let weight = 1;

    if (hasLumaRange) {
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      weight *= resolveLocalMaskLumaWeight(luma, lumaRange);
    }

    if (weight > 1e-4 && hasColorRange) {
      const hueSat = resolveHueSatFromRgb(r, g, b);
      weight *= resolveLocalMaskColorWeight(hueSat.hue, hueSat.sat, colorRange);
    }

    maskPixels[index + 3] = Math.round(alpha * weight);
  }

  maskContext.putImageData(maskImage, 0, 0);
};

const buildLocalMask = (
  frameState: FrameState,
  local: LocalAdjustment,
  width: number,
  height: number,
  referenceContext?: CanvasRenderingContext2D
): HTMLCanvasElement => {
  const maskCanvas = getLocalMaskCanvas(frameState);
  ensureCanvasSize(maskCanvas, width, height);
  const context = maskCanvas.getContext("2d");
  if (!context) {
    throw new RenderError("Failed to acquire local mask canvas context.");
  }
  context.clearRect(0, 0, width, height);

  const amount = clamp(local.amount / 100, 0, 1);
  if (amount <= 0.0001) {
    return maskCanvas;
  }

  if (local.mask.invert) {
    context.fillStyle = "rgba(255,255,255,1)";
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "destination-out";
    drawLocalMaskShape(context, local.mask, width, height);
    context.globalCompositeOperation = "source-over";
  } else {
    drawLocalMaskShape(context, local.mask, width, height);
  }

  if (amount < 0.999) {
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = `rgba(255,255,255,${amount})`;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
  }
  if (referenceContext) {
    applyLocalMaskLumaRange(context, referenceContext, local.mask, width, height);
  }

  return maskCanvas;
};

const composeLocalLayer = (params: {
  outputContext: CanvasRenderingContext2D;
  frameState: FrameState;
  layerCanvas: HTMLCanvasElement;
  local: LocalAdjustment;
  width: number;
  height: number;
}) => {
  const blendCanvas = getLocalBlendCanvas(params.frameState);
  ensureCanvasSize(blendCanvas, params.width, params.height);
  const blendContext = blendCanvas.getContext("2d");
  if (!blendContext) {
    throw new RenderError("Failed to acquire local blend canvas context.");
  }

  blendContext.clearRect(0, 0, params.width, params.height);
  blendContext.drawImage(params.layerCanvas, 0, 0, params.width, params.height);
  const maskCanvas = buildLocalMask(
    params.frameState,
    params.local,
    params.width,
    params.height,
    blendContext
  );
  blendContext.globalCompositeOperation = "destination-in";
  blendContext.drawImage(maskCanvas, 0, 0, params.width, params.height);
  blendContext.globalCompositeOperation = "source-over";

  params.outputContext.drawImage(blendCanvas, 0, 0, params.width, params.height);
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
      perspectiveEnabled: Boolean(normalizedAdjustments.perspectiveEnabled),
      perspectiveHorizontal: normalizedAdjustments.perspectiveHorizontal ?? 0,
      perspectiveVertical: normalizedAdjustments.perspectiveVertical ?? 0,
      scale: normalizedAdjustments.scale,
      horizontal: normalizedAdjustments.horizontal,
      vertical: normalizedAdjustments.vertical,
      flipHorizontal: normalizedAdjustments.flipHorizontal,
      flipVertical: normalizedAdjustments.flipVertical,
      opticsProfile: normalizedAdjustments.opticsProfile,
      opticsCA: normalizedAdjustments.opticsCA,
      opticsVignette: normalizedAdjustments.opticsVignette,
      qualityProfile,
    });
    const masterKey = createMasterKey(normalizedAdjustments);
    const hslKey = createHslKey(normalizedAdjustments);
    const curveKey = createCurveKey(normalizedAdjustments);
    const detailKey = createDetailKey(normalizedAdjustments);
    const filmKey = createFilmKey(resolvedProfile, grainSeed);
    const opticsKey = createOpticsKey(resolvedProfile, skipOpticsPass);
    const activeLocalAdjustments = resolveActiveLocalAdjustments(
      normalizedAdjustments.localAdjustments
    );
    const localAdjustmentsKey = createLocalAdjustmentsKey(activeLocalAdjustments);

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
        localAdjustmentsKey,
        timestampText,
        adjustments: normalizedAdjustments,
      });
      outputDirty = !incrementalPipeline || frameState.outputKey !== outputKey;

      const composeStartAt = performance.now();
      if (pixiResult.rendered || outputDirty) {
        outputContext.clearRect(0, 0, canvas.width, canvas.height);
        outputContext.drawImage(pixiResult.canvas, 0, 0, canvas.width, canvas.height);

        for (let localIndex = 0; localIndex < activeLocalAdjustments.length; localIndex += 1) {
          const local = activeLocalAdjustments[localIndex]!;
          const localAdjustments = applyLocalAdjustmentDelta(normalizedAdjustments, local);
          const localMasterKey = createMasterKey(localAdjustments);
          const localHslKey = createHslKey(localAdjustments);
          const localCurveKey = createCurveKey(localAdjustments);
          const localDetailKey = createDetailKey(localAdjustments);
          const localRenderMode: RenderMode = mode === "preview" ? "export" : mode;
          const localSlotId = `${slotId}:local:${local.id || localIndex}`;
          const localFrameState = renderManager.getFrameState(localRenderMode, localSlotId);

          try {
            const localResult = await renderWithPixi(pixiSource, localAdjustments, localFrameState, {
              mode: localRenderMode,
              slotId: localSlotId,
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
              masterKey: localMasterKey,
              hslKey: localHslKey,
              curveKey: localCurveKey,
              detailKey: localDetailKey,
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
            composeLocalLayer({
              outputContext,
              frameState,
              layerCanvas: localResult.canvas,
              local,
              width: canvas.width,
              height: canvas.height,
            });
          } catch (localRenderError) {
            if (strictErrors) {
              throw localRenderError;
            }
            console.warn(`[FilmLab] Local adjustment render skipped (${local.id}).`, localRenderError);
          }
        }

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
      const nextErrorMessage = describeRenderError(e);
      const repeatedRenderError = frameState.lastRenderError === nextErrorMessage;
      frameState.lastRenderError = nextErrorMessage;
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

      if (!repeatedRenderError) {
        console.warn("[FilmLab] PixiJS render failed, showing geometry fallback preview:", e);
      }
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
        localAdjustmentsKey,
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
