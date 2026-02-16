import {
  applyFilmPipeline,
  createFilmProfileFromAdjustments,
  ensureFilmProfile,
  renderFilmProfileWebGL2,
} from "@/lib/film";
import type { EditingAdjustments, FilmProfile } from "@/types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const parseAspectRatio = (
  value: EditingAdjustments["aspectRatio"],
  fallback?: number
) => {
  if (value === "original") {
    return fallback ?? 1;
  }
  const [w, h] = value.split(":").map(Number);
  if (!w || !h) {
    return fallback ?? 1;
  }
  return w / h;
};

const resolveTransform = (adjustments: EditingAdjustments, width: number, height: number) => {
  const scale = clamp(adjustments.scale / 100, 0.7, 1.3);
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

interface RenderTargetSize {
  width: number;
  height: number;
}

interface RenderImageOptions {
  canvas: HTMLCanvasElement;
  source: Blob | string;
  adjustments: EditingAdjustments;
  filmProfile?: FilmProfile;
  preferWebGL2?: boolean;
  targetSize?: RenderTargetSize;
  maxDimension?: number;
  seedKey?: string;
  renderSeed?: number;
  exportSeed?: number;
  signal?: AbortSignal;
}

const resolveProfile = (
  adjustments: EditingAdjustments,
  providedProfile?: FilmProfile
) => {
  if (providedProfile) {
    return ensureFilmProfile(providedProfile);
  }
  return createFilmProfileFromAdjustments(adjustments);
};

/**
 * Enable the new PixiJS multi-pass renderer (Master + Film pipeline).
 *
 * The PixiJS renderer is implemented in `src/lib/renderer/` and provides:
 * - OKLab + LMS color science (Master pass)
 * - 3D LUT via HaldCLUT (Film pass)
 * - Film grain and vignette
 *
 * Set to `true` to activate the new pipeline. When `false` (default),
 * the legacy WebGL2 single-pass renderer is used.
 *
 * Usage (from browser console for testing):
 *   (window as any).__FILMLAB_USE_PIXI = true;
 */
const isPixiRendererEnabled = (): boolean =>
  typeof window !== "undefined" &&
  (window as any).__FILMLAB_USE_PIXI === true;

/**
 * Lazy-load and invoke the PixiJS renderer.
 * Only loaded when explicitly enabled via the feature flag above.
 */
const tryPixiRender = async (
  sourceCanvas: HTMLCanvasElement,
  adjustments: EditingAdjustments,
  filmProfile: FilmProfile | undefined,
  options: { seedKey?: string; renderSeed?: number; exportSeed?: number }
): Promise<HTMLCanvasElement | null> => {
  if (!isPixiRendererEnabled()) return null;

  try {
    // Dynamic import to avoid loading PixiJS when not needed
    const { PixiRenderer } = await import("@/lib/renderer/PixiRenderer");
    const { resolveFromAdjustments, resolveFilmUniforms, resolveHalationBloomUniforms } = await import(
      "@/lib/renderer/uniformResolvers"
    );

    // Lazily create the renderer singleton
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
    renderer.updateSource(
      sourceCanvas,
      sourceCanvas.width,
      sourceCanvas.height
    );

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

// Module-level PixiJS renderer singleton (only created when feature-flagged on)
let pixiRendererInstance: InstanceType<
  typeof import("@/lib/renderer/PixiRenderer").PixiRenderer
> | null = null;

export const renderImageToCanvas = async ({
  canvas,
  source,
  adjustments,
  filmProfile,
  preferWebGL2 = true,
  targetSize,
  maxDimension,
  seedKey,
  renderSeed,
  exportSeed,
  signal,
}: RenderImageOptions) => {
  const loaded = await loadImageSource(source, signal);
  if (signal?.aborted) {
    loaded.cleanup?.();
    return;
  }

  const fallbackRatio = targetSize
    ? targetSize.width / Math.max(1, targetSize.height)
    : loaded.width / Math.max(1, loaded.height);
  const targetRatio = parseAspectRatio(adjustments.aspectRatio, fallbackRatio);
  const sourceRatio = loaded.width / Math.max(1, loaded.height);
  let cropWidth = loaded.width;
  let cropHeight = loaded.height;
  if (Math.abs(sourceRatio - targetRatio) > 0.001) {
    if (sourceRatio > targetRatio) {
      cropWidth = loaded.height * targetRatio;
    } else {
      cropHeight = loaded.width / targetRatio;
    }
  }
  const cropX = (loaded.width - cropWidth) / 2;
  const cropY = (loaded.height - cropHeight) / 2;

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

  const transform = resolveTransform(adjustments, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2 + transform.translateX, canvas.height / 2 + transform.translateY);
  context.rotate(transform.rotate);
  context.scale(
    transform.scale * transform.flipHorizontal,
    transform.scale * transform.flipVertical
  );
  context.drawImage(
    loaded.source,
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
    renderSeed: renderSeed ?? Date.now(),
    exportSeed,
  };

  // 1. Try PixiJS multi-pass pipeline (Master + Film) — feature-flagged
  if (preferWebGL2 && isPixiRendererEnabled()) {
    const pixiResult = await tryPixiRender(
      canvas,
      adjustments,
      filmProfile,
      renderOptions
    );
    if (pixiResult) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(pixiResult, 0, 0, canvas.width, canvas.height);
      loaded.cleanup?.();
      return;
    }
  }

  // 2. Legacy single-pass WebGL2 renderer (default path)
  const resolvedProfile = resolveProfile(adjustments, filmProfile);
  const renderedByWebGL =
    preferWebGL2 &&
    renderFilmProfileWebGL2(canvas, resolvedProfile, renderOptions);

  if (renderedByWebGL) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(renderedByWebGL, 0, 0, canvas.width, canvas.height);
  } else {
    // 3. CPU fallback pipeline
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    applyFilmPipeline(imageData, resolvedProfile, renderOptions);
    context.putImageData(imageData, 0, 0);
  }

  loaded.cleanup?.();
};

interface RenderBlobOptions {
  type?: string;
  quality?: number;
  maxDimension?: number;
  filmProfile?: FilmProfile;
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
  if (!blob) {
    throw new Error("Failed to render image blob.");
  }
  return blob;
};
