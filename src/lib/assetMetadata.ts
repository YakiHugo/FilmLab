import * as exifr from "exifr";
import type { AssetMetadata } from "@/types";

const DEFAULT_THUMBNAIL_MAX = 480;
const DEFAULT_THUMBNAIL_QUALITY = 0.82;
const DEFAULT_THUMBNAIL_TYPE = "image/jpeg";

interface ThumbnailOptions {
  maxDimension?: number;
  quality?: number;
  type?: string;
}

interface ThumbnailResult {
  blob: Blob;
  width: number;
  height: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
}

interface LoadedImageSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup?: () => void;
}

const normalizeExifString = (value: unknown) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.replace(/\u0000/g, "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (value && typeof value === "object") {
    const numerator = (value as { numerator?: number }).numerator;
    const denominator = (value as { denominator?: number }).denominator;
    if (typeof numerator === "number" && typeof denominator === "number" && denominator !== 0) {
      return numerator / denominator;
    }
  }
  return undefined;
};

const formatShutterSpeed = (value: unknown) => {
  const exposure = toNumber(value);
  if (!exposure || exposure <= 0) {
    return undefined;
  }
  if (exposure >= 1) {
    const rounded = exposure >= 10 ? Math.round(exposure) : Math.round(exposure * 10) / 10;
    return `${rounded}s`;
  }
  const denominator = Math.round(1 / exposure);
  return `1/${denominator}s`;
};

const normalizeExifDate = (value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const normalized = value.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return undefined;
};

const loadImageSource = async (source: Blob): Promise<LoadedImageSource> => {
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
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
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
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    cleanup: () => URL.revokeObjectURL(objectUrl),
  };
};

export const createThumbnailBlob = async (
  source: Blob,
  options?: ThumbnailOptions
): Promise<ThumbnailResult> => {
  const { maxDimension, quality, type } = options ?? {};
  const loaded = await loadImageSource(source);
  const baseWidth = Math.max(1, loaded.width);
  const baseHeight = Math.max(1, loaded.height);
  const maxSize = maxDimension ?? DEFAULT_THUMBNAIL_MAX;
  const scale = Math.min(1, maxSize / Math.max(baseWidth, baseHeight));
  const targetWidth = Math.max(1, Math.round(baseWidth * scale));
  const targetHeight = Math.max(1, Math.round(baseHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    loaded.cleanup?.();
    canvas.width = 0;
    canvas.height = 0;
    throw new Error("Failed to create thumbnail canvas");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(loaded.source, 0, 0, targetWidth, targetHeight);
  loaded.cleanup?.();
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type ?? DEFAULT_THUMBNAIL_TYPE, quality ?? DEFAULT_THUMBNAIL_QUALITY);
  });
  // Release canvas backing store immediately after encoding
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) {
    throw new Error("Failed to create thumbnail blob");
  }
  return {
    blob,
    width: baseWidth,
    height: baseHeight,
    thumbnailWidth: targetWidth,
    thumbnailHeight: targetHeight,
  };
};

export const extractExifMetadata = async (source: Blob): Promise<Partial<AssetMetadata>> => {
  try {
    const data = await exifr.parse(source, {
      tiff: true,
      exif: true,
      gps: false,
      xmp: false,
      translateValues: false,
    });
    if (!data) {
      return {};
    }
    const make = normalizeExifString(data.Make);
    const model = normalizeExifString(data.Model);
    const lens = normalizeExifString(data.LensModel ?? data.Lens ?? data.LensSpecification);
    const focalLength = toNumber(data.FocalLength);
    const aperture = toNumber(data.FNumber ?? data.ApertureValue);
    const iso = toNumber(data.ISO ?? data.ISOSpeedRatings);
    const shutterSpeed = formatShutterSpeed(data.ExposureTime ?? data.ShutterSpeedValue);
    const capturedAt = normalizeExifDate(
      data.DateTimeOriginal ?? data.CreateDate ?? data.ModifyDate
    );
    const width = toNumber(data.ExifImageWidth ?? data.ImageWidth);
    const height = toNumber(data.ExifImageHeight ?? data.ImageHeight);
    return {
      cameraMake: make,
      cameraModel: model,
      lensModel: lens,
      focalLength,
      aperture,
      iso,
      shutterSpeed,
      capturedAt,
      width,
      height,
    };
  } catch {
    return {};
  }
};

export const prepareAssetPayload = async (source: Blob) => {
  const [thumbnailResult, exifData] = await Promise.all([
    createThumbnailBlob(source).catch(() => null),
    extractExifMetadata(source),
  ]);
  const width = thumbnailResult?.width ?? exifData.width;
  const height = thumbnailResult?.height ?? exifData.height;
  const metadata: AssetMetadata = {
    ...exifData,
    width,
    height,
  };
  return {
    metadata,
    thumbnailBlob: thumbnailResult?.blob,
  };
};

export const formatCameraLabel = (metadata?: AssetMetadata) => {
  if (!metadata) {
    return "未知机身";
  }
  const camera = [metadata.cameraMake, metadata.cameraModel].filter(Boolean).join(" ").trim();
  return camera.length > 0 ? camera : "未知机身";
};

export const formatExposureSummary = (metadata?: AssetMetadata) => {
  if (!metadata) {
    return "暂无 EXIF";
  }
  const parts: string[] = [];
  if (metadata.shutterSpeed) {
    parts.push(metadata.shutterSpeed);
  }
  if (typeof metadata.aperture === "number") {
    parts.push(`f/${metadata.aperture.toFixed(1)}`);
  }
  if (typeof metadata.iso === "number") {
    parts.push(`ISO ${metadata.iso}`);
  }
  if (typeof metadata.focalLength === "number") {
    parts.push(`${Math.round(metadata.focalLength)}mm`);
  }
  return parts.length > 0 ? parts.join(" · ") : "暂无 EXIF";
};

export const formatDimensions = (metadata?: AssetMetadata) => {
  if (!metadata?.width || !metadata?.height) {
    return "未知尺寸";
  }
  return `${metadata.width}×${metadata.height}`;
};

export const formatCaptureTime = (metadata?: AssetMetadata) => {
  if (!metadata?.capturedAt) {
    return "未知时间";
  }
  const date = new Date(metadata.capturedAt);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(date);
};
