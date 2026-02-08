import {
  applyFilmPipeline,
  createFilmProfileFromAdjustments,
  ensureFilmProfile,
  renderFilmProfileWebGL2,
} from "@/lib/film";
import { featureFlags } from "@/lib/features";
import { resolveLutAsset } from "@/lib/lut";
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
  renderer?: "auto" | "webgl2" | "cpu";
  targetSize?: RenderTargetSize;
  maxDimension?: number;
  seedKey?: string;
  seedSalt?: number;
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

export const renderImageToCanvas = async ({
  canvas,
  source,
  adjustments,
  filmProfile,
  renderer = "auto",
  targetSize,
  maxDimension,
  seedKey,
  seedSalt,
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

  const resolvedProfile = resolveProfile(adjustments, filmProfile);
  const colorModule = resolvedProfile.modules.find((module) => module.id === "colorScience");
  const lutAsset = featureFlags.enableCubeLut
    ? await resolveLutAsset(colorModule?.params.lutAssetId)
    : null;
  const effectiveRenderSeed = renderSeed ?? Date.now();
  const allowWebGL = renderer !== "cpu";
  const renderedByWebGL =
    allowWebGL &&
    renderFilmProfileWebGL2(canvas, resolvedProfile, {
      seedKey,
      seedSalt,
      renderSeed: effectiveRenderSeed,
      exportSeed,
      lutAsset,
    });

  if (renderer === "webgl2" && !renderedByWebGL) {
    loaded.cleanup?.();
    throw new Error("WebGL2 renderer is unavailable.");
  }

  if (renderedByWebGL) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(renderedByWebGL, 0, 0, canvas.width, canvas.height);
  } else {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    applyFilmPipeline(imageData, resolvedProfile, {
      seedKey,
      seedSalt,
      renderSeed: effectiveRenderSeed,
      exportSeed,
      lutAsset,
    });
    context.putImageData(imageData, 0, 0);
  }

  loaded.cleanup?.();
};

interface RenderBlobOptions {
  type?: string;
  quality?: number;
  maxDimension?: number;
  filmProfile?: FilmProfile;
  renderer?: "auto" | "webgl2" | "cpu";
  seedKey?: string;
  seedSalt?: number;
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
    renderer: options?.renderer,
    maxDimension: options?.maxDimension,
    seedKey: options?.seedKey,
    seedSalt: options?.seedSalt,
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
