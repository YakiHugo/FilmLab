import { resolveRenderProfileFromState } from "@/lib/film";
import { clamp } from "@/lib/math";
import {
  hasLocalMaskRangeConstraints,
  resolveHueSatFromRgb,
  resolveLocalMaskColorRange,
  resolveLocalMaskColorWeight,
  resolveLocalMaskLumaRange,
  resolveLocalMaskLumaWeight,
} from "@/lib/localMaskShared";
import {
  cloneRenderBoundaryMetrics,
  createEmptyRenderBoundaryMetrics,
  createRenderSurfaceHandle,
  type RenderBoundaryMetrics,
  type RenderSurfaceHandle,
  type RenderSurfaceKind,
} from "@/lib/renderSurfaceHandle";
import { resolveRenderIntent, type RenderIntent } from "@/lib/renderIntent";
import { blendMaskedCanvasesOnGpu } from "@/lib/renderer/gpuMaskedCanvasBlend";
import { applyLocalMaskRangeOnGpu } from "@/lib/renderer/gpuLocalMaskRangeGate";
import { applyLocalMaskRangeOnGpuToSurface } from "@/lib/renderer/gpuLocalMaskRangeGate";
import { renderLocalMaskShapeOnGpuToSurface } from "@/lib/renderer/gpuLocalMaskShape";
import { createTilePlan } from "@/lib/renderer/gpu/TiledRenderer";
import { resolveViewportRenderRegion, type ViewportRoi } from "@/lib/renderer/viewportRegion";
import type {
  ImageProcessState,
  ImageRenderColorState,
  ImageRenderDebugOptions,
  ImageRenderDetailState,
  ImageRenderGeometry,
  ImageRenderToneState,
} from "@/render/image/types";
import type {
  LocalAdjustment,
  LocalAdjustmentDelta,
  LocalAdjustmentMask,
} from "@/types";
import type { ResolvedRenderProfile } from "@/types/film";
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

const INCREMENTAL_PIPELINE_ENABLED = true;
const GPU_GEOMETRY_PASS_ENABLED = true;
const HSL_PASS_ENABLED = true;
const CURVE_PASS_ENABLED = true;
const DETAIL_PASS_ENABLED = true;
const FILM_PASS_ENABLED = true;
const OPTICS_PASS_ENABLED = true;
const KEEP_LAST_PREVIEW_FRAME_ON_ERROR = true;

