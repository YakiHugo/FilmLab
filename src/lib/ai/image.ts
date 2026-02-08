import type { Asset } from "@/types";

interface LoadedImageSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup?: () => void;
}

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
      image.onerror = () => reject(new Error("Failed to load image."));
    });
  }
  return {
    source: image as CanvasImageSource,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    cleanup: () => URL.revokeObjectURL(objectUrl),
  };
};

const toBlobFromAsset = async (asset: Asset) => {
  if (asset.thumbnailBlob) {
    return asset.thumbnailBlob;
  }
  if (asset.blob) {
    return asset.blob;
  }
  const response = await fetch(asset.objectUrl);
  if (!response.ok) {
    throw new Error("Failed to resolve asset blob.");
  }
  return response.blob();
};

export const toRecommendationImageDataUrl = async (
  asset: Asset,
  maxDimension = 640,
  quality = 0.8
) => {
  const blob = await toBlobFromAsset(asset);
  const loaded = await loadImageSource(blob);
  const sourceWidth = Math.max(1, loaded.width);
  const sourceHeight = Math.max(1, loaded.height);
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    loaded.cleanup?.();
    throw new Error("Failed to create recommendation canvas.");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(loaded.source, 0, 0, targetWidth, targetHeight);
  loaded.cleanup?.();
  return canvas.toDataURL("image/jpeg", quality);
};
