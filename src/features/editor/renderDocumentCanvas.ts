import { renderImageToCanvas } from "@/lib/imageProcessing";
import { applyMaskToLayerCanvas, generateMaskTexture } from "@/lib/layerMaskTexture";
import { applyTimestampOverlay } from "@/lib/timestampOverlay";
import type { Asset } from "@/types";
import type { RenderDocument } from "./document";
import type { RenderIntent } from "@/lib/renderIntent";
import { resolveLayerBlendOperation } from "./preview/composite";

interface RenderTargetSize {
  width: number;
  height: number;
}

interface RenderDocumentToCanvasOptions {
  canvas: HTMLCanvasElement;
  document: RenderDocument;
  intent: RenderIntent;
  targetSize?: RenderTargetSize;
  timestampText?: string | null;
  strictErrors?: boolean;
}

const resolveAssetRenderSource = (asset: Asset) => asset.blob ?? asset.objectUrl;

const resolveLayerFilmProfile = (document: RenderDocument, sourceAsset: Asset) =>
  sourceAsset.id === document.sourceAssetId
    ? document.filmProfile ?? undefined
    : sourceAsset.filmProfile ?? undefined;

export const renderDocumentToCanvas = async ({
  canvas,
  document: renderDocument,
  intent,
  targetSize,
  timestampText,
  strictErrors = intent === "export-full",
}: RenderDocumentToCanvasOptions) => {
  const source = resolveAssetRenderSource(renderDocument.sourceAsset);

  if (renderDocument.layerEntries.length <= 1) {
    await renderImageToCanvas({
      canvas,
      source,
      adjustments: renderDocument.adjustments,
      filmProfile: renderDocument.filmProfile ?? undefined,
      timestampText,
      targetSize,
      seedKey: renderDocument.sourceAssetId,
      sourceCacheKey: `${intent}:${renderDocument.sourceAssetId}:${renderDocument.sourceAsset.size}`,
      strictErrors,
      intent,
      renderSlot: `${intent}:${renderDocument.key}:base`,
    });
    return;
  }

  const compositeCanvas = globalThis.document.createElement("canvas");
  compositeCanvas.width = targetSize?.width ?? canvas.width;
  compositeCanvas.height = targetSize?.height ?? canvas.height;
  const compositeContext = compositeCanvas.getContext("2d", { willReadFrequently: true });
  if (!compositeContext) {
    compositeCanvas.width = 0;
    compositeCanvas.height = 0;
    throw new Error("Failed to initialize composite render context.");
  }
  compositeContext.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);

  const layerCanvas = globalThis.document.createElement("canvas");
  const layerMaskCanvas = globalThis.document.createElement("canvas");
  const layerMaskScratchCanvas = globalThis.document.createElement("canvas");
  const maskedLayerCanvas = globalThis.document.createElement("canvas");
  const sourceBlobCache = new Map<string, Blob | string>();
  const layersBottomToTop = [...renderDocument.layerEntries].reverse();

  try {
    for (let layerIndex = 0; layerIndex < layersBottomToTop.length; layerIndex += 1) {
      const entry = layersBottomToTop[layerIndex]!;
      let layerSource = sourceBlobCache.get(entry.sourceAsset.id);
      if (!layerSource) {
        layerSource = resolveAssetRenderSource(entry.sourceAsset);
        sourceBlobCache.set(entry.sourceAsset.id, layerSource);
      }

      await renderImageToCanvas({
        canvas: layerCanvas,
        source: layerSource,
        adjustments: entry.adjustments,
        filmProfile: resolveLayerFilmProfile(renderDocument, entry.sourceAsset),
        timestampText: null,
        targetSize: {
          width: compositeCanvas.width,
          height: compositeCanvas.height,
        },
        seedKey: `${renderDocument.sourceAssetId}:${entry.layer.id}`,
        sourceCacheKey: `${intent}:${entry.sourceAsset.id}:${entry.layer.id}:${entry.sourceAsset.size}`,
        strictErrors,
        intent,
        renderSlot: `${intent}:${renderDocument.key}:layer:${entry.layer.id}:${layerIndex}`,
      });

      let drawSource: CanvasImageSource = layerCanvas;
      if (entry.layer.mask) {
        const generatedMask = generateMaskTexture(entry.layer.mask, {
          width: compositeCanvas.width,
          height: compositeCanvas.height,
          referenceSource: layerCanvas,
          targetCanvas: layerMaskCanvas,
          scratchCanvas: layerMaskScratchCanvas,
        });
        if (generatedMask) {
          drawSource = applyMaskToLayerCanvas(layerCanvas, generatedMask, maskedLayerCanvas);
        }
      }

      compositeContext.save();
      compositeContext.globalAlpha = entry.opacity;
      compositeContext.globalCompositeOperation = resolveLayerBlendOperation(entry.blendMode);
      compositeContext.drawImage(drawSource, 0, 0, compositeCanvas.width, compositeCanvas.height);
      compositeContext.restore();
    }

    if (canvas.width !== compositeCanvas.width || canvas.height !== compositeCanvas.height) {
      canvas.width = compositeCanvas.width;
      canvas.height = compositeCanvas.height;
    }

    const renderContext = canvas.getContext("2d", { willReadFrequently: true });
    if (!renderContext) {
      throw new Error("Failed to initialize final render context.");
    }
    renderContext.clearRect(0, 0, canvas.width, canvas.height);
    renderContext.drawImage(compositeCanvas, 0, 0, canvas.width, canvas.height);
    applyTimestampOverlay(canvas, renderDocument.adjustments, timestampText);
  } finally {
    layerCanvas.width = 0;
    layerCanvas.height = 0;
    layerMaskCanvas.width = 0;
    layerMaskCanvas.height = 0;
    layerMaskScratchCanvas.width = 0;
    layerMaskScratchCanvas.height = 0;
    maskedLayerCanvas.width = 0;
    maskedLayerCanvas.height = 0;
    compositeCanvas.width = 0;
    compositeCanvas.height = 0;
  }
};