export interface RenderImageDirtyState {
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

export interface RenderImageStageTimings {
  decodeMs: number;
  geometryMs: number;
  pipelineMs: number;
  composeMs: number;
  totalMs: number;
  pipelineMetrics?: RenderWithPipelineResult["renderMetrics"];
}

export interface RenderImageStageCacheState {
  sourceKey: string | null;
  geometryKey: string | null;
  pipelineKey: string | null;
  outputKey: string | null;
  tilePlanKey: string | null;
}

export type RenderImageStageStatus =
  | "rendered"
  | "reused-output"
  | "reused-preview-frame"
  | "geometry-fallback";

export interface RenderImageStageDebugInfo {
  stageId: RenderStageOptions["id"];
  mode: RenderMode;
  slotId: string;
  status: RenderImageStageStatus;
  dirty: RenderImageDirtyState;
  timings: RenderImageStageTimings;
  cache: RenderImageStageCacheState;
  activePasses: string[];
  pipelineRendered: boolean;
  outputKind: RenderSurfaceKind;
  boundaries: RenderBoundaryMetrics;
  usedCpuGeometry: boolean;
  usedViewportRoi: boolean;
  usedTiledPipeline: boolean;
  tileCount: number;
  error: string | null;
}

export interface RenderImageStageResult {
  stageId: RenderStageOptions["id"];
  debug?: RenderImageStageDebugInfo;
}

export interface RenderImageStageSurfaceResult extends RenderImageStageResult {
  surface: RenderSurfaceHandle;
}

export const resolveAspectRatio = (
  value: ImageRenderGeometry["aspectRatio"],
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

const resolveOrientedDimensions = (
  width: number,
  height: number,
  rightAngleRotation: number
) => {
  const quarterTurns = resolveRightAngleQuarterTurns(rightAngleRotation);
  return {
    quarterTurns,
    width: quarterTurns % 2 === 0 ? width : height,
    height: quarterTurns % 2 === 0 ? height : width,
  };
};

export const resolveOrientedAspectRatio = (aspectRatio: number, rightAngleRotation: number) => {
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  return resolveRightAngleQuarterTurns(rightAngleRotation) % 2 === 1
    ? 1 / safeAspectRatio
    : safeAspectRatio;
};

const resolveTransform = (geometry: ImageRenderGeometry, width: number, height: number) => {
  const scale = clamp(geometry.scale / 100, 0.5, 2.0);
  const translateX = clamp(geometry.horizontal / 5, -20, 20);
  const translateY = clamp(geometry.vertical / 5, -20, 20);
  const flipHorizontal = geometry.flipHorizontal ? -1 : 1;
  const flipVertical = geometry.flipVertical ? -1 : 1;
  return {
    scale,
    rotate: (geometry.rotate * Math.PI) / 180,
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

const createOrientedSource = (
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
  boundaryMetrics && (boundaryMetrics.canvasClones += 1);

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
export type RenderImageSource = Blob | string | HTMLCanvasElement;

interface RenderStageOptions {
  id: "full" | "develop-base" | "film-stage";
  applyGeometry: boolean;
  applyDevelop: boolean;
  applyLocalAdjustments: boolean;
  applyFilm: boolean;
  applyPostOptics: boolean;
}

const FULL_RENDER_STAGE: RenderStageOptions = {
  id: "full",
  applyGeometry: true,
  applyDevelop: true,
  applyLocalAdjustments: true,
  applyFilm: true,
  applyPostOptics: true,
};

const DEVELOP_BASE_RENDER_STAGE: RenderStageOptions = {
  id: "develop-base",
  applyGeometry: true,
  applyDevelop: true,
  applyLocalAdjustments: true,
  applyFilm: false,
  applyPostOptics: false,
};

const FILM_STAGE_RENDER_STAGE: RenderStageOptions = {
  id: "film-stage",
  applyGeometry: false,
  applyDevelop: false,
  applyLocalAdjustments: false,
  applyFilm: true,
  applyPostOptics: true,
};

export interface RenderImageOptions {
  canvas: HTMLCanvasElement;
  source: RenderImageSource;
  state: ImageProcessState;
  targetSize?: RenderTargetSize;
  maxDimension?: number;
  seedKey?: string;
  renderSeed?: number;
  exportSeed?: number;
  skipHalationBloom?: boolean;
  signal?: AbortSignal;
  intent?: RenderIntent;
  mode?: RenderMode;
  qualityProfile?: RenderQualityProfile;
  strictErrors?: boolean;
  sourceCacheKey?: string;
  renderSlot?: string;
  viewportRoi?: ViewportRoi | null;
  debug?: ImageRenderDebugOptions;
}

interface InternalRenderImageOptions extends Omit<RenderImageOptions, "canvas"> {
  canvas?: HTMLCanvasElement;
  outputPreference?: "canvas" | "surface";
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

interface RenderWithPipelineOptions {
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
  boundaryMetrics?: RenderBoundaryMetrics;
  forceRerender?: boolean;
  captureLinearOutput?: boolean;
  skipGeometry?: boolean;
  skipMaster?: boolean;
  skipHsl?: boolean;
  skipCurve?: boolean;
  skipDetail?: boolean;
  skipFilm?: boolean;
  skipHalationBloom?: boolean;
}

interface RenderWithPipelineResult {
  canvas: HTMLCanvasElement;
  rendered: boolean;
  pipelineKey: string;
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

const createEmptyPipelineMetrics = (): RenderWithPipelineResult["renderMetrics"] => ({
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
});

const mergePipelineMetrics = (
  target: RenderWithPipelineResult["renderMetrics"],
  metrics: RenderWithPipelineResult["renderMetrics"]
) => {
  target.totalMs += metrics.totalMs;
  target.updateUniformsMs += metrics.updateUniformsMs;
  target.filterChainMs += metrics.filterChainMs;
  target.drawMs += metrics.drawMs;
  target.passCpuMs.geometry += metrics.passCpuMs.geometry;
  target.passCpuMs.master += metrics.passCpuMs.master;
  target.passCpuMs.hsl += metrics.passCpuMs.hsl;
  target.passCpuMs.curve += metrics.passCpuMs.curve;
  target.passCpuMs.detail += metrics.passCpuMs.detail;
  target.passCpuMs.film += metrics.passCpuMs.film;
  target.passCpuMs.optics += metrics.passCpuMs.optics;
  if (metrics.activePasses.length > 0) {
    target.activePasses = Array.from(new Set([...target.activePasses, ...metrics.activePasses]));
  }
};

interface PipelineModuleCache {
  RenderManager: typeof import("@/lib/renderer/RenderManager").RenderManager;
  resolveMasterUniforms: typeof import("@/lib/renderer/uniformResolvers").resolveMasterUniforms;
  resolveHslUniformsFromState: typeof import("@/lib/renderer/uniformResolvers").resolveHslUniformsFromState;
  resolveCurveUniformsFromState: typeof import("@/lib/renderer/uniformResolvers").resolveCurveUniformsFromState;
  resolveDetailUniformsFromState: typeof import("@/lib/renderer/uniformResolvers").resolveDetailUniformsFromState;
  resolveFilmUniformsV3: typeof import("@/lib/renderer/uniformResolvers").resolveFilmUniformsV3;
  resolveHalationBloomUniformsV3: typeof import("@/lib/renderer/uniformResolvers").resolveHalationBloomUniformsV3;
}

let _pipelineModuleCache: PipelineModuleCache | null = null;
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

const resolveActiveLocalAdjustmentsFromState = (state: ImageProcessState) =>
  state.develop.regions
    .map((region) => {
      const maskDefinition = state.masks.byId[region.maskId];
      if (!maskDefinition) {
        return null;
      }
      return {
        id: region.id,
        enabled: region.enabled,
        amount: region.amount,
        mask: structuredClone(maskDefinition.mask),
        adjustments: structuredClone(region.adjustments),
      } satisfies LocalAdjustment;
    })
    .filter((local): local is LocalAdjustment => {
      if (!local) {
        return false;
      }
      return (
        local.enabled &&
        local.amount > 0.0001 &&
        hasLocalAdjustmentDelta(local.adjustments)
      );
    });

const serializeLocalMask = (mask: LocalAdjustmentMask) => {
  const lumaMin = clamp(mask.lumaMin ?? 0, 0, 1);
  const lumaMax = clamp(mask.lumaMax ?? 1, 0, 1);
  const lumaFeather = clamp(mask.lumaFeather ?? 0, 0, 1);
  const hueCenter = (((mask.hueCenter ?? 0) % 360) + 360) % 360;
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
  base: ImageProcessState,
  local: LocalAdjustment
): ImageProcessState => {
  const next: ImageProcessState = {
    ...base,
    develop: {
      ...base.develop,
      tone: {
        ...base.develop.tone,
      },
      color: {
        ...base.develop.color,
      },
      detail: {
        ...base.develop.detail,
      },
      regions: [],
    },
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
    switch (key) {
      case "exposure":
      case "contrast":
      case "highlights":
      case "shadows":
      case "whites":
      case "blacks":
        next.develop.tone[key] = clamp(
          (base.develop.tone[key] ?? 0) + (value as number),
          min,
          max
        );
        break;
      case "temperature":
      case "tint":
      case "vibrance":
      case "saturation":
        next.develop.color[key] = clamp(
          (base.develop.color[key] ?? 0) + (value as number),
          min,
          max
        );
        break;
      case "texture":
      case "clarity":
      case "dehaze":
        next.develop.detail[key] = clamp(
          (base.develop.detail[key] ?? 0) + (value as number),
          min,
          max
        );
        break;
      default:
        break;
    }
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
    next.develop.detail[key] = clamp(
      (base.develop.detail[key] ?? 0) + (value as number),
      min,
      max
    );
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
  source: RenderImageSource,
  loaded: LoadedImageSource,
  resolvedSourceCacheKey?: string
) => {
  if (resolvedSourceCacheKey) {
    return resolvedSourceCacheKey;
  }
  if (source instanceof HTMLCanvasElement) {
    return `canvas:${getCanvasRuntimeId(source)}:${loaded.width}x${loaded.height}`;
  }
  if (typeof source === "string") {
    return `url:${source}`;
  }
  return `blob:${source.type}:${source.size}:${loaded.width}x${loaded.height}`;
};

const createMasterKey = (
  tone: ImageRenderToneState,
  color: ImageRenderColorState,
  detail: Pick<ImageRenderDetailState, "dehaze">
) =>
  [
    "m",
    toNumberKey(tone.exposure, 3),
    toNumberKey(tone.contrast, 3),
    toNumberKey(tone.highlights, 3),
    toNumberKey(tone.shadows, 3),
    toNumberKey(tone.whites, 3),
    toNumberKey(tone.blacks, 3),
    toNumberKey(color.temperature, 3),
    toNumberKey(color.tint, 3),
    Number.isFinite(color.temperatureKelvin ?? NaN)
      ? toNumberKey(color.temperatureKelvin as number, 2)
      : "kelvin:na",
    Number.isFinite(color.tintMG ?? NaN) ? toNumberKey(color.tintMG as number, 2) : "tintmg:na",
    toNumberKey(color.saturation, 3),
    toNumberKey(color.vibrance, 3),
    toNumberKey(color.colorGrading.shadows.hue, 3),
    toNumberKey(color.colorGrading.shadows.saturation, 3),
    toNumberKey(color.colorGrading.shadows.luminance, 3),
    toNumberKey(color.colorGrading.midtones.hue, 3),
    toNumberKey(color.colorGrading.midtones.saturation, 3),
    toNumberKey(color.colorGrading.midtones.luminance, 3),
    toNumberKey(color.colorGrading.highlights.hue, 3),
    toNumberKey(color.colorGrading.highlights.saturation, 3),
    toNumberKey(color.colorGrading.highlights.luminance, 3),
    toNumberKey(color.colorGrading.blend, 3),
    toNumberKey(color.colorGrading.balance, 3),
    toNumberKey(detail.dehaze, 3),
  ].join("|");

const createHslKey = (color: ImageRenderColorState) =>
  [
    "h",
    toNumberKey(color.hsl.red.hue, 2),
    toNumberKey(color.hsl.red.saturation, 2),
    toNumberKey(color.hsl.red.luminance, 2),
    toNumberKey(color.hsl.orange.hue, 2),
    toNumberKey(color.hsl.orange.saturation, 2),
    toNumberKey(color.hsl.orange.luminance, 2),
    toNumberKey(color.hsl.yellow.hue, 2),
    toNumberKey(color.hsl.yellow.saturation, 2),
    toNumberKey(color.hsl.yellow.luminance, 2),
    toNumberKey(color.hsl.green.hue, 2),
    toNumberKey(color.hsl.green.saturation, 2),
    toNumberKey(color.hsl.green.luminance, 2),
    toNumberKey(color.hsl.aqua.hue, 2),
    toNumberKey(color.hsl.aqua.saturation, 2),
    toNumberKey(color.hsl.aqua.luminance, 2),
    toNumberKey(color.hsl.blue.hue, 2),
    toNumberKey(color.hsl.blue.saturation, 2),
    toNumberKey(color.hsl.blue.luminance, 2),
    toNumberKey(color.hsl.purple.hue, 2),
    toNumberKey(color.hsl.purple.saturation, 2),
    toNumberKey(color.hsl.purple.luminance, 2),
    toNumberKey(color.hsl.magenta.hue, 2),
    toNumberKey(color.hsl.magenta.saturation, 2),
    toNumberKey(color.hsl.magenta.luminance, 2),
    color.bwEnabled ? "bw:1" : "bw:0",
    toNumberKey(color.bwMix?.red ?? 0, 2),
    toNumberKey(color.bwMix?.green ?? 0, 2),
    toNumberKey(color.bwMix?.blue ?? 0, 2),
    toNumberKey(color.calibration?.redHue ?? 0, 2),
    toNumberKey(color.calibration?.redSaturation ?? 0, 2),
    toNumberKey(color.calibration?.greenHue ?? 0, 2),
    toNumberKey(color.calibration?.greenSaturation ?? 0, 2),
    toNumberKey(color.calibration?.blueHue ?? 0, 2),
    toNumberKey(color.calibration?.blueSaturation ?? 0, 2),
  ].join("|");

const serializeCurvePoints = (points: ImageRenderColorState["pointCurve"]["rgb"]) =>
  points.map((point) => `${toNumberKey(point.x, 0)}:${toNumberKey(point.y, 0)}`).join(",");

const createCurveKey = (color: Pick<ImageRenderColorState, "pointCurve">) =>
  [
    "c",
    serializeCurvePoints(color.pointCurve.rgb),
    serializeCurvePoints(color.pointCurve.red),
    serializeCurvePoints(color.pointCurve.green),
    serializeCurvePoints(color.pointCurve.blue),
  ].join("|");

const createDetailKey = (detail: ImageRenderDetailState) =>
  [
    "d",
    toNumberKey(detail.texture, 2),
    toNumberKey(detail.clarity, 2),
    toNumberKey(detail.sharpening, 2),
    toNumberKey(detail.sharpenRadius, 2),
    toNumberKey(detail.sharpenDetail, 2),
    toNumberKey(detail.masking, 2),
    toNumberKey(detail.noiseReduction, 2),
    toNumberKey(detail.colorNoiseReduction, 2),
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
  const lutBlendKey = resolvedProfile.lutBlend
    ? `${resolvedProfile.lutBlend.path}:${resolvedProfile.lutBlend.size}:${toNumberKey(
        resolvedProfile.lutBlend.mixFactor,
        4
      )}`
    : "none";
  const customLutKey = resolvedProfile.customLut
    ? `${resolvedProfile.customLut.path}:${resolvedProfile.customLut.size}:${toNumberKey(
        resolvedProfile.customLut.intensity,
        4
      )}`
    : "none";
  const printLutKey = resolvedProfile.printLut
    ? `${resolvedProfile.printLut.path}:${resolvedProfile.printLut.size}`
    : "none";
  const pushPullKey = [
    resolvedProfile.pushPull.enabled ? "1" : "0",
    toNumberKey(resolvedProfile.pushPull.ev, 3),
    resolvedProfile.pushPull.source,
    resolvedProfile.pushPull.selectedStop === null
      ? "none"
      : toNumberKey(resolvedProfile.pushPull.selectedStop, 2),
  ].join(":");
  return [
    "f",
    resolvedProfile.mode,
    sourceProfileHash,
    lutKey,
    lutBlendKey,
    customLutKey,
    printLutKey,
    pushPullKey,
    toNumberKey(grainSeed, 0),
  ].join("|");
};

const createOpticsKey = (resolvedProfile: ResolvedRenderProfile, skipHalationBloom?: boolean) => {
  const halation = resolvedProfile.v3.halation
    ? JSON.stringify(resolvedProfile.v3.halation)
    : "none";
  const bloom = resolvedProfile.v3.bloom ? JSON.stringify(resolvedProfile.v3.bloom) : "none";
  const glow = resolvedProfile.v3.glow ? JSON.stringify(resolvedProfile.v3.glow) : "none";
  return [
    "o",
    skipHalationBloom ? "1" : "0",
    hashString(halation),
    hashString(bloom),
    hashString(glow),
  ].join("|");
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
  fullOutputWidth?: number;
  fullOutputHeight?: number;
  outputOffsetX?: number;
  outputOffsetY?: number;
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
  opticsDistortionK1: number;
  opticsDistortionK2: number;
  opticsCaAmount: number;
  opticsVignette: number;
  opticsVignetteMidpoint: number;
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
    toNumberKey(params.fullOutputWidth ?? params.outputWidth, 0),
    toNumberKey(params.fullOutputHeight ?? params.outputHeight, 0),
    toNumberKey(params.outputOffsetX ?? 0, 0),
    toNumberKey(params.outputOffsetY ?? 0, 0),
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
    toNumberKey(params.opticsDistortionK1, 2),
    toNumberKey(params.opticsDistortionK2, 2),
    toNumberKey(params.opticsCaAmount, 2),
    toNumberKey(params.opticsVignette, 2),
    toNumberKey(params.opticsVignetteMidpoint, 2),
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
  fullOutputWidth?: number;
  fullOutputHeight?: number;
  outputOffsetX?: number;
  outputOffsetY?: number;
  geometry: ImageRenderGeometry;
}): GeometryUniforms => {
  const sourceWidth = Math.max(1, params.sourceWidth);
  const sourceHeight = Math.max(1, params.sourceHeight);
  const outputWidth = Math.max(1, params.outputWidth);
  const outputHeight = Math.max(1, params.outputHeight);
  const fullOutputWidth = Math.max(1, params.fullOutputWidth ?? outputWidth);
  const fullOutputHeight = Math.max(1, params.fullOutputHeight ?? outputHeight);
  const transform = resolveTransform(params.geometry, fullOutputWidth, fullOutputHeight);
  const perspectiveHorizontal = params.geometry.perspectiveHorizontal ?? 0;
  const perspectiveVertical = params.geometry.perspectiveVertical ?? 0;
  const perspectiveEnabled = Boolean(params.geometry.perspectiveEnabled);
  const kx = (perspectiveHorizontal / 100) * 0.35;
  const ky = (perspectiveVertical / 100) * 0.35;
  const homography = perspectiveEnabled
    ? [1, 0, 0, 0, 1, 0, kx, ky, 1]
    : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const lensEnabled = params.geometry.opticsProfile;
  // Vignette removal is independent of lens profile
  const opticsVignetteStrength = clamp(params.geometry.opticsVignette / 100, 0, 1);
  const lensK1Control = clamp((params.geometry.opticsDistortionK1 ?? 0) / 100, -1, 1);
  const lensK2Control = clamp((params.geometry.opticsDistortionK2 ?? 0) / 100, -1, 1);
  const lensK1 = lensEnabled ? lensK1Control * 0.5 : 0;
  const lensK2 = lensEnabled ? lensK2Control * 0.3 : 0;
  const vignetteMidpointControl = clamp(
    (params.geometry.opticsVignetteMidpoint ?? 50) / 100,
    0,
    1
  );
  const lensVignetteMidpoint = 0.05 + vignetteMidpointControl * 0.4;
  const caEnabled = params.geometry.opticsCA;
  const caAmountControl = clamp((params.geometry.opticsCaAmount ?? 0) / 100, 0, 1);
  const caAmountBasePx = caEnabled ? caAmountControl * 2.5 : 0;

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
    translatePx: [
      transform.translateX - (params.outputOffsetX ?? 0),
      transform.translateY - (params.outputOffsetY ?? 0),
    ],
    rotate: transform.rotate,
    perspectiveEnabled,
    homography,
    scale: transform.scale,
    flip: [transform.flipHorizontal, transform.flipVertical],
    lensEnabled,
    lensK1,
    lensK2,
    lensVignetteBoost: opticsVignetteStrength,
    lensVignetteMidpoint,
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
  lensVignetteMidpoint: 0.25,
  caEnabled: false,
  caAmountPxRgb: [0, 0, 0],
});

const applyOpticsToPassthroughGeometryUniforms = (
  passthrough: GeometryUniforms,
  optics: GeometryUniforms
) => {
  passthrough.lensEnabled = optics.lensEnabled;
  passthrough.lensK1 = optics.lensK1;
  passthrough.lensK2 = optics.lensK2;
  passthrough.lensVignetteBoost = optics.lensVignetteBoost;
  passthrough.lensVignetteMidpoint = optics.lensVignetteMidpoint;
  passthrough.caEnabled = optics.caEnabled;
  passthrough.caAmountPxRgb = [...optics.caAmountPxRgb] as [number, number, number];

  const lensDistortionActive = Math.abs(optics.lensK1) > 1e-6 || Math.abs(optics.lensK2) > 1e-6;
  const vignetteActive = optics.lensVignetteBoost > 0.001;
  const caAmountMax = Math.max(
    Math.abs(optics.caAmountPxRgb[0]),
    Math.abs(optics.caAmountPxRgb[1]),
    Math.abs(optics.caAmountPxRgb[2])
  );
  const caActive = optics.caEnabled && caAmountMax > 0.001;

  // Keep geometry disabled unless optics actually need the shader path.
  passthrough.enabled = lensDistortionActive || vignetteActive || caActive;
};

const createOutputKey = (params: {
  canvas?: HTMLCanvasElement | null;
  outputIdentity?: string;
  width?: number;
  height?: number;
  pipelineKey: string;
  localAdjustmentsKey: string;
}) => {
  const width = Math.max(1, Math.round(params.width ?? params.canvas?.width ?? 1));
  const height = Math.max(1, Math.round(params.height ?? params.canvas?.height ?? 1));
  const outputIdentity = params.outputIdentity ?? (params.canvas ? `canvas:${getCanvasRuntimeId(params.canvas)}` : "surface");
  return [
    "out",
    outputIdentity,
    `${width}x${height}`,
    params.pipelineKey,
    params.localAdjustmentsKey,
  ].join("|");
};

const ensurePipelineModules = async (): Promise<PipelineModuleCache> => {
  if (_pipelineModuleCache) {
    return _pipelineModuleCache;
  }

  const [managerMod, uniformsMod] = await Promise.all([
    import("@/lib/renderer/RenderManager"),
    import("@/lib/renderer/uniformResolvers"),
  ]);

  _pipelineModuleCache = {
    RenderManager: managerMod.RenderManager,
    resolveMasterUniforms: uniformsMod.resolveMasterUniforms,
    resolveHslUniformsFromState: uniformsMod.resolveHslUniformsFromState,
    resolveCurveUniformsFromState: uniformsMod.resolveCurveUniformsFromState,
    resolveDetailUniformsFromState: uniformsMod.resolveDetailUniformsFromState,
    resolveFilmUniformsV3: uniformsMod.resolveFilmUniformsV3,
    resolveHalationBloomUniformsV3: uniformsMod.resolveHalationBloomUniformsV3,
  };

  return _pipelineModuleCache;
};

const getRenderManager = async () => {
  const modules = await ensurePipelineModules();
  if (!_renderManagerInstance) {
    _renderManagerInstance = new modules.RenderManager();
  }
  return _renderManagerInstance;
};

export const releaseRenderSlots = async (mode: RenderMode, slotPrefix?: string) => {
  const renderManager = await getRenderManager();
  if (slotPrefix?.trim()) {
    renderManager.disposeBySlotPrefix(mode, slotPrefix);
    return;
  }
  renderManager.dispose(mode);
};

/**
 * Lazy-load and invoke the Pipeline multi-pass renderer.
 * This is the sole GPU rendering path and throws RenderError on failure.
 */
const renderWithPipeline = async (
  sourceImage: CanvasImageSource,
  state: ImageProcessState,
  frameState: FrameState,
  options: RenderWithPipelineOptions
): Promise<RenderWithPipelineResult> => {
  const emptyMetrics: RenderWithPipelineResult["renderMetrics"] = {
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
    const modules = await ensurePipelineModules();
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

    if (
      options.targetWidth > renderer.maxTextureSize ||
      options.targetHeight > renderer.maxTextureSize
    ) {
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
      !!options.forceRerender ||
      sourceDirty ||
      frameState.uploadedGeometryKey !== options.uploadKey;
    const pipelineKey = [
      options.geometryKey,
      options.masterKey,
      options.hslKey,
      options.curveKey,
      options.detailKey,
      options.filmKey,
      options.opticsKey,
      options.skipGeometry ? "g:0" : "g:1",
      options.skipMaster ? "m:0" : "m:1",
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
      frameState.pipelineKey !== pipelineKey;

    if (renderNeeded) {
      const scratch = _uniformScratchByMode[options.mode];
      const masterUniforms = modules.resolveMasterUniforms(
        state.develop.tone,
        state.develop.color,
        state.develop.detail,
        scratch.master
      );
      scratch.master = masterUniforms;
      const hslUniforms = modules.resolveHslUniformsFromState(
        state.develop.color,
        scratch.hsl
      );
      scratch.hsl = hslUniforms;
      const curveUniforms = modules.resolveCurveUniformsFromState(
        state.develop.color,
        scratch.curve
      );
      scratch.curve = curveUniforms;
      const detailUniforms = modules.resolveDetailUniformsFromState(
        state.develop.detail,
        {
          shortEdgePx: Math.min(options.targetWidth, options.targetHeight),
        },
        scratch.detail
      );
      scratch.detail = detailUniforms;

      let filmUniforms: ReturnType<typeof modules.resolveFilmUniformsV3> | null = null;
      let halationBloomUniforms:
        | ReturnType<typeof modules.resolveHalationBloomUniformsV3>
        | null = null;
      const enableFilmPath = !options.skipFilm;
      const enableOpticsPath = !options.skipHalationBloom;

      if (enableFilmPath) {
        filmUniforms = modules.resolveFilmUniformsV3(
          options.resolvedProfile.v3,
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
        filmUniforms.u_lutMixEnabled =
          filmUniforms.u_lutEnabled && !!options.resolvedProfile.lutBlend;
        filmUniforms.u_lutMixFactor = options.resolvedProfile.lutBlend?.mixFactor ?? 0;
        filmUniforms.u_customLutEnabled =
          filmUniforms.u_customLutEnabled && !!options.resolvedProfile.customLut;
        if (!filmUniforms.u_customLutEnabled) {
          filmUniforms.u_customLutIntensity = 0;
        }
        filmUniforms.u_printLutEnabled =
          filmUniforms.u_printLutEnabled && !!options.resolvedProfile.printLut;
        if (!filmUniforms.u_printLutEnabled) {
          filmUniforms.u_printLutIntensity = 0;
        }

        if (options.resolvedProfile.lut) {
          await renderer.ensureLUT({
            url: options.resolvedProfile.lut.path,
            level: options.resolvedProfile.lut.size,
          });
        }
        if (options.resolvedProfile.lutBlend && typeof renderer.ensureLUTBlend === "function") {
          await renderer.ensureLUTBlend({
            url: options.resolvedProfile.lutBlend.path,
            level: options.resolvedProfile.lutBlend.size,
          });
        }

        if (options.resolvedProfile.customLut && typeof renderer.ensureCustomLUT === "function") {
          await renderer.ensureCustomLUT({
            url: options.resolvedProfile.customLut.path,
            level: options.resolvedProfile.customLut.size,
          });
        }

        if (options.resolvedProfile.printLut && typeof renderer.ensurePrintLUT === "function") {
          await renderer.ensurePrintLUT({
            url: options.resolvedProfile.printLut.path,
            level: options.resolvedProfile.printLut.size,
          });
        }
      }
      if (enableOpticsPath) {
        halationBloomUniforms = modules.resolveHalationBloomUniformsV3(
          options.resolvedProfile.v3,
          scratch.halation
        );
        scratch.halation = halationBloomUniforms;
      }

      const renderMetrics = structuredClone(emptyMetrics);
      if (uploadNeeded) {
        options.boundaryMetrics && (options.boundaryMetrics.textureUploads += 1);
        renderer.updateSource(
          sourceImage as TexImageSource,
          options.sourceWidth,
          options.sourceHeight,
          options.targetWidth,
          options.targetHeight
        );
      }

      const finalMetrics = renderer.render(
        options.geometryUniforms,
        masterUniforms,
        hslUniforms,
        curveUniforms,
        detailUniforms,
        filmUniforms,
        {
          skipGeometry: options.skipGeometry,
          skipMaster: options.skipMaster,
          skipHsl: options.skipHsl,
          skipCurve: options.skipCurve,
          skipDetail: options.skipDetail,
          skipFilm: options.skipFilm,
          skipHalationBloom: options.skipHalationBloom,
          captureLinearOutput: options.captureLinearOutput,
        },
        halationBloomUniforms
      );
      renderMetrics.totalMs = finalMetrics.totalMs;
      renderMetrics.updateUniformsMs = finalMetrics.updateUniformsMs;
      renderMetrics.filterChainMs = finalMetrics.filterChainMs;
      renderMetrics.drawMs = finalMetrics.drawMs;
      renderMetrics.passCpuMs.geometry = finalMetrics.passCpuMs.geometry;
      renderMetrics.passCpuMs.master = finalMetrics.passCpuMs.master;
      renderMetrics.passCpuMs.hsl = finalMetrics.passCpuMs.hsl;
      renderMetrics.passCpuMs.curve = finalMetrics.passCpuMs.curve;
      renderMetrics.passCpuMs.detail = finalMetrics.passCpuMs.detail;
      renderMetrics.passCpuMs.film = finalMetrics.passCpuMs.film;
      renderMetrics.passCpuMs.optics = finalMetrics.passCpuMs.optics;
      renderMetrics.activePasses = [...finalMetrics.activePasses];

      frameState.sourceKey = options.sourceKey;
      frameState.geometryKey = options.geometryKey;
      frameState.masterKey = options.masterKey;
      frameState.hslKey = options.hslKey;
      frameState.curveKey = options.curveKey;
      frameState.detailKey = options.detailKey;
      frameState.filmKey = options.filmKey;
      frameState.opticsKey = options.opticsKey;
      frameState.uploadedGeometryKey = options.uploadKey;
      frameState.pipelineKey = pipelineKey;
      frameState.lastRenderError = null;

      return {
        canvas: renderer.canvas,
        rendered: true,
        pipelineKey,
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
    frameState.pipelineKey = pipelineKey;
    frameState.lastRenderError = null;

    return {
      canvas: renderer.canvas,
      rendered: false,
      pipelineKey,
      renderMetrics: emptyMetrics,
    };
  } catch (e) {
    const shouldRecycleRenderer = !(options.mode === "preview" && !options.strictErrors);
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
    throw new RenderError("Pipeline render failed", { cause: e });
  }
};

const cloneRenderStageTimings = (
  timings: RenderImageStageTimings
): RenderImageStageTimings => ({
  decodeMs: timings.decodeMs,
  geometryMs: timings.geometryMs,
  pipelineMs: timings.pipelineMs,
  composeMs: timings.composeMs,
  totalMs: timings.totalMs,
  pipelineMetrics: timings.pipelineMetrics
    ? {
        totalMs: timings.pipelineMetrics.totalMs,
        updateUniformsMs: timings.pipelineMetrics.updateUniformsMs,
        filterChainMs: timings.pipelineMetrics.filterChainMs,
        drawMs: timings.pipelineMetrics.drawMs,
        passCpuMs: {
          geometry: timings.pipelineMetrics.passCpuMs.geometry,
          master: timings.pipelineMetrics.passCpuMs.master,
          hsl: timings.pipelineMetrics.passCpuMs.hsl,
          curve: timings.pipelineMetrics.passCpuMs.curve,
          detail: timings.pipelineMetrics.passCpuMs.detail,
          film: timings.pipelineMetrics.passCpuMs.film,
          optics: timings.pipelineMetrics.passCpuMs.optics,
        },
        activePasses: [...timings.pipelineMetrics.activePasses],
      }
    : undefined,
});

const createCacheStateSnapshot = (frameState: FrameState): RenderImageStageCacheState => ({
  sourceKey: frameState.sourceKey,
  geometryKey: frameState.geometryKey,
  pipelineKey: frameState.pipelineKey,
  outputKey: frameState.outputKey,
  tilePlanKey: frameState.tilePlanKey,
});

const createStageResult = ({
  stage,
  mode,
  slotId,
  debug,
  status,
  dirty,
  timings,
  frameState,
  pipelineRendered,
  usedCpuGeometry,
  usedViewportRoi,
  usedTiledPipeline,
  tileCount,
  error,
  surface,
  boundaries,
}: {
  stage: RenderStageOptions;
  mode: RenderMode;
  slotId: string;
  debug?: ImageRenderDebugOptions;
  status: RenderImageStageStatus;
  dirty: RenderImageDirtyState;
  timings: RenderImageStageTimings;
  frameState: FrameState;
  pipelineRendered: boolean;
  usedCpuGeometry: boolean;
  usedViewportRoi: boolean;
  usedTiledPipeline: boolean;
  tileCount: number;
  error: string | null;
  surface: RenderSurfaceHandle;
  boundaries: RenderBoundaryMetrics;
}): RenderImageStageSurfaceResult => {
  if (!debug?.trace) {
    return {
      stageId: stage.id,
      surface,
    };
  }

  const pipelineMetrics = timings.pipelineMetrics;
  return {
    stageId: stage.id,
    surface,
    debug: {
      stageId: stage.id,
      mode,
      slotId,
      status,
      dirty: { ...dirty },
      timings: cloneRenderStageTimings(timings),
      cache: createCacheStateSnapshot(frameState),
      activePasses: pipelineMetrics ? [...pipelineMetrics.activePasses] : [],
      pipelineRendered,
      outputKind: surface.kind,
      boundaries: cloneRenderBoundaryMetrics(boundaries),
      usedCpuGeometry,
      usedViewportRoi,
      usedTiledPipeline,
      tileCount,
      error,
    },
  };
};

const describeRenderError = (error: unknown): string => {
  if (error instanceof Error) {
    const causeMessage =
      error.cause !== undefined && error.cause !== null ? describeRenderError(error.cause) : "";
    return causeMessage ? `${error.message} | cause: ${causeMessage}` : error.message;
  }
  return String(error);
};

const drawGeometryStage = (params: {
  geometryCanvas: HTMLCanvasElement;
  source: CanvasImageSource;
  sourceWidth: number;
  sourceHeight: number;
  orientedWidth: number;
  orientedHeight: number;
  sourceQuarterTurns?: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  outputWidth: number;
  outputHeight: number;
  fullOutputWidth?: number;
  fullOutputHeight?: number;
  outputOffsetX?: number;
  outputOffsetY?: number;
  geometry: ImageRenderGeometry;
  qualityProfile: RenderQualityProfile;
}) => {
  const geometryCanvas = params.geometryCanvas;
  geometryCanvas.width = Math.max(1, Math.round(params.outputWidth));
  geometryCanvas.height = Math.max(1, Math.round(params.outputHeight));
  const fullOutputWidth = Math.max(1, Math.round(params.fullOutputWidth ?? params.outputWidth));
  const fullOutputHeight = Math.max(1, Math.round(params.fullOutputHeight ?? params.outputHeight));
  const outputOffsetX = params.outputOffsetX ?? 0;
  const outputOffsetY = params.outputOffsetY ?? 0;
  const geometryContext = geometryCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!geometryContext) {
    throw new RenderError("Failed to acquire geometry canvas context.");
  }

  geometryContext.clearRect(0, 0, geometryCanvas.width, geometryCanvas.height);
  geometryContext.imageSmoothingQuality = params.qualityProfile === "full" ? "high" : "medium";

  const transform = resolveTransform(params.geometry, fullOutputWidth, fullOutputHeight);
  const sourceQuarterTurns = ((params.sourceQuarterTurns ?? 0) % 4 + 4) % 4;
  geometryContext.save();
  geometryContext.translate(
    fullOutputWidth / 2 + transform.translateX - outputOffsetX,
    fullOutputHeight / 2 + transform.translateY - outputOffsetY
  );
  geometryContext.rotate(transform.rotate);
  geometryContext.scale(
    transform.scale * transform.flipHorizontal,
    transform.scale * transform.flipVertical
  );
  if (sourceQuarterTurns === 0) {
    geometryContext.drawImage(
      params.source,
      params.cropX,
      params.cropY,
      params.cropWidth,
      params.cropHeight,
      -fullOutputWidth / 2,
      -fullOutputHeight / 2,
      fullOutputWidth,
      fullOutputHeight
    );
  } else {
    geometryContext.beginPath();
    geometryContext.rect(
      -fullOutputWidth / 2,
      -fullOutputHeight / 2,
      fullOutputWidth,
      fullOutputHeight
    );
    geometryContext.clip();
    geometryContext.translate(-fullOutputWidth / 2, -fullOutputHeight / 2);
    geometryContext.scale(
      fullOutputWidth / Math.max(1, params.cropWidth),
      fullOutputHeight / Math.max(1, params.cropHeight)
    );
    geometryContext.translate(-params.cropX, -params.cropY);
    if (sourceQuarterTurns === 1) {
      geometryContext.translate(params.orientedWidth, 0);
      geometryContext.rotate(Math.PI / 2);
    } else if (sourceQuarterTurns === 2) {
      geometryContext.translate(params.orientedWidth, params.orientedHeight);
      geometryContext.rotate(Math.PI);
    } else {
      geometryContext.translate(0, params.orientedHeight);
      geometryContext.rotate(-Math.PI / 2);
    }
    geometryContext.drawImage(
      params.source,
      0,
      0,
      params.sourceWidth,
      params.sourceHeight
    );
  }
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
  height: number,
  options?: {
    fullWidth?: number;
    fullHeight?: number;
    offsetX?: number;
    offsetY?: number;
  }
) => {
  const fullWidth = Math.max(1, options?.fullWidth ?? width);
  const fullHeight = Math.max(1, options?.fullHeight ?? height);
  const offsetX = options?.offsetX ?? 0;
  const offsetY = options?.offsetY ?? 0;

  if (mask.mode === "brush") {
    const minDimension = Math.max(1, Math.min(fullWidth, fullHeight));
    const brushSizePx = Math.max(1, clamp(mask.brushSize, 0.005, 0.25) * minDimension);
    const feather = clamp(mask.feather, 0, 1);
    const flow = clamp(mask.flow, 0.05, 1);
    if (mask.points.length === 0) {
      return;
    }
    for (const point of mask.points) {
      const px = clamp(point.x, 0, 1) * fullWidth - offsetX;
      const py = clamp(point.y, 0, 1) * fullHeight - offsetY;
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
    const centerX = clamp(mask.centerX, 0, 1) * fullWidth - offsetX;
    const centerY = clamp(mask.centerY, 0, 1) * fullHeight - offsetY;
    const radiusX = Math.max(1, clamp(mask.radiusX, 0.01, 1) * fullWidth);
    const radiusY = Math.max(1, clamp(mask.radiusY, 0.01, 1) * fullHeight);
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

  const startX = clamp(mask.startX, 0, 1) * fullWidth - offsetX;
  const startY = clamp(mask.startY, 0, 1) * fullHeight - offsetY;
  const endX = clamp(mask.endX, 0, 1) * fullWidth - offsetX;
  let endY = clamp(mask.endY, 0, 1) * fullHeight - offsetY;
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

const applyLocalMaskLumaRange = (
  maskContext: CanvasRenderingContext2D,
  referenceContext: CanvasRenderingContext2D,
  mask: LocalAdjustmentMask,
  width: number,
  height: number,
  boundaryMetrics?: RenderBoundaryMetrics
) => {
  const lumaRange = resolveLocalMaskLumaRange(mask);
  const colorRange = resolveLocalMaskColorRange(mask);
  const hasLumaRange = !(lumaRange.min <= 0.0001 && lumaRange.max >= 0.9999);
  const hasColorRange = !(colorRange.hueRange >= 179.999 && colorRange.satMin <= 1e-4);
  if (!hasLumaRange && !hasColorRange) {
    return;
  }

  boundaryMetrics && (boundaryMetrics.cpuPixelReads += 1);
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

const buildLocalMask = async (
  frameState: FrameState,
  local: LocalAdjustment,
  width: number,
  height: number,
  referenceContext?: CanvasRenderingContext2D,
  options?: {
    fullWidth?: number;
    fullHeight?: number;
    offsetX?: number;
    offsetY?: number;
    boundaryMetrics?: RenderBoundaryMetrics;
  }
): Promise<HTMLCanvasElement> => {
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

  let maskSurface = await renderLocalMaskShapeOnGpuToSurface({
    width,
    height,
    mask: local.mask,
    slotId: `local-mask-shape:${local.id || "anonymous"}`,
    fullWidth: options?.fullWidth,
    fullHeight: options?.fullHeight,
    offsetX: options?.offsetX,
    offsetY: options?.offsetY,
  });

  if (!maskSurface) {
    if (local.mask.invert) {
      context.fillStyle = "rgba(255,255,255,1)";
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = "destination-out";
      drawLocalMaskShape(context, local.mask, width, height, options);
      context.globalCompositeOperation = "source-over";
    } else {
      drawLocalMaskShape(context, local.mask, width, height, options);
    }
  }

  let needsCpuRangeFallback = false;
  if (referenceContext && hasLocalMaskRangeConstraints(local.mask)) {
    if (maskSurface) {
      const gatedSurface = await applyLocalMaskRangeOnGpuToSurface({
        referenceSource: referenceContext.canvas,
        maskSource: maskSurface.sourceCanvas,
        width,
        height,
        mask: local.mask,
        slotId: `local-mask:${local.id || "anonymous"}`,
      });
      if (gatedSurface) {
        maskSurface = gatedSurface;
      } else {
        needsCpuRangeFallback = true;
      }
    } else {
      const appliedOnGpu = await applyLocalMaskRangeOnGpu({
        maskCanvas,
        referenceSource: referenceContext.canvas,
        mask: local.mask,
        slotId: `local-mask:${local.id || "anonymous"}`,
      });
      if (!appliedOnGpu) {
        needsCpuRangeFallback = true;
      }
    }
  }

  if (maskSurface) {
    maskSurface.materializeToCanvas(maskCanvas);
  }
  if (amount < 0.999) {
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = `rgba(255,255,255,${amount})`;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
  }
  if (needsCpuRangeFallback && referenceContext) {
    applyLocalMaskLumaRange(
      context,
      referenceContext,
      local.mask,
      width,
      height,
      options?.boundaryMetrics
    );
  }

  return maskCanvas;
};

const composeLocalLayer = async (params: {
  outputContext: CanvasRenderingContext2D;
  frameState: FrameState;
  layerCanvas: HTMLCanvasElement;
  local: LocalAdjustment;
  width: number;
  height: number;
  offsetX?: number;
  offsetY?: number;
  fullWidth?: number;
  fullHeight?: number;
  boundaryMetrics?: RenderBoundaryMetrics;
  gpuBlendSlotId?: string;
}) => {
  const blendCanvas = getLocalBlendCanvas(params.frameState);
  ensureCanvasSize(blendCanvas, params.width, params.height);
  const blendContext = blendCanvas.getContext("2d");
  if (!blendContext) {
    throw new RenderError("Failed to acquire local blend canvas context.");
  }
  const maskCanvas = await prepareLocalMaskCanvas({
    frameState: params.frameState,
    layerCanvas: params.layerCanvas,
    local: params.local,
    width: params.width,
    height: params.height,
    offsetX: params.offsetX,
    offsetY: params.offsetY,
    fullWidth: params.fullWidth,
    fullHeight: params.fullHeight,
    boundaryMetrics: params.boundaryMetrics,
  });
  const outputCanvas = params.outputContext.canvas;
  const offsetX = params.offsetX ?? 0;
  const offsetY = params.offsetY ?? 0;
  const canBlendDirectlyOnGpu =
    outputCanvas instanceof HTMLCanvasElement &&
    offsetX === 0 &&
    offsetY === 0 &&
    params.width === outputCanvas.width &&
    params.height === outputCanvas.height;
  if (canBlendDirectlyOnGpu) {
    const blendedOnGpu = await blendMaskedCanvasesOnGpu({
      baseCanvas: outputCanvas,
      layerCanvas: params.layerCanvas,
      maskCanvas,
      targetCanvas: outputCanvas,
      slotId: params.gpuBlendSlotId ?? `local-compose:${params.local.id || "anonymous"}`,
    });
    if (blendedOnGpu) {
      return;
    }
  }
  const canBlendRoiOnGpu =
    outputCanvas instanceof HTMLCanvasElement &&
    params.width > 0 &&
    params.height > 0 &&
    (offsetX !== 0 ||
      offsetY !== 0 ||
      params.width !== outputCanvas.width ||
      params.height !== outputCanvas.height);
  if (canBlendRoiOnGpu) {
    blendContext.clearRect(0, 0, params.width, params.height);
    blendContext.drawImage(
      outputCanvas,
      offsetX,
      offsetY,
      params.width,
      params.height,
      0,
      0,
      params.width,
      params.height
    );
    const blendedOnGpu = await blendMaskedCanvasesOnGpu({
      baseCanvas: blendCanvas,
      layerCanvas: params.layerCanvas,
      maskCanvas,
      targetCanvas: blendCanvas,
      slotId: params.gpuBlendSlotId ?? `local-compose:${params.local.id || "anonymous"}`,
    });
    if (blendedOnGpu) {
      params.outputContext.clearRect(offsetX, offsetY, params.width, params.height);
      params.outputContext.drawImage(
        blendCanvas,
        offsetX,
        offsetY,
        params.width,
        params.height
      );
      return;
    }
  }
  blendContext.clearRect(0, 0, params.width, params.height);
  blendContext.drawImage(params.layerCanvas, 0, 0, params.width, params.height);
  blendContext.globalCompositeOperation = "destination-in";
  blendContext.drawImage(maskCanvas, 0, 0, params.width, params.height);
  blendContext.globalCompositeOperation = "source-over";
  params.outputContext.drawImage(
    blendCanvas,
    offsetX,
    offsetY,
    params.width,
    params.height
  );
};

const prepareLocalMaskCanvas = async (params: {
  frameState: FrameState;
  layerCanvas: HTMLCanvasElement;
  local: LocalAdjustment;
  width: number;
  height: number;
  offsetX?: number;
  offsetY?: number;
  fullWidth?: number;
  fullHeight?: number;
  boundaryMetrics?: RenderBoundaryMetrics;
}) => {
  const blendCanvas = getLocalBlendCanvas(params.frameState);
  ensureCanvasSize(blendCanvas, params.width, params.height);
  const blendContext = blendCanvas.getContext("2d");
  if (!blendContext) {
    throw new RenderError("Failed to acquire local blend canvas context.");
  }

  blendContext.clearRect(0, 0, params.width, params.height);
  blendContext.drawImage(params.layerCanvas, 0, 0, params.width, params.height);
  const maskCanvas = await buildLocalMask(
    params.frameState,
    params.local,
    params.width,
    params.height,
    blendContext,
    {
      fullWidth: params.fullWidth,
      fullHeight: params.fullHeight,
      offsetX: params.offsetX,
      offsetY: params.offsetY,
      boundaryMetrics: params.boundaryMetrics,
    }
  );
  return maskCanvas;
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
    _pipelineModuleCache = null;
    clearUniformScratch();
    clearSourceBitmapCache();
  });

  import.meta.hot.accept(
    ["@/lib/renderer/RenderManager", "@/lib/renderer/uniformResolvers"],
    () => {
      _pipelineModuleCache = null;
      clearUniformScratch();
    }
  );
}

const renderImageStageInternal = async (
  {
    canvas,
    source,
    state,
    targetSize,
    maxDimension,
    seedKey,
    renderSeed,
    exportSeed,
    skipHalationBloom: skipHalationBloomOption,
    signal,
    intent,
    mode: modeOption,
    qualityProfile: qualityProfileOption,
    strictErrors: strictErrorsOption,
    sourceCacheKey,
    renderSlot,
    viewportRoi,
    debug,
    outputPreference = "canvas",
  }: InternalRenderImageOptions,
  stage: RenderStageOptions
): Promise<RenderImageStageSurfaceResult> => {
  const callStartAt = performance.now();
  const intentConfig = intent ? resolveRenderIntent(intent) : null;
  const mode = intentConfig?.mode ?? modeOption ?? "preview";
  const qualityProfile = intentConfig?.qualityProfile ?? qualityProfileOption ?? "interactive";
  const strictErrors = strictErrorsOption ?? mode === "export";
  const skipHalationBloom = skipHalationBloomOption ?? intentConfig?.skipHalationBloom ?? false;
  const pipelineOverrides = debug?.pipelineOverrides;
  const incrementalPipeline =
    pipelineOverrides?.incrementalPipeline ?? INCREMENTAL_PIPELINE_ENABLED;
  const useGpuGeometryPass = pipelineOverrides?.gpuGeometryPass ?? GPU_GEOMETRY_PASS_ENABLED;
  const skipMasterPass = !stage.applyDevelop;
  const skipHslPass =
    skipMasterPass || !(pipelineOverrides?.enableHslPass ?? HSL_PASS_ENABLED);
  const skipCurvePass =
    skipMasterPass || !(pipelineOverrides?.enableCurvePass ?? CURVE_PASS_ENABLED);
  const skipDetailPass =
    skipMasterPass || !(pipelineOverrides?.enableDetailPass ?? DETAIL_PASS_ENABLED);
  const skipFilmPass = !stage.applyFilm || !(pipelineOverrides?.enableFilmPass ?? FILM_PASS_ENABLED);
  const skipOpticsPass =
    !stage.applyPostOptics ||
    skipHalationBloom ||
    !(pipelineOverrides?.enableOpticsPass ?? OPTICS_PASS_ENABLED);
  const keepLastPreviewFrameOnError =
    pipelineOverrides?.keepLastPreviewFrameOnError ?? KEEP_LAST_PREVIEW_FRAME_ON_ERROR;
  const timings: RenderImageStageTimings = {
    decodeMs: 0,
    geometryMs: 0,
    pipelineMs: 0,
    composeMs: 0,
    totalMs: 0,
  };
  let dirtyState: RenderImageDirtyState;
  let stageStatus: RenderImageStageStatus;
  let pipelineRendered: boolean;
  let usedCpuGeometry = false;
  let errorMessage: string | null = null;
  const boundaryMetrics = createEmptyRenderBoundaryMetrics();

  const renderState = state;
  const resolvedProfile = resolveRenderProfileFromState({
    film: renderState.film,
    develop: renderState.develop,
  });
  const resolvedSourceCacheKey = resolveSourceCacheKey(source, seedKey, sourceCacheKey);
  const grainSeed = exportSeed ?? renderSeed ?? (seedKey ? hashSeedKey(seedKey) : Date.now());
  const slotId = renderSlot?.trim()
    ? renderSlot
    : mode === "preview"
      ? "preview-main"
      : "export-main";
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

    const sourceOrientation = stage.applyGeometry
      ? resolveOrientedDimensions(
          loaded.width,
          loaded.height,
          renderState.geometry.rightAngleRotation
        )
      : {
          quarterTurns: 0,
          width: loaded.width,
          height: loaded.height,
        };

    const fallbackRatio = targetSize
      ? targetSize.width / Math.max(1, targetSize.height)
      : sourceOrientation.width / Math.max(1, sourceOrientation.height);
    const targetRatio = stage.applyGeometry
      ? resolveAspectRatio(
          renderState.geometry.aspectRatio,
          renderState.geometry.customAspectRatio,
          fallbackRatio
        )
      : fallbackRatio;
    const sourceRatio = sourceOrientation.width / Math.max(1, sourceOrientation.height);
    let cropWidth = sourceOrientation.width;
    let cropHeight = sourceOrientation.height;
    if (stage.applyGeometry && Math.abs(sourceRatio - targetRatio) > 0.001) {
      if (sourceRatio > targetRatio) {
        cropWidth = sourceOrientation.height * targetRatio;
      } else {
        cropHeight = sourceOrientation.width / targetRatio;
      }
    }
    const cropX = stage.applyGeometry ? (sourceOrientation.width - cropWidth) / 2 : 0;
    const cropY = stage.applyGeometry ? (sourceOrientation.height - cropHeight) / 2 : 0;

    let outputWidth = stage.applyGeometry ? cropWidth : sourceOrientation.width;
    let outputHeight = stage.applyGeometry ? cropHeight : sourceOrientation.height;
    if (targetSize?.width && targetSize?.height) {
      outputWidth = targetSize.width;
      outputHeight = targetSize.height;
    } else if (stage.applyGeometry && maxDimension) {
      const scale = Math.min(1, maxDimension / Math.max(cropWidth, cropHeight));
      outputWidth = Math.max(1, Math.round(cropWidth * scale));
      outputHeight = Math.max(1, Math.round(cropHeight * scale));
    }

    let maxTextureSize = resolveMaxTextureSize();
    try {
      maxTextureSize = Math.min(maxTextureSize, renderManager.getMaxTextureSize(mode, slotId));
    } catch {
      // If renderer bootstrap fails (e.g. no WebGL2), keep the probe value.
      // The GPU pipeline stage will handle strict/non-strict error semantics.
    }
    frameState.tilePlanKey = null;
    let exportTilePlan: ReturnType<typeof createTilePlan> | null = null;
    const largestOutputDimension = Math.max(outputWidth, outputHeight);
    if (largestOutputDimension > maxTextureSize) {
      const tilePlan = createTilePlan({
        width: Math.max(1, Math.round(outputWidth)),
        height: Math.max(1, Math.round(outputHeight)),
        tileSize: Math.max(512, maxTextureSize - 128),
        overlap: 64,
      });
      frameState.tilePlanKey = `${tilePlan.length}:${tilePlan[0]?.width ?? 0}x${
        tilePlan[0]?.height ?? 0
      }`;
      if (mode === "export") {
        exportTilePlan = tilePlan;
      } else {
        const textureScale = maxTextureSize / largestOutputDimension;
        outputWidth = Math.max(1, Math.floor(outputWidth * textureScale));
        outputHeight = Math.max(1, Math.floor(outputHeight * textureScale));
        console.warn(
          `[FilmLab] Output clamped to ${outputWidth}x${outputHeight} due to MAX_TEXTURE_SIZE=${maxTextureSize}.` +
            ` Planned tiles at full resolution: ${tilePlan.length}.`
        );
      }
    }

    const fullOutputWidth = Math.max(1, Math.round(outputWidth));
    const fullOutputHeight = Math.max(1, Math.round(outputHeight));
    const viewportRenderRegion =
      stage.applyGeometry && mode === "preview"
        ? resolveViewportRenderRegion(fullOutputWidth, fullOutputHeight, viewportRoi)
        : null;
    const renderOffsetX = viewportRenderRegion?.x ?? 0;
    const renderOffsetY = viewportRenderRegion?.y ?? 0;
    const renderTargetWidth = viewportRenderRegion?.width ?? fullOutputWidth;
    const renderTargetHeight = viewportRenderRegion?.height ?? fullOutputHeight;
    let outputCanvas = canvas ?? null;
    let outputContext: CanvasRenderingContext2D | null = null;
    const ensureOutputCanvas = () => {
      if (!outputCanvas) {
        outputCanvas = document.createElement("canvas");
      }
      if (outputCanvas.width !== fullOutputWidth) {
        outputCanvas.width = fullOutputWidth;
      }
      if (outputCanvas.height !== fullOutputHeight) {
        outputCanvas.height = fullOutputHeight;
      }
      return outputCanvas;
    };
    const ensureOutputContext = () => {
      if (outputContext) {
        return outputContext;
      }
      const resolvedOutputCanvas = ensureOutputCanvas();
      outputContext = resolvedOutputCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (!outputContext) {
        throw new RenderError("Failed to acquire 2D canvas context.");
      }
      return outputContext;
    };
    const sourceKey = createSourceIdentityKey(source, loaded, resolvedSourceCacheKey);
    const geometryKey = stage.applyGeometry
      ? createGeometryKey({
          sourceKey,
          rightAngleRotation: renderState.geometry.rightAngleRotation,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          outputWidth: renderTargetWidth,
          outputHeight: renderTargetHeight,
          fullOutputWidth,
          fullOutputHeight,
          outputOffsetX: renderOffsetX,
          outputOffsetY: renderOffsetY,
          rotate: renderState.geometry.rotate,
          perspectiveEnabled: Boolean(renderState.geometry.perspectiveEnabled),
          perspectiveHorizontal: renderState.geometry.perspectiveHorizontal ?? 0,
          perspectiveVertical: renderState.geometry.perspectiveVertical ?? 0,
          scale: renderState.geometry.scale,
          horizontal: renderState.geometry.horizontal,
          vertical: renderState.geometry.vertical,
          flipHorizontal: renderState.geometry.flipHorizontal,
          flipVertical: renderState.geometry.flipVertical,
          opticsProfile: renderState.geometry.opticsProfile,
          opticsCA: renderState.geometry.opticsCA,
          opticsDistortionK1: renderState.geometry.opticsDistortionK1 ?? 0,
          opticsDistortionK2: renderState.geometry.opticsDistortionK2 ?? 0,
          opticsCaAmount: renderState.geometry.opticsCaAmount ?? 0,
          opticsVignette: renderState.geometry.opticsVignette,
          opticsVignetteMidpoint: renderState.geometry.opticsVignetteMidpoint ?? 50,
          qualityProfile,
        })
      : [
          "g",
          "passthrough",
          stage.id,
          sourceKey,
          `${renderTargetWidth}x${renderTargetHeight}`,
          `${fullOutputWidth}x${fullOutputHeight}`,
        ].join("|");
    const masterKey = createMasterKey(
      renderState.develop.tone,
      renderState.develop.color,
      renderState.develop.detail
    );
    const hslKey = createHslKey(renderState.develop.color);
    const curveKey = createCurveKey(renderState.develop.color);
    const detailKey = createDetailKey(renderState.develop.detail);
    const filmKey = createFilmKey(resolvedProfile, grainSeed);
    const opticsKey = createOpticsKey(resolvedProfile, skipOpticsPass);
    const activeLocalAdjustments = stage.applyLocalAdjustments
      ? resolveActiveLocalAdjustmentsFromState(renderState)
      : [];
    const localAdjustmentsKey = stage.applyLocalAdjustments
      ? createLocalAdjustmentsKey(activeLocalAdjustments)
      : "local:none";
    const useHdrLocalComposition =
      stage.applyLocalAdjustments &&
      activeLocalAdjustments.length > 0 &&
      !exportTilePlan &&
      !viewportRenderRegion;

    const sourceDirty = !incrementalPipeline || frameState.sourceKey !== sourceKey;
    const geometryDirty =
      !incrementalPipeline || sourceDirty || frameState.geometryKey !== geometryKey;
    const masterDirty = !incrementalPipeline || frameState.masterKey !== masterKey;
    const hslDirty = !incrementalPipeline || frameState.hslKey !== hslKey;
    const curveDirty = !incrementalPipeline || frameState.curveKey !== curveKey;
    const detailDirty = !incrementalPipeline || frameState.detailKey !== detailKey;
    const filmDirty = !incrementalPipeline || frameState.filmKey !== filmKey;
    const opticsDirty = !incrementalPipeline || frameState.opticsKey !== opticsKey;
    dirtyState = {
      sourceDirty,
      geometryDirty,
      masterDirty,
      hslDirty,
      curveDirty,
      detailDirty,
      filmDirty,
      opticsDirty,
      outputDirty: false,
    };
    const canAttemptSlotSurface =
      outputPreference === "surface" && !exportTilePlan && !viewportRenderRegion;
    const canReturnBaseSlotSurface =
      canAttemptSlotSurface && activeLocalAdjustments.length === 0;
    const slotSurfaceOutputIdentity = canAttemptSlotSurface
      ? `surface:${mode}:${slotId}`
      : undefined;
    const canReuseSlotSurfaceOutput =
      canReturnBaseSlotSurface || (canAttemptSlotSurface && useHdrLocalComposition);

    if (exportTilePlan) {
      const resolvedOutputCanvas = ensureOutputCanvas();
      const outputContext = ensureOutputContext();
      const releaseMutex = await acquireRenderMutex(mode, slotId);
      let outputDirty = false;
      let pipelineStartAt = 0;
      let composeStartAt = 0;
      const tiledPipelineKey = [
        "tiled",
        geometryKey,
        masterKey,
        hslKey,
        curveKey,
        detailKey,
        filmKey,
        opticsKey,
        frameState.tilePlanKey ?? `${exportTilePlan.length}`,
      ].join("|");

      try {
        throwIfAborted(signal);
        const renderTiledLayer = async (
          layerState: ImageProcessState,
          layerKeys: {
            master: string;
            hsl: string;
            curve: string;
            detail: string;
          },
          layerContext: CanvasRenderingContext2D,
          layerId: string,
          collectMetrics: boolean
        ): Promise<RenderWithPipelineResult["renderMetrics"]> => {
          const layerMetrics = createEmptyPipelineMetrics();
          const tileStageCanvas = document.createElement("canvas");
          const tileRenderMode: RenderMode = "export";
          const tileSlotId = `${slotId}:tile:${layerId}`;
          const tileFrameState = renderManager.getFrameState(tileRenderMode, tileSlotId);

          layerContext.clearRect(0, 0, resolvedOutputCanvas.width, resolvedOutputCanvas.height);

          for (let tileIndex = 0; tileIndex < exportTilePlan.length; tileIndex += 1) {
            const tile = exportTilePlan[tileIndex]!;
            throwIfAborted(signal);

            let tileGeometryUniforms: GeometryUniforms;
            let tileUploadKey: string;
            const tileSourceKey = `${sourceKey}|${layerId}|tile:${tileIndex}`;
            let tileGeometryKey: string;
            let tileSource: CanvasImageSource;
            let tileSourceWidth: number;
            let tileSourceHeight: number;

            if (stage.applyGeometry) {
              drawGeometryStage({
                geometryCanvas: tileStageCanvas,
                source: loaded.source,
                sourceWidth: loaded.width,
                sourceHeight: loaded.height,
                orientedWidth: sourceOrientation.width,
                orientedHeight: sourceOrientation.height,
                sourceQuarterTurns: sourceOrientation.quarterTurns,
                cropX,
                cropY,
                cropWidth,
                cropHeight,
                outputWidth: tile.width,
                outputHeight: tile.height,
                fullOutputWidth: resolvedOutputCanvas.width,
                fullOutputHeight: resolvedOutputCanvas.height,
                outputOffsetX: tile.x,
                outputOffsetY: tile.y,
                geometry: layerState.geometry,
                qualityProfile,
              });
              tileGeometryUniforms = createPassthroughGeometryUniforms(tile.width, tile.height);
              tileUploadKey = `tile:${tile.x},${tile.y},${tile.width}x${tile.height}|${layerId}`;
              tileGeometryKey = `${geometryKey}|tile:${tile.x},${tile.y},${tile.width}x${tile.height}`;
              tileSource = tileStageCanvas;
              tileSourceWidth = tile.width;
              tileSourceHeight = tile.height;
            } else {
              tileStageCanvas.width = tile.width;
              tileStageCanvas.height = tile.height;
              const tileContext = tileStageCanvas.getContext("2d", { willReadFrequently: true });
              if (!tileContext) {
                throw new RenderError("Failed to acquire tiled stage context.");
              }
              const sourceScaleX =
                loaded.width / Math.max(1, resolvedOutputCanvas.width);
              const sourceScaleY =
                loaded.height / Math.max(1, resolvedOutputCanvas.height);
              tileContext.clearRect(0, 0, tile.width, tile.height);
              tileContext.drawImage(
                loaded.source,
                tile.x * sourceScaleX,
                tile.y * sourceScaleY,
                tile.width * sourceScaleX,
                tile.height * sourceScaleY,
                0,
                0,
                tile.width,
                tile.height
              );
              tileGeometryUniforms = createPassthroughGeometryUniforms(tile.width, tile.height);
              tileUploadKey = `tile:passthrough:${tile.x},${tile.y},${tile.width}x${tile.height}|${layerId}`;
              tileGeometryKey = `${geometryKey}|passthrough:${tile.x},${tile.y},${tile.width}x${tile.height}`;
              tileSource = tileStageCanvas;
              tileSourceWidth = tile.width;
              tileSourceHeight = tile.height;
            }

            const tileResult = await renderWithPipeline(
              tileSource,
              layerState,
              tileFrameState,
              {
                mode: tileRenderMode,
                slotId: tileSlotId,
                strictErrors,
                resolvedProfile,
                geometryUniforms: tileGeometryUniforms,
                sourceWidth: tileSourceWidth,
                sourceHeight: tileSourceHeight,
                targetWidth: tile.width,
                targetHeight: tile.height,
                uploadKey: tileUploadKey,
                sourceKey: tileSourceKey,
                geometryKey: tileGeometryKey,
                masterKey: layerKeys.master,
                hslKey: layerKeys.hsl,
                curveKey: layerKeys.curve,
                detailKey: layerKeys.detail,
                filmKey,
                opticsKey,
                grainSeed,
                boundaryMetrics,
                forceRerender: true,
                skipGeometry: !stage.applyGeometry,
                skipMaster: !stage.applyDevelop,
                skipHsl: skipHslPass,
                skipCurve: skipCurvePass,
                skipDetail: skipDetailPass,
                skipFilm: skipFilmPass,
                skipHalationBloom: skipOpticsPass,
              }
            );

            if (collectMetrics) {
              mergePipelineMetrics(layerMetrics, tileResult.renderMetrics);
            }

            const srcX = Math.max(0, tile.contentX - tile.x);
            const srcY = Math.max(0, tile.contentY - tile.y);
            layerContext.drawImage(
              tileResult.canvas,
              srcX,
              srcY,
              tile.contentWidth,
              tile.contentHeight,
              tile.contentX,
              tile.contentY,
              tile.contentWidth,
              tile.contentHeight
            );
          }

          tileStageCanvas.width = 0;
          tileStageCanvas.height = 0;
          return layerMetrics;
        };

        const outputKey = createOutputKey({
          canvas: resolvedOutputCanvas,
          pipelineKey: tiledPipelineKey,
          localAdjustmentsKey,
        });
        outputDirty = !incrementalPipeline || frameState.outputKey !== outputKey;
        if (outputPreference === "surface" && !canvas && !outputDirty) {
          outputDirty = true;
        }
        dirtyState.outputDirty = outputDirty;

        if (outputDirty) {
          pipelineStartAt = performance.now();
          const baseMetrics = await renderTiledLayer(
            renderState,
            {
              master: masterKey,
              hsl: hslKey,
              curve: curveKey,
              detail: detailKey,
            },
            outputContext,
            "base",
            true
          );
          timings.pipelineMs = performance.now() - pipelineStartAt;
          timings.pipelineMetrics = baseMetrics;

          composeStartAt = performance.now();
          for (let localIndex = 0; localIndex < activeLocalAdjustments.length; localIndex += 1) {
            const local = activeLocalAdjustments[localIndex]!;
            const localState = applyLocalAdjustmentDelta(renderState, local);
            const localCanvas = document.createElement("canvas");
            localCanvas.width = resolvedOutputCanvas.width;
            localCanvas.height = resolvedOutputCanvas.height;
            const localContext = localCanvas.getContext("2d", { willReadFrequently: true });
            if (!localContext) {
              localCanvas.width = 0;
              localCanvas.height = 0;
              throw new RenderError("Failed to acquire tiled local layer context.");
            }

            try {
              await renderTiledLayer(
                localState,
                {
                  master: createMasterKey(
                    localState.develop.tone,
                    localState.develop.color,
                    localState.develop.detail
                  ),
                  hsl: createHslKey(localState.develop.color),
                  curve: createCurveKey(localState.develop.color),
                  detail: createDetailKey(localState.develop.detail),
                },
                localContext,
                `local:${local.id || localIndex}`,
                false
              );
              await composeLocalLayer({
                outputContext,
                frameState,
                layerCanvas: localCanvas,
                local,
                width: resolvedOutputCanvas.width,
                height: resolvedOutputCanvas.height,
                boundaryMetrics,
                gpuBlendSlotId: `${slotId}:local-compose:${local.id || localIndex}`,
              });
            } finally {
              localCanvas.width = 0;
              localCanvas.height = 0;
            }
          }
          timings.composeMs = performance.now() - composeStartAt;

          frameState.sourceKey = sourceKey;
          frameState.geometryKey = geometryKey;
          frameState.masterKey = masterKey;
          frameState.hslKey = hslKey;
          frameState.curveKey = curveKey;
          frameState.detailKey = detailKey;
          frameState.filmKey = filmKey;
          frameState.opticsKey = opticsKey;
          frameState.uploadedGeometryKey = `tiled:${sourceKey}`;
          frameState.pipelineKey = tiledPipelineKey;
          frameState.outputKey = outputKey;
          frameState.lastRenderError = null;
        }

        timings.totalMs = performance.now() - callStartAt;
        stageStatus = outputDirty ? "rendered" : "reused-output";
        pipelineRendered = outputDirty;
        usedCpuGeometry = stage.applyGeometry;
        return createStageResult({
          stage,
          mode,
          slotId,
          debug,
          status: stageStatus,
          dirty: dirtyState,
          timings,
          frameState,
          pipelineRendered,
          usedCpuGeometry,
          usedViewportRoi: false,
          usedTiledPipeline: true,
          tileCount: exportTilePlan.length,
          error: errorMessage,
          surface: createRenderSurfaceHandle({
            kind: "output-canvas",
            mode,
            slotId,
            sourceCanvas: resolvedOutputCanvas,
            metrics: boundaryMetrics,
          }),
          boundaries: boundaryMetrics,
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          throw e;
        }
        if (strictErrors) {
          throw e;
        }
        console.warn("[FilmLab] Tiled export failed, trying geometry fallback:", e);
        errorMessage = describeRenderError(e);
        if (pipelineStartAt > 0 && timings.pipelineMs === 0) {
          timings.pipelineMs = performance.now() - pipelineStartAt;
        }
        if (composeStartAt > 0 && timings.composeMs === 0) {
          timings.composeMs = performance.now() - composeStartAt;
        }
        const fallbackGeometryCanvas = getGeometryCanvas(frameState);
        const fallbackComposeStartAt = performance.now();
        outputContext.clearRect(0, 0, resolvedOutputCanvas.width, resolvedOutputCanvas.height);
        if (stage.applyGeometry) {
          drawGeometryStage({
            geometryCanvas: fallbackGeometryCanvas,
            source: loaded.source,
            sourceWidth: loaded.width,
            sourceHeight: loaded.height,
            orientedWidth: sourceOrientation.width,
            orientedHeight: sourceOrientation.height,
            sourceQuarterTurns: sourceOrientation.quarterTurns,
            cropX,
            cropY,
            cropWidth,
            cropHeight,
            outputWidth: resolvedOutputCanvas.width,
            outputHeight: resolvedOutputCanvas.height,
            geometry: renderState.geometry,
            qualityProfile,
          });
          outputContext.drawImage(
            fallbackGeometryCanvas,
            0,
            0,
            resolvedOutputCanvas.width,
            resolvedOutputCanvas.height
          );
        } else {
          outputContext.drawImage(
            loaded.source,
            0,
            0,
            resolvedOutputCanvas.width,
            resolvedOutputCanvas.height
          );
        }
        timings.composeMs += performance.now() - fallbackComposeStartAt;
        timings.totalMs = performance.now() - callStartAt;
        dirtyState.outputDirty = true;
        frameState.sourceKey = sourceKey;
        frameState.geometryKey = geometryKey;
        frameState.masterKey = masterKey;
        frameState.hslKey = hslKey;
        frameState.curveKey = curveKey;
        frameState.detailKey = detailKey;
        frameState.filmKey = filmKey;
        frameState.opticsKey = opticsKey;
        frameState.uploadedGeometryKey = `fallback:tiled:${geometryKey}`;
        frameState.pipelineKey = `fallback:tiled:${tiledPipelineKey}`;
        frameState.outputKey = createOutputKey({
          canvas: resolvedOutputCanvas,
          pipelineKey: frameState.pipelineKey,
          localAdjustmentsKey,
        });
        frameState.lastRenderError = errorMessage;
        stageStatus = "geometry-fallback";
        usedCpuGeometry = stage.applyGeometry;
        return createStageResult({
          stage,
          mode,
          slotId,
          debug,
          status: stageStatus,
          dirty: dirtyState,
          timings,
          frameState,
          pipelineRendered: false,
          usedCpuGeometry,
          usedViewportRoi: false,
          usedTiledPipeline: true,
          tileCount: exportTilePlan.length,
          error: errorMessage,
          surface: createRenderSurfaceHandle({
            kind: "geometry-fallback",
            mode,
            slotId,
            sourceCanvas: resolvedOutputCanvas,
            metrics: boundaryMetrics,
          }),
          boundaries: boundaryMetrics,
        });
      } finally {
        releaseMutex();
      }
    }

    const geometryStartAt = performance.now();
    let geometryUniforms = stage.applyGeometry
      ? createGeometryUniforms({
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          sourceWidth: sourceOrientation.width,
          sourceHeight: sourceOrientation.height,
          outputWidth: renderTargetWidth,
          outputHeight: renderTargetHeight,
          fullOutputWidth,
          fullOutputHeight,
          outputOffsetX: renderOffsetX,
          outputOffsetY: renderOffsetY,
          geometry: renderState.geometry,
        })
      : createPassthroughGeometryUniforms(renderTargetWidth, renderTargetHeight);
    let uploadKey = createUploadKey({
      sourceKey,
      sourceWidth: sourceOrientation.width,
      sourceHeight: sourceOrientation.height,
      targetWidth: renderTargetWidth,
      targetHeight: renderTargetHeight,
    });
    let pipelineSource: CanvasImageSource = loaded.source;
    let pipelineSourceWidth = loaded.width;
    let pipelineSourceHeight = loaded.height;

    if (stage.applyGeometry && (!useGpuGeometryPass || viewportRenderRegion)) {
      const geometryCanvas = getGeometryCanvas(frameState);
      const needsCpuGeometryDraw =
        !incrementalPipeline ||
        geometryDirty ||
        geometryCanvas.width !== renderTargetWidth ||
        geometryCanvas.height !== renderTargetHeight;
      if (needsCpuGeometryDraw) {
        drawGeometryStage({
          geometryCanvas,
          source: loaded.source,
          sourceWidth: loaded.width,
          sourceHeight: loaded.height,
          orientedWidth: sourceOrientation.width,
          orientedHeight: sourceOrientation.height,
          sourceQuarterTurns: sourceOrientation.quarterTurns,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          outputWidth: renderTargetWidth,
          outputHeight: renderTargetHeight,
          fullOutputWidth,
          fullOutputHeight,
          outputOffsetX: renderOffsetX,
          outputOffsetY: renderOffsetY,
          geometry: renderState.geometry,
          qualityProfile,
        });
      }
      const passthroughGeometryUniforms = createPassthroughGeometryUniforms(
        renderTargetWidth,
        renderTargetHeight
      );
      applyOpticsToPassthroughGeometryUniforms(passthroughGeometryUniforms, geometryUniforms);
      geometryUniforms = passthroughGeometryUniforms;
      uploadKey = `cpu:${geometryKey}`;
      pipelineSource = geometryCanvas;
      pipelineSourceWidth = geometryCanvas.width;
      pipelineSourceHeight = geometryCanvas.height;
      usedCpuGeometry = true;
    } else if (stage.applyGeometry) {
      orientedSource =
        sourceOrientation.quarterTurns === 0
          ? loaded
          : createOrientedSource(loaded, renderState.geometry.rightAngleRotation, boundaryMetrics);
      pipelineSource = orientedSource.source;
      pipelineSourceWidth = orientedSource.width;
      pipelineSourceHeight = orientedSource.height;
    }
    timings.geometryMs = performance.now() - geometryStartAt;

    // Preserve CPU-stage dirty state even if GPU rendering fails, so repeated
    // preview retries do not re-run geometry work unnecessarily.
    frameState.sourceKey = sourceKey;
    frameState.geometryKey = geometryKey;

    const releaseMutex = await acquireRenderMutex(mode, slotId);
    let outputDirty = false;
    let pipelineStartAt = 0;
    let composeStartAt = 0;
    try {
      throwIfAborted(signal);

      pipelineStartAt = performance.now();
      const pipelineResult = await renderWithPipeline(
        pipelineSource,
        renderState,
        frameState,
        {
          mode,
          slotId,
          strictErrors,
          resolvedProfile,
          geometryUniforms,
          sourceWidth: pipelineSourceWidth,
          sourceHeight: pipelineSourceHeight,
          targetWidth: renderTargetWidth,
          targetHeight: renderTargetHeight,
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
          boundaryMetrics,
          forceRerender: !incrementalPipeline,
          captureLinearOutput: useHdrLocalComposition,
          skipGeometry: !stage.applyGeometry,
          skipMaster: skipMasterPass,
          skipHsl: skipHslPass,
          skipCurve: skipCurvePass,
          skipDetail: skipDetailPass,
          skipFilm: skipFilmPass,
          skipHalationBloom: skipOpticsPass,
        }
      );
      timings.pipelineMs = performance.now() - pipelineStartAt;
      timings.pipelineMetrics = pipelineResult.renderMetrics;

      const outputKey = createOutputKey({
        canvas: canReuseSlotSurfaceOutput ? null : ensureOutputCanvas(),
        outputIdentity: canReuseSlotSurfaceOutput ? slotSurfaceOutputIdentity : undefined,
        width: fullOutputWidth,
        height: fullOutputHeight,
        pipelineKey: pipelineResult.pipelineKey,
        localAdjustmentsKey,
      });
      outputDirty = !incrementalPipeline || frameState.outputKey !== outputKey;
      if (outputPreference === "surface" && !canReuseSlotSurfaceOutput && !canvas && !outputDirty) {
        outputDirty = true;
      }
      dirtyState.outputDirty = outputDirty;

      composeStartAt = performance.now();
      let resolvedOutputKind: RenderSurfaceKind = canReturnBaseSlotSurface
        ? "renderer-slot"
        : "output-canvas";
      let resolvedSurfaceCanvas: HTMLCanvasElement | null = canReturnBaseSlotSurface
        ? pipelineResult.canvas
        : null;
      let resolvedOutputKey = outputKey;
      if (pipelineResult.rendered || outputDirty) {
        const composeLocalWithCanvas = async () => {
          const outputContext = ensureOutputContext();
          const resolvedOutputCanvas = ensureOutputCanvas();
          if (viewportRenderRegion) {
            outputContext.clearRect(
              renderOffsetX,
              renderOffsetY,
              renderTargetWidth,
              renderTargetHeight
            );
            outputContext.drawImage(
              pipelineResult.canvas,
              renderOffsetX,
              renderOffsetY,
              renderTargetWidth,
              renderTargetHeight
            );
          } else {
            outputContext.clearRect(0, 0, resolvedOutputCanvas.width, resolvedOutputCanvas.height);
            outputContext.drawImage(
              pipelineResult.canvas,
              0,
              0,
              resolvedOutputCanvas.width,
              resolvedOutputCanvas.height
            );
          }

          for (let localIndex = 0; localIndex < activeLocalAdjustments.length; localIndex += 1) {
            const local = activeLocalAdjustments[localIndex]!;
            const localState = applyLocalAdjustmentDelta(renderState, local);
            const localMasterKey = createMasterKey(
              localState.develop.tone,
              localState.develop.color,
              localState.develop.detail
            );
            const localHslKey = createHslKey(localState.develop.color);
            const localCurveKey = createCurveKey(localState.develop.color);
            const localDetailKey = createDetailKey(localState.develop.detail);
            const localRenderMode: RenderMode = mode;
            const localSlotId = `${slotId}:local:${local.id || localIndex}`;
            const localFrameState = renderManager.getFrameState(localRenderMode, localSlotId);

            try {
              const localResult = await renderWithPipeline(
                pipelineSource,
                localState,
                localFrameState,
                {
                  mode: localRenderMode,
                  slotId: localSlotId,
                  strictErrors,
                  resolvedProfile,
                  geometryUniforms,
                  sourceWidth: pipelineSourceWidth,
                  sourceHeight: pipelineSourceHeight,
                  targetWidth: renderTargetWidth,
                  targetHeight: renderTargetHeight,
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
                  boundaryMetrics,
                  forceRerender: !incrementalPipeline,
                  skipGeometry: !stage.applyGeometry,
                  skipMaster: skipMasterPass,
                  skipHsl: skipHslPass,
                  skipCurve: skipCurvePass,
                  skipDetail: skipDetailPass,
                  skipFilm: skipFilmPass,
                  skipHalationBloom: skipOpticsPass,
                }
              );
              await composeLocalLayer({
                outputContext,
                frameState,
                layerCanvas: localResult.canvas,
                local,
                width: renderTargetWidth,
                height: renderTargetHeight,
                offsetX: renderOffsetX,
                offsetY: renderOffsetY,
                fullWidth: resolvedOutputCanvas.width,
                fullHeight: resolvedOutputCanvas.height,
                boundaryMetrics,
                gpuBlendSlotId: `${slotId}:local-compose:${local.id || localIndex}`,
              });
            } catch (localRenderError) {
              if (strictErrors) {
                throw localRenderError;
              }
              console.warn(
                `[FilmLab] Local adjustment render skipped (${local.id}).`,
                localRenderError
              );
            }
          }
        };

        if (canReturnBaseSlotSurface) {
          frameState.outputKey = resolvedOutputKey;
          frameState.lastRenderError = null;
        } else if (!useHdrLocalComposition) {
          await composeLocalWithCanvas();
          resolvedOutputKind = "output-canvas";
          resolvedSurfaceCanvas = null;
          resolvedOutputKey = createOutputKey({
            canvas: ensureOutputCanvas(),
            width: fullOutputWidth,
            height: fullOutputHeight,
            pipelineKey: pipelineResult.pipelineKey,
            localAdjustmentsKey,
          });
        } else {
          const outputContext = ensureOutputContext();
          const resolvedOutputCanvas = ensureOutputCanvas();
          const composeRenderer = renderManager.getRenderer(
            mode,
            resolvedOutputCanvas.width,
            resolvedOutputCanvas.height,
            slotId
          );
          let compositedLinear = composeRenderer.consumeCapturedLinearResult();
          if (!compositedLinear) {
            await composeLocalWithCanvas();
            resolvedOutputKind = "output-canvas";
            resolvedSurfaceCanvas = null;
            resolvedOutputKey = createOutputKey({
              canvas: resolvedOutputCanvas,
              width: fullOutputWidth,
              height: fullOutputHeight,
              pipelineKey: pipelineResult.pipelineKey,
              localAdjustmentsKey,
            });
          } else {
            try {
              for (
                let localIndex = 0;
                localIndex < activeLocalAdjustments.length;
                localIndex += 1
              ) {
                const local = activeLocalAdjustments[localIndex]!;
                const localState = applyLocalAdjustmentDelta(renderState, local);
                const localMasterKey = createMasterKey(
                  localState.develop.tone,
                  localState.develop.color,
                  localState.develop.detail
                );
                const localHslKey = createHslKey(localState.develop.color);
                const localCurveKey = createCurveKey(localState.develop.color);
                const localDetailKey = createDetailKey(localState.develop.detail);
                const localRenderMode: RenderMode = mode;
                const localSlotId = `${slotId}:local:${local.id || localIndex}`;
                const localFrameState = renderManager.getFrameState(localRenderMode, localSlotId);

                try {
                  const localResult = await renderWithPipeline(
                    pipelineSource,
                    localState,
                    localFrameState,
                    {
                      mode: localRenderMode,
                      slotId: localSlotId,
                      strictErrors,
                      resolvedProfile,
                      geometryUniforms,
                      sourceWidth: pipelineSourceWidth,
                      sourceHeight: pipelineSourceHeight,
                      targetWidth: resolvedOutputCanvas.width,
                      targetHeight: resolvedOutputCanvas.height,
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
                      boundaryMetrics,
                      captureLinearOutput: true,
                      skipGeometry: !stage.applyGeometry,
                      skipMaster: skipMasterPass,
                      skipHsl: skipHslPass,
                      skipCurve: skipCurvePass,
                      skipDetail: skipDetailPass,
                      skipFilm: skipFilmPass,
                      skipHalationBloom: skipOpticsPass,
                    }
                  );
                  const localRenderer = renderManager.getRenderer(
                    localRenderMode,
                    resolvedOutputCanvas.width,
                    resolvedOutputCanvas.height,
                    localSlotId
                  );
                  const localLinear = localRenderer.borrowCapturedLinearResult();
                  if (!localLinear) {
                    continue;
                  }

                  let blended: ReturnType<typeof composeRenderer.blendLinearWithMask> | null = null;
                  try {
                    const maskCanvas = await prepareLocalMaskCanvas({
                      frameState,
                      layerCanvas: localResult.canvas,
                      local,
                      width: resolvedOutputCanvas.width,
                      height: resolvedOutputCanvas.height,
                      boundaryMetrics,
                    });
                    blended = composeRenderer.blendLinearWithMask(
                      compositedLinear,
                      localLinear,
                      maskCanvas
                    );
                  } finally {
                    localLinear.release();
                  }
                  if (blended) {
                    compositedLinear.release();
                    compositedLinear = blended;
                  }
                } catch (localRenderError) {
                  if (strictErrors) {
                    throw localRenderError;
                  }
                  console.warn(
                    `[FilmLab] Local adjustment render skipped (${local.id}).`,
                    localRenderError
                  );
                }
              }

              composeRenderer.presentLinearResult(compositedLinear);
              if (canAttemptSlotSurface) {
                resolvedOutputKind = "renderer-slot";
                resolvedSurfaceCanvas = composeRenderer.canvas;
                resolvedOutputKey = createOutputKey({
                  canvas: null,
                  outputIdentity: slotSurfaceOutputIdentity,
                  width: fullOutputWidth,
                  height: fullOutputHeight,
                  pipelineKey: pipelineResult.pipelineKey,
                  localAdjustmentsKey,
                });
              } else {
                outputContext.clearRect(0, 0, resolvedOutputCanvas.width, resolvedOutputCanvas.height);
                outputContext.drawImage(
                  composeRenderer.canvas,
                  0,
                  0,
                  resolvedOutputCanvas.width,
                  resolvedOutputCanvas.height
                );
                resolvedOutputKind = "output-canvas";
                resolvedSurfaceCanvas = null;
                resolvedOutputKey = createOutputKey({
                  canvas: resolvedOutputCanvas,
                  width: fullOutputWidth,
                  height: fullOutputHeight,
                  pipelineKey: pipelineResult.pipelineKey,
                  localAdjustmentsKey,
                });
              }
            } finally {
              compositedLinear.release();
            }
          }
        }
        frameState.outputKey = resolvedOutputKey;
        frameState.lastRenderError = null;
      } else if (canReuseSlotSurfaceOutput) {
        resolvedOutputKind = "renderer-slot";
        resolvedSurfaceCanvas = pipelineResult.canvas;
        resolvedOutputKey = outputKey;
        frameState.lastRenderError = null;
      }
      timings.composeMs = performance.now() - composeStartAt;

      timings.totalMs = performance.now() - callStartAt;
      stageStatus = pipelineResult.rendered || outputDirty ? "rendered" : "reused-output";
      pipelineRendered = pipelineResult.rendered;
      const successSurface = createRenderSurfaceHandle({
        kind: resolvedOutputKind,
        mode,
        slotId,
        sourceCanvas: resolvedSurfaceCanvas ?? ensureOutputCanvas(),
        metrics: boundaryMetrics,
      });
      return createStageResult({
        stage,
        mode,
        slotId,
        debug,
        status: stageStatus,
        dirty: dirtyState,
        timings,
        frameState,
        pipelineRendered,
        usedCpuGeometry,
        usedViewportRoi: !!viewportRenderRegion,
        usedTiledPipeline: false,
        tileCount: 0,
        error: errorMessage,
        surface: successSurface,
        boundaries: boundaryMetrics,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw e;
      }
      const nextErrorMessage = describeRenderError(e);
      const repeatedRenderError = frameState.lastRenderError === nextErrorMessage;
      frameState.lastRenderError = nextErrorMessage;
      errorMessage = nextErrorMessage;
      if (pipelineStartAt > 0 && timings.pipelineMs === 0) {
        timings.pipelineMs = performance.now() - pipelineStartAt;
      }
      if (composeStartAt > 0 && timings.composeMs === 0) {
        timings.composeMs = performance.now() - composeStartAt;
      }
      if (strictErrors) {
        throw e;
      }

      if (mode === "preview" && keepLastPreviewFrameOnError && frameState.outputKey) {
        try {
          const outputContext = ensureOutputContext();
          const resolvedOutputCanvas = ensureOutputCanvas();
          const previewRenderer = renderManager.getRenderer(
            mode,
            renderTargetWidth,
            renderTargetHeight,
            slotId
          );
          const fallbackComposeStartAt = performance.now();
          if (viewportRenderRegion) {
            outputContext.clearRect(
              renderOffsetX,
              renderOffsetY,
              renderTargetWidth,
              renderTargetHeight
            );
            outputContext.drawImage(
              previewRenderer.canvas,
              renderOffsetX,
              renderOffsetY,
              renderTargetWidth,
              renderTargetHeight
            );
          } else {
            outputContext.clearRect(0, 0, resolvedOutputCanvas.width, resolvedOutputCanvas.height);
            outputContext.drawImage(
              previewRenderer.canvas,
              0,
              0,
              resolvedOutputCanvas.width,
              resolvedOutputCanvas.height
            );
          }
          timings.composeMs += performance.now() - fallbackComposeStartAt;
          timings.totalMs = performance.now() - callStartAt;
          dirtyState.outputDirty = false;
          stageStatus = "reused-preview-frame";
          return createStageResult({
            stage,
            mode,
            slotId,
            debug,
            status: stageStatus,
            dirty: dirtyState,
            timings,
            frameState,
            pipelineRendered: false,
            usedCpuGeometry,
            usedViewportRoi: !!viewportRenderRegion,
            usedTiledPipeline: false,
            tileCount: 0,
            error: errorMessage,
            surface: createRenderSurfaceHandle({
              kind: "output-canvas",
              mode,
              slotId,
              sourceCanvas: resolvedOutputCanvas,
              metrics: boundaryMetrics,
            }),
            boundaries: boundaryMetrics,
          });
        } catch {
          // Fallback below.
        }
      }

      if (!repeatedRenderError) {
        console.warn("[FilmLab] Pipeline render failed, showing geometry fallback preview:", e);
      }
      const fallbackComposeStartAt = performance.now();
      const fallbackGeometryCanvas = getGeometryCanvas(frameState);
      const outputContext = ensureOutputContext();
      const resolvedOutputCanvas = ensureOutputCanvas();
      outputContext.clearRect(0, 0, resolvedOutputCanvas.width, resolvedOutputCanvas.height);
      if (stage.applyGeometry) {
        drawGeometryStage({
          geometryCanvas: fallbackGeometryCanvas,
          source: loaded.source,
          sourceWidth: loaded.width,
          sourceHeight: loaded.height,
          orientedWidth: sourceOrientation.width,
          orientedHeight: sourceOrientation.height,
          sourceQuarterTurns: sourceOrientation.quarterTurns,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          outputWidth: renderTargetWidth,
          outputHeight: renderTargetHeight,
          fullOutputWidth,
          fullOutputHeight,
          outputOffsetX: renderOffsetX,
          outputOffsetY: renderOffsetY,
          geometry: renderState.geometry,
          qualityProfile,
        });
        if (viewportRenderRegion) {
          outputContext.clearRect(
            renderOffsetX,
            renderOffsetY,
            renderTargetWidth,
            renderTargetHeight
          );
          outputContext.drawImage(
            fallbackGeometryCanvas,
            renderOffsetX,
            renderOffsetY,
            renderTargetWidth,
            renderTargetHeight
          );
        } else {
          outputContext.drawImage(
            fallbackGeometryCanvas,
            0,
            0,
            resolvedOutputCanvas.width,
            resolvedOutputCanvas.height
          );
        }
      } else {
        outputContext.drawImage(
          loaded.source,
          0,
          0,
          resolvedOutputCanvas.width,
          resolvedOutputCanvas.height
        );
      }
      frameState.pipelineKey = `fallback:${geometryKey}`;
      frameState.outputKey = createOutputKey({
        canvas: resolvedOutputCanvas,
        pipelineKey: frameState.pipelineKey,
        localAdjustmentsKey,
      });
      timings.composeMs += performance.now() - fallbackComposeStartAt;

      timings.totalMs = performance.now() - callStartAt;
      dirtyState.outputDirty = true;
      stageStatus = "geometry-fallback";
      return createStageResult({
        stage,
        mode,
        slotId,
        debug,
        status: stageStatus,
        dirty: dirtyState,
        timings,
        frameState,
        pipelineRendered: false,
        usedCpuGeometry: stage.applyGeometry,
        usedViewportRoi: !!viewportRenderRegion,
        usedTiledPipeline: false,
        tileCount: 0,
        error: errorMessage,
        surface: createRenderSurfaceHandle({
          kind: "geometry-fallback",
          mode,
          slotId,
          sourceCanvas: resolvedOutputCanvas,
          metrics: boundaryMetrics,
        }),
        boundaries: boundaryMetrics,
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

export const renderDevelopBaseToSurface = async (
  options: Omit<RenderImageOptions, "canvas"> & { canvas?: HTMLCanvasElement }
) => renderImageStageInternal({ ...options, outputPreference: "surface" }, DEVELOP_BASE_RENDER_STAGE);

export const renderFilmStageToSurface = async (
  options: Omit<RenderImageOptions, "canvas"> & { canvas?: HTMLCanvasElement }
) => renderImageStageInternal({ ...options, outputPreference: "surface" }, FILM_STAGE_RENDER_STAGE);

export const renderImageToSurface = async (
  options: Omit<RenderImageOptions, "canvas"> & { canvas?: HTMLCanvasElement }
) => renderImageStageInternal({ ...options, outputPreference: "surface" }, FULL_RENDER_STAGE);

export const renderDevelopBaseToCanvas = async (options: RenderImageOptions) =>
  renderImageStageInternal({ ...options, outputPreference: "canvas" }, DEVELOP_BASE_RENDER_STAGE);

export const renderFilmStageToCanvas = async (options: RenderImageOptions) =>
  renderImageStageInternal({ ...options, outputPreference: "canvas" }, FILM_STAGE_RENDER_STAGE);

export const renderImageToCanvas = async (options: RenderImageOptions) =>
  renderImageStageInternal({ ...options, outputPreference: "canvas" }, FULL_RENDER_STAGE);
