import {
  applyFilmPipeline,
  createFilmProfileFromAdjustments,
  disposeWebGL2Renderer,
  ensureFilmProfile,
  renderFilmProfileWebGL2,
} from "@/lib/film";
import { normalizeAdjustments } from "@/lib/adjustments";
import { applyColorGradingToImageData } from "@/lib/colorGrading";
import { applyTimestampOverlay } from "@/lib/timestampOverlay";
import { clamp } from "@/lib/math";
import type { EditingAdjustments, FilmProfile } from "@/types";

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

const loadImageSource = async (
  source: Blob | string,
  signal?: AbortSignal
): Promise<LoadedImageSource> => {
  if (source instanceof Blob) {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
      return {
        source: bitmap as CanvasImageSource,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    }
    const objectUrl = URL.createObjectURL(source);
    try {
      const loaded = await loadImageSource(objectUrl, signal);
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
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  try {
    await image.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to load image"));
    });
  }
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

interface RenderImageOptions {
  canvas: HTMLCanvasElement;
  source: Blob | string;
  adjustments: EditingAdjustments;
  filmProfile?: FilmProfile;
  timestampText?: string | null;
  preferWebGL2?: boolean;
  preferPixi?: boolean;
  targetSize?: RenderTargetSize;
  maxDimension?: number;
  seedKey?: string;
  renderSeed?: number;
  exportSeed?: number;
  signal?: AbortSignal;
}

const hashSeedKey = (seedKey: string) => {
  let hash = 2166136261;
  for (let i = 0; i < seedKey.length; i += 1) {
    hash ^= seedKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const resolveProfile = (adjustments: EditingAdjustments, providedProfile?: FilmProfile) => {
  if (providedProfile) {
    return ensureFilmProfile(providedProfile);
  }
  return createFilmProfileFromAdjustments(normalizeAdjustments(adjustments));
};

interface CanvasStats {
  meanLuma: number;
  minLuma: number;
  maxLuma: number;
  varianceLuma: number;
  meanAlpha: number;
  maxAlpha: number;
}

const SAMPLE_SIZE = 24;

// Reuse a single probe canvas for buildCanvasStats to avoid DOM allocation per call
let _probeCanvas: HTMLCanvasElement | null = null;
let _probeContext: CanvasRenderingContext2D | null = null;

const buildCanvasStats = (canvas: HTMLCanvasElement): CanvasStats | null => {
  if (!_probeCanvas) {
    _probeCanvas = document.createElement("canvas");
    _probeCanvas.width = SAMPLE_SIZE;
    _probeCanvas.height = SAMPLE_SIZE;
    _probeContext = _probeCanvas.getContext("2d", { willReadFrequently: true });
  }
  const context = _probeContext;
  if (!context) {
    return null;
  }

  context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  context.drawImage(canvas, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  const data = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  const pixelCount = SAMPLE_SIZE * SAMPLE_SIZE;

  let minLuma = 1;
  let maxLuma = 0;
  let maxAlpha = 0;
  let sumLuma = 0;
  let sumLumaSquared = 0;
  let sumAlpha = 0;

  for (let i = 0; i < data.length; i += 4) {
    const red = (data[i] ?? 0) / 255;
    const green = (data[i + 1] ?? 0) / 255;
    const blue = (data[i + 2] ?? 0) / 255;
    const alpha = (data[i + 3] ?? 0) / 255;
    const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;

    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
    maxAlpha = Math.max(maxAlpha, alpha);
    sumLuma += luma;
    sumLumaSquared += luma * luma;
    sumAlpha += alpha;
  }

  const meanLuma = sumLuma / pixelCount;
  const varianceLuma = Math.max(0, sumLumaSquared / pixelCount - meanLuma * meanLuma);

  return {
    meanLuma,
    minLuma,
    maxLuma,
    varianceLuma,
    meanAlpha: sumAlpha / pixelCount,
    maxAlpha,
  };
};

const isPixiOutputValid = (sourceCanvas: HTMLCanvasElement, resultCanvas: HTMLCanvasElement) => {
  const sourceStats = buildCanvasStats(sourceCanvas);
  const resultStats = buildCanvasStats(resultCanvas);

  if (!sourceStats || !resultStats) {
    return true;
  }

  const sourceHasVisibleContent = sourceStats.maxLuma > 0.08 || sourceStats.varianceLuma > 0.0008;

  if (sourceHasVisibleContent && resultStats.maxAlpha < 0.02) {
    return false;
  }

  const outputNearBlack =
    resultStats.maxLuma < 0.02 && resultStats.meanLuma < 0.01 && resultStats.varianceLuma < 0.0002;

  if (sourceHasVisibleContent && outputNearBlack) {
    return false;
  }

  return true;
};

/** Debug escape hatch: force legacy WebGL2 renderer via console. */
const isLegacyRendererForced = (): boolean =>
  typeof window !== "undefined" && (window as any).__FILMLAB_USE_LEGACY === true;

/**
 * Lazy-load and invoke the PixiJS multi-pass renderer (default GPU path).
 * Dynamically imports PixiJS on first call to avoid bloating the initial bundle.
 */
const tryPixiRender = async (
  sourceCanvas: HTMLCanvasElement,
  adjustments: EditingAdjustments,
  filmProfile: FilmProfile | undefined,
  options: { seedKey?: string; renderSeed?: number; exportSeed?: number }
): Promise<HTMLCanvasElement | null> => {
  try {
    // Use cached modules or resolve on first call
    if (!_pixiModuleCache) {
      const [rendererMod, uniformsMod] = await Promise.all([
        import("@/lib/renderer/PixiRenderer"),
        import("@/lib/renderer/uniformResolvers"),
      ]);
      _pixiModuleCache = {
        PixiRenderer: rendererMod.PixiRenderer,
        resolveFromAdjustments: uniformsMod.resolveFromAdjustments,
        resolveFilmUniforms: uniformsMod.resolveFilmUniforms,
        resolveHalationBloomUniforms: uniformsMod.resolveHalationBloomUniforms,
      };
    }
    const {
      PixiRenderer,
      resolveFromAdjustments,
      resolveFilmUniforms,
      resolveHalationBloomUniforms,
    } = _pixiModuleCache;

    // Lazily create the renderer singleton, or recreate after context loss
    if (pixiRendererInstance?.isContextLost) {
      pixiRendererInstance.dispose();
      pixiRendererInstance = null;
    }

    if (!pixiRendererInstance) {
      const offscreen = document.createElement("canvas");
      pixiRendererInstance = new PixiRenderer(offscreen, sourceCanvas.width, sourceCanvas.height);

      if (!pixiRendererInstance.isWebGL2) {
        pixiRendererInstance.dispose();
        pixiRendererInstance = null;
        return null;
      }
    }

    const renderer = pixiRendererInstance;

    // Upload the geometry-transformed canvas as the source texture
    renderer.updateSource(sourceCanvas, sourceCanvas.width, sourceCanvas.height);

    // Resolve Master uniforms from EditingAdjustments
    const masterUniforms = resolveFromAdjustments(adjustments);

    // Resolve Film uniforms from FilmProfile (if provided)
    const resolvedProfile = filmProfile
      ? resolveProfile(adjustments, filmProfile)
      : resolveProfile(adjustments);
    const filmUniforms = resolveFilmUniforms(resolvedProfile, {
      grainSeed: options.renderSeed ?? Date.now(),
    });

    // Resolve Halation/Bloom uniforms from the scan module
    const halationBloomUniforms = resolveHalationBloomUniforms(resolvedProfile);

    // Render with all passes (Master + Film + Halation/Bloom)
    renderer.render(masterUniforms, filmUniforms, undefined, halationBloomUniforms);
    if (!isPixiOutputValid(sourceCanvas, renderer.canvas)) {
      console.warn("PixiJS render produced an invalid frame, falling back.");
      return null;
    }

    return renderer.canvas;
  } catch (e) {
    console.warn("PixiJS render failed, falling back to legacy renderer:", e);
    // Dispose the broken renderer so we don't try again
    if (pixiRendererInstance) {
      pixiRendererInstance.dispose();
      pixiRendererInstance = null;
    }
    return null;
  }
};

// Module-level PixiJS renderer singleton (created on first render)
let pixiRendererInstance: InstanceType<
  typeof import("@/lib/renderer/PixiRenderer").PixiRenderer
> | null = null;
const pixiFallbackSeedKeys = new Set<string>();
/** Periodically allow retrying PixiJS for previously-failed seed keys. */
const PIXI_FALLBACK_RETRY_MS = 30_000;
let _pixiFallbackClearTimer: ReturnType<typeof setTimeout> | null = null;

// Render mutex: serialize access to the singleton PixiJS renderer
let _renderMutexPromise: Promise<void> = Promise.resolve();
const acquireRenderMutex = (): Promise<() => void> => {
  let release: () => void;
  const prev = _renderMutexPromise;
  _renderMutexPromise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return prev.then(() => release!);
};

// Cache resolved dynamic imports so subsequent tryPixiRender calls skip await overhead
let _pixiModuleCache: {
  PixiRenderer: typeof import("@/lib/renderer/PixiRenderer").PixiRenderer;
  resolveFromAdjustments: typeof import("@/lib/renderer/uniformResolvers").resolveFromAdjustments;
  resolveFilmUniforms: typeof import("@/lib/renderer/uniformResolvers").resolveFilmUniforms;
  resolveHalationBloomUniforms: typeof import("@/lib/renderer/uniformResolvers").resolveHalationBloomUniforms;
} | null = null;

// Clean up GPU resources on page unload to prevent leaks
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (pixiRendererInstance) {
      pixiRendererInstance.dispose();
      pixiRendererInstance = null;
    }
    disposeWebGL2Renderer();
    if (_probeCanvas) {
      _probeCanvas.width = 0;
      _probeCanvas.height = 0;
      _probeCanvas = null;
      _probeContext = null;
    }
  });
}

// Clean up GPU resources on Vite HMR to prevent WebGL context leaks in development
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (pixiRendererInstance) {
      pixiRendererInstance.dispose();
      pixiRendererInstance = null;
    }
    _pixiModuleCache = null;
    disposeWebGL2Renderer();
    if (_probeCanvas) {
      _probeCanvas.width = 0;
      _probeCanvas.height = 0;
      _probeCanvas = null;
      _probeContext = null;
    }
  });
}

