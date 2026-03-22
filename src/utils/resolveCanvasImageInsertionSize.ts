import type { Asset } from "@/types";

export const DEFAULT_CANVAS_IMAGE_INSERTION_LONGEST_EDGE = 320;
export const DEFAULT_CANVAS_IMAGE_INSERTION_MINIMUM_SHORT_EDGE = 1;

interface CanvasImageSize {
  height: number;
  width: number;
}

interface CanvasImageSizeCandidates {
  bitmap?: Partial<CanvasImageSize> | null;
  metadata?: Partial<CanvasImageSize> | null;
  objectUrl?: Partial<CanvasImageSize> | null;
}

interface CanvasImageInsertionSizeOptions {
  longestEdge?: number;
  minimumShortEdge?: number;
}

const isPositiveDimension = (value?: number | null) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const toValidCanvasImageSize = (value?: Partial<CanvasImageSize> | null): CanvasImageSize | null => {
  const width = value?.width ?? null;
  const height = value?.height ?? null;
  if (!isPositiveDimension(width) || !isPositiveDimension(height)) {
    return null;
  }

  return {
    width,
    height,
  };
};

const createDefaultCanvasImageInsertionSize = (
  longestEdge = DEFAULT_CANVAS_IMAGE_INSERTION_LONGEST_EDGE
) => {
  const size = Math.max(1, longestEdge);
  return {
    width: size,
    height: size,
  };
};

export const fitCanvasImageSizeWithinLongestEdge = (
  sourceSize: CanvasImageSize,
  options?: CanvasImageInsertionSizeOptions
) => {
  const longestEdge = options?.longestEdge ?? DEFAULT_CANVAS_IMAGE_INSERTION_LONGEST_EDGE;
  const minimumShortEdge =
    options?.minimumShortEdge ?? DEFAULT_CANVAS_IMAGE_INSERTION_MINIMUM_SHORT_EDGE;
  const width = Math.max(1, sourceSize.width);
  const height = Math.max(1, sourceSize.height);
  const scale = Math.max(1, longestEdge) / Math.max(width, height);
  const fittedWidth = Math.max(1, Math.round(width * scale));
  const fittedHeight = Math.max(1, Math.round(height * scale));

  if (fittedWidth <= fittedHeight) {
    return {
      width: Math.max(fittedWidth, minimumShortEdge),
      height: fittedHeight,
    };
  }

  return {
    width: fittedWidth,
    height: Math.max(fittedHeight, minimumShortEdge),
  };
};

export const resolveCanvasImageInsertionSizeFromCandidates = (
  candidates: CanvasImageSizeCandidates,
  options?: CanvasImageInsertionSizeOptions
) => {
  const sourceSize =
    toValidCanvasImageSize(candidates.metadata) ??
    toValidCanvasImageSize(candidates.bitmap) ??
    toValidCanvasImageSize(candidates.objectUrl);

  if (!sourceSize) {
    return createDefaultCanvasImageInsertionSize(
      options?.longestEdge ?? DEFAULT_CANVAS_IMAGE_INSERTION_LONGEST_EDGE
    );
  }

  return fitCanvasImageSizeWithinLongestEdge(sourceSize, options);
};

const loadImageDimensionsFromObjectUrl = async (objectUrl?: string | null) => {
  if (!objectUrl || typeof Image === "undefined") {
    return null;
  }

  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;

  try {
    await image.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to decode image dimensions."));
    }).catch(() => null);
  }

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  image.src = "";

  return toValidCanvasImageSize({ width, height });
};

const loadImageDimensionsFromBitmap = async (blob?: Blob | null) => {
  if (!blob || typeof createImageBitmap !== "function") {
    return null;
  }

  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "from-image",
  }).catch(() => null);

  if (!bitmap) {
    return null;
  }

  try {
    return toValidCanvasImageSize({
      width: bitmap.width,
      height: bitmap.height,
    });
  } finally {
    bitmap.close();
  }
};

export const resolveCanvasImageInsertionSize = async (
  asset?: Pick<Asset, "blob" | "metadata" | "objectUrl"> | null,
  options?: CanvasImageInsertionSizeOptions
) => {
  if (!asset) {
    return createDefaultCanvasImageInsertionSize(
      options?.longestEdge ?? DEFAULT_CANVAS_IMAGE_INSERTION_LONGEST_EDGE
    );
  }

  const bitmapSize = await loadImageDimensionsFromBitmap(asset.blob);
  const objectUrlSize = bitmapSize ? null : await loadImageDimensionsFromObjectUrl(asset.objectUrl);

  return resolveCanvasImageInsertionSizeFromCandidates(
    {
      metadata: asset.metadata,
      bitmap: bitmapSize,
      objectUrl: objectUrlSize,
    },
    options
  );
};
