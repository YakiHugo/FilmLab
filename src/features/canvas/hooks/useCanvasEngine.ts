import { useMemo } from "react";
import type { Asset, CanvasImageElement } from "@/types";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { snapPoint } from "../grid";

const INITIAL_CANVAS_IMAGE_LONG_EDGE = 320;

const createElementId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `el-${Date.now()}`;
};

const isPositiveDimension = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const fitSizeWithinLongestEdge = (
  sourceSize: { width: number; height: number },
  longestEdge = INITIAL_CANVAS_IMAGE_LONG_EDGE
) => {
  const width = Math.max(1, sourceSize.width);
  const height = Math.max(1, sourceSize.height);
  const scale = Math.max(1, longestEdge) / Math.max(width, height);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const loadImageDimensionsFromObjectUrl = async (objectUrl?: string) => {
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

  if (!isPositiveDimension(width) || !isPositiveDimension(height)) {
    return null;
  }

  return { width, height };
};

const resolveAssetSourceSize = async (
  asset: Pick<Asset, "blob" | "metadata" | "objectUrl">
) => {
  const metadataWidth = asset.metadata?.width ?? 0;
  const metadataHeight = asset.metadata?.height ?? 0;
  if (isPositiveDimension(metadataWidth) && isPositiveDimension(metadataHeight)) {
    return { width: metadataWidth, height: metadataHeight };
  }

  if (asset.blob && typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(asset.blob, {
      imageOrientation: "from-image",
    }).catch(() => null);

    if (bitmap) {
      try {
        return {
          width: bitmap.width,
          height: bitmap.height,
        };
      } finally {
        bitmap.close();
      }
    }
  }

  return loadImageDimensionsFromObjectUrl(asset.objectUrl);
};

export const resolveCanvasImageInsertionSize = async (
  asset?: Pick<Asset, "blob" | "metadata" | "objectUrl">
) => {
  if (!asset) {
    return {
      width: INITIAL_CANVAS_IMAGE_LONG_EDGE,
      height: INITIAL_CANVAS_IMAGE_LONG_EDGE,
    };
  }

  const sourceSize = await resolveAssetSourceSize(asset);
  if (!sourceSize) {
    return {
      width: INITIAL_CANVAS_IMAGE_LONG_EDGE,
      height: INITIAL_CANVAS_IMAGE_LONG_EDGE,
    };
  }

  return fitSizeWithinLongestEdge(sourceSize);
};

export function useCanvasEngine() {
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const upsertElement = useCanvasStore((state) => state.upsertElement);
  const assets = useAssetStore((state) => state.assets);

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [documents, activeDocumentId]
  );

  const addAssetToCanvas = async (assetId: string) => {
    if (!activeDocument) {
      return;
    }
    const index = activeDocument.elements.length + 1;
    const asset = assets.find((candidate) => candidate.id === assetId);
    const initialSize = await resolveCanvasImageInsertionSize(asset);
    const initialPosition = snapPoint({
      x: 120 + index * 18,
      y: 100 + index * 18,
    });
    const element: CanvasImageElement = {
      id: createElementId(),
      type: "image",
      assetId,
      x: initialPosition.x,
      y: initialPosition.y,
      width: initialSize.width,
      height: initialSize.height,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      zIndex: index,
    };
    await upsertElement(activeDocument.id, element);
  };

  return {
    assets,
    activeDocument,
    addAssetToCanvas,
  };
}