export const renderImageToCanvas = async ({
  canvas,
  source,
  adjustments,
  filmProfile,
  timestampText,
  preferWebGL2 = true,
  preferPixi = true,
  targetSize,
  maxDimension,
  seedKey,
  renderSeed,
  exportSeed,
  signal,
}: RenderImageOptions) => {
  const normalizedAdjustments = normalizeAdjustments(adjustments);
  const loaded = await loadImageSource(source, signal);
  if (signal?.aborted) {
    loaded.cleanup?.();
    return;
  }

  const orientedSource = createOrientedSource(loaded, normalizedAdjustments.rightAngleRotation);

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

  canvas.width = Math.max(1, Math.round(outputWidth));
  canvas.height = Math.max(1, Math.round(outputHeight));
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!context) {
    loaded.cleanup?.();
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";

  const transform = resolveTransform(normalizedAdjustments, canvas.width, canvas.height);
  context.save();
  context.translate(
    canvas.width / 2 + transform.translateX,
    canvas.height / 2 + transform.translateY
  );
  context.rotate(transform.rotate);
  context.scale(
    transform.scale * transform.flipHorizontal,
    transform.scale * transform.flipVertical
  );
  context.drawImage(
    orientedSource.source,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    -canvas.width / 2,
    -canvas.height / 2,
    canvas.width,
    canvas.height
  );
  context.restore();

  // -- Render pipeline: try PixiJS -> legacy WebGL2 -> CPU fallback --

  const renderOptions = {
    seedKey,
    renderSeed: renderSeed ?? (seedKey ? hashSeedKey(seedKey) : Date.now()),
    exportSeed,
  };

  // 1. Try PixiJS multi-pass pipeline (Master + Film) 鈥?default GPU path
  const canTryPixi =
    preferWebGL2 &&
    preferPixi &&
    !isLegacyRendererForced() &&
    !(seedKey && pixiFallbackSeedKeys.has(seedKey));

  let renderedWithPixi = false;
  if (canTryPixi) {
    const releaseMutex = await acquireRenderMutex();
    try {
      const pixiResult = await tryPixiRender(
        canvas,
        normalizedAdjustments,
        filmProfile,
        renderOptions
      );
      if (pixiResult) {
        if (seedKey) {
          pixiFallbackSeedKeys.delete(seedKey);
        }
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(pixiResult, 0, 0, canvas.width, canvas.height);
        renderedWithPixi = true;
      }
    } finally {
      releaseMutex();
    }
    if (!renderedWithPixi && seedKey) {
      pixiFallbackSeedKeys.add(seedKey);
      // Schedule a retry: clear the fallback set after a timeout so PixiJS gets another chance
      if (!_pixiFallbackClearTimer) {
        _pixiFallbackClearTimer = setTimeout(() => {
          pixiFallbackSeedKeys.clear();
          _pixiFallbackClearTimer = null;
        }, PIXI_FALLBACK_RETRY_MS);
      }
    }
  }

  if (!renderedWithPixi) {
    // 2. Legacy single-pass WebGL2 renderer (fallback)
    const resolvedProfile = resolveProfile(normalizedAdjustments, filmProfile);
    const renderedByWebGL =
      preferWebGL2 && renderFilmProfileWebGL2(canvas, resolvedProfile, renderOptions);

    if (renderedByWebGL) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(renderedByWebGL, 0, 0, canvas.width, canvas.height);
    } else {
      // 3. CPU fallback pipeline
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      applyFilmPipeline(imageData, resolvedProfile, renderOptions);
      context.putImageData(imageData, 0, 0);
    }

    // Keep color grading behavior consistent on legacy/CPU fallback paths.
    const fallbackImageData = context.getImageData(0, 0, canvas.width, canvas.height);
    applyColorGradingToImageData(fallbackImageData, normalizedAdjustments.colorGrading);
    context.putImageData(fallbackImageData, 0, 0);
  }

  applyTimestampOverlay(canvas, normalizedAdjustments, timestampText);

  orientedSource.cleanup?.();
  loaded.cleanup?.();
};

interface RenderBlobOptions {
  type?: string;
  quality?: number;
  maxDimension?: number;
  filmProfile?: FilmProfile;
  timestampText?: string | null;
  preferWebGL2?: boolean;
  seedKey?: string;
  exportSeed?: number;
}

export const renderImageToBlob = async (
  source: Blob | string,
  adjustments: EditingAdjustments,
  options?: RenderBlobOptions
) => {
  const canvas = document.createElement("canvas");
  await renderImageToCanvas({
    canvas,
    source,
    adjustments,
    filmProfile: options?.filmProfile,
    timestampText: options?.timestampText,
    preferWebGL2: options?.preferWebGL2,
    maxDimension: options?.maxDimension,
    seedKey: options?.seedKey,
    exportSeed: options?.exportSeed ?? Date.now(),
  });
  const outputType = options?.type ?? "image/jpeg";
  const quality = options?.quality ?? 0.92;
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, outputType, quality);
  });
  // Release canvas backing store after blob is created
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) {
    throw new Error("Failed to render image blob.");
  }
  return blob;
};
