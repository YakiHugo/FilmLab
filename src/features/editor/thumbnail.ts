import { normalizeAdjustments } from "@/lib/adjustments";
import { ensureAssetLayers } from "@/lib/editorLayers";
import { resolveAssetTimestampText } from "@/lib/timestamp";
import type { Asset } from "@/types";
import { createRenderDocument } from "./document";
import { renderDocumentToCanvas } from "./renderDocumentCanvas";

const THUMBNAIL_MAX_DIMENSION = 480;
const THUMBNAIL_TYPE = "image/jpeg";
const THUMBNAIL_QUALITY = 0.82;

const resolveThumbnailSourceSize = async (asset: Asset) => {
  const width = asset.metadata?.width ?? 0;
  const height = asset.metadata?.height ?? 0;
  if (width > 0 && height > 0) {
    return { width, height };
  }

  if (!asset.blob || typeof createImageBitmap !== "function") {
    return {
      width: Math.max(1, width || 1),
      height: Math.max(1, height || 1),
    };
  }

  const bitmap = await createImageBitmap(asset.blob, {
    imageOrientation: "from-image",
  });
  try {
    return {
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
};

const resolveThumbnailTargetSize = (sourceSize: { width: number; height: number }) => {
  const scale = Math.min(
    1,
    THUMBNAIL_MAX_DIMENSION / Math.max(sourceSize.width, sourceSize.height)
  );
  return {
    width: Math.max(1, Math.round(sourceSize.width * scale)),
    height: Math.max(1, Math.round(sourceSize.height * scale)),
  };
};

const canvasToBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode rendered thumbnail."));
          return;
        }
        resolve(blob);
      },
      THUMBNAIL_TYPE,
      THUMBNAIL_QUALITY
    );
  });

export const createRenderedThumbnailBlob = async (
  asset: Asset,
  assets: Asset[]
) => {
  if (!asset.blob) {
    return null;
  }

  const sourceSize = await resolveThumbnailSourceSize(asset);
  const targetSize = resolveThumbnailTargetSize(sourceSize);
  const renderCanvas = globalThis.document.createElement("canvas");

  try {
    const renderDocument = createRenderDocument({
      key: `thumb:${asset.id}`,
      assetById: new Map(assets.map((entry) => [entry.id, entry])),
      documentAsset: asset,
      layers: ensureAssetLayers(asset),
      adjustments: normalizeAdjustments(asset.adjustments),
      filmProfile: asset.filmProfile ?? undefined,
    });

    await renderDocumentToCanvas({
      canvas: renderCanvas,
      document: renderDocument,
      intent: "thumbnail",
      targetSize,
      timestampText: resolveAssetTimestampText(asset.metadata, asset.createdAt),
      strictErrors: true,
    });

    return await canvasToBlob(renderCanvas);
  } finally {
    renderCanvas.width = 0;
    renderCanvas.height = 0;
  }
};
