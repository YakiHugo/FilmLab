import type { EditingAdjustments } from "@/types";

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

export const buildPreviewFilter = (adjustments: EditingAdjustments) => {
  const exposure = clamp(
    1 +
      adjustments.exposure / 100 +
      (adjustments.highlights + adjustments.whites) / 300 -
      (adjustments.shadows + adjustments.blacks) / 300,
    0.2,
    2.5
  );
  const contrast = clamp(
    1 + adjustments.contrast / 100 + adjustments.clarity / 200 + adjustments.dehaze / 250,
    0,
    2.5
  );
  const saturation = clamp(
    1 + (adjustments.saturation + adjustments.vibrance * 0.6) / 100,
    0,
    3
  );
  const hue = adjustments.temperature * 0.6 + adjustments.tint * 0.4;
  const sepia = clamp(Math.max(0, adjustments.temperature) / 200, 0, 0.35);
  const blur = adjustments.texture < 0 ? clamp(-adjustments.texture / 50, 0, 2) : 0;
  return `brightness(${exposure}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${hue}deg) sepia(${sepia}) blur(${blur}px)`;
};

const resolveTransform = (adjustments: EditingAdjustments, width: number, height: number) => {
  const scale = clamp(adjustments.scale / 100, 0.7, 1.3);
  const translateX = clamp(adjustments.horizontal / 5, -20, 20);
  const translateY = clamp(adjustments.vertical / 5, -20, 20);
  return {
    scale,
    rotate: (adjustments.rotate * Math.PI) / 180,
    translateX: (translateX / 100) * width,
    translateY: (translateY / 100) * height,
  };
};

const applyVignette = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  adjustments: EditingAdjustments
) => {
  const strength = adjustments.vignette / 100;
  const opacity = clamp(Math.abs(strength) * 0.65, 0, 0.65);
  if (opacity === 0) {
    return;
  }
  const color = strength >= 0 ? "0,0,0" : "255,255,255";
  const gradient = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.2,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75
  );
  gradient.addColorStop(0, `rgba(${color},0)`);
  gradient.addColorStop(0.45, `rgba(${color},0)`);
  gradient.addColorStop(1, `rgba(${color},${opacity})`);
  context.save();
  context.globalCompositeOperation = strength >= 0 ? "multiply" : "screen";
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.restore();
};

const applyGrain = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  adjustments: EditingAdjustments
) => {
  const intensity = clamp(adjustments.grain / 100, 0, 1);
  const roughness = clamp(adjustments.grainRoughness / 100, 0, 1);
  const opacity = intensity * (0.2 + roughness * 0.25);
  if (opacity <= 0) {
    return;
  }
  const size = Math.round(
    clamp(120 - adjustments.grainSize + roughness * 20, 20, 140)
  );
  const grainCanvas = document.createElement("canvas");
  grainCanvas.width = size;
  grainCanvas.height = size;
  const grainContext = grainCanvas.getContext("2d");
  if (!grainContext) {
    return;
  }
  const imageData = grainContext.createImageData(size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.floor(Math.random() * 255);
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
  grainContext.putImageData(imageData, 0, 0);
  const pattern = context.createPattern(grainCanvas, "repeat");
  if (!pattern) {
    return;
  }
  context.save();
  context.globalAlpha = opacity;
  context.globalCompositeOperation = "soft-light";
  context.fillStyle = pattern;
  context.fillRect(0, 0, width, height);
  context.restore();
};

const loadImageSource = async (source: Blob | string, signal?: AbortSignal) => {
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
  targetSize?: RenderTargetSize;
  maxDimension?: number;
  signal?: AbortSignal;
}

export const renderImageToCanvas = async ({
  canvas,
  source,
  adjustments,
  targetSize,
  maxDimension,
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
  const context = canvas.getContext("2d");
  if (!context) {
    loaded.cleanup?.();
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  context.filter = buildPreviewFilter(adjustments);

  const transform = resolveTransform(adjustments, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2 + transform.translateX, canvas.height / 2 + transform.translateY);
  context.rotate(transform.rotate);
  context.scale(transform.scale, transform.scale);
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
  context.filter = "none";

  applyVignette(context, canvas.width, canvas.height, adjustments);
  applyGrain(context, canvas.width, canvas.height, adjustments);

  loaded.cleanup?.();
};

interface RenderBlobOptions {
  type?: string;
  quality?: number;
  maxDimension?: number;
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
    maxDimension: options?.maxDimension,
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
