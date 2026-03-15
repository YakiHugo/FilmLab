import { renderImageToCanvas } from "@/lib/imageProcessing";
import { applyTimestampOverlay } from "@/lib/timestampOverlay";
import type { Asset } from "@/types";
import type { RenderIntent } from "@/lib/renderIntent";
import { defaultCompositeBackend } from "./canvas2dCompositeBackend";
import type { RenderDocument } from "./document";
import { composeRenderGraphToCanvas, type RenderGraphCanvasWorkspace } from "./renderGraphComposition";
import {
  requiresLayerComposite,
  resolveSingleRenderableLayerEntry,
} from "./rendering";

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

const createTemporaryWorkspace = () => {
  const layerCanvas = globalThis.document.createElement("canvas");
  const layerMaskCanvas = globalThis.document.createElement("canvas");
  const layerMaskScratchCanvas = globalThis.document.createElement("canvas");
  const maskedLayerCanvas = globalThis.document.createElement("canvas");

  const workspace: RenderGraphCanvasWorkspace = {
    getLayerCanvas: () => layerCanvas,
    getLayerMaskCanvas: () => layerMaskCanvas,
    getLayerMaskScratchCanvas: () => layerMaskScratchCanvas,
    getMaskedLayerCanvas: () => maskedLayerCanvas,
  };

  const release = () => {
    layerCanvas.width = 0;
    layerCanvas.height = 0;
    layerMaskCanvas.width = 0;
    layerMaskCanvas.height = 0;
    layerMaskScratchCanvas.width = 0;
    layerMaskScratchCanvas.height = 0;
    maskedLayerCanvas.width = 0;
    maskedLayerCanvas.height = 0;
  };

  return {
    workspace,
    release,
  };
};

export const renderDocumentToCanvas = async ({
  canvas,
  document: renderDocument,
  intent,
  targetSize,
  timestampText,
  strictErrors = intent === "export-full",
}: RenderDocumentToCanvasOptions) => {
  const source = resolveAssetRenderSource(renderDocument.sourceAsset);
  const singleLayerNode = resolveSingleRenderableLayerEntry(renderDocument.renderGraph.layers);

  if (singleLayerNode && !requiresLayerComposite(singleLayerNode)) {
    await renderImageToCanvas({
      canvas,
      source: resolveAssetRenderSource(singleLayerNode.sourceAsset),
      adjustments: singleLayerNode.adjustments,
      filmProfile: resolveLayerFilmProfile(renderDocument, singleLayerNode.sourceAsset),
      timestampText,
      targetSize,
      seedKey: `${renderDocument.renderGraph.key}:${singleLayerNode.id}`,
      sourceCacheKey: `${intent}:${renderDocument.renderGraph.key}:layer:${singleLayerNode.sourceAsset.id}:${singleLayerNode.id}:${singleLayerNode.sourceAsset.size}`,
      strictErrors,
      intent,
      renderSlot: `${intent}:${renderDocument.key}:${renderDocument.renderGraph.key}:layer:${singleLayerNode.id}:single`,
    });
    return;
  }

  if (renderDocument.renderGraph.layers.length === 0) {
    await renderImageToCanvas({
      canvas,
      source,
      adjustments: renderDocument.adjustments,
      filmProfile: renderDocument.filmProfile ?? undefined,
      timestampText,
      targetSize,
      seedKey: `${renderDocument.renderGraph.key}:base`,
      sourceCacheKey: `${intent}:${renderDocument.renderGraph.key}:${renderDocument.sourceAssetId}:${renderDocument.sourceAsset.size}`,
      strictErrors,
      intent,
      renderSlot: `${intent}:${renderDocument.key}:${renderDocument.renderGraph.key}:base`,
    });
    return;
  }

  const { workspace, release } = createTemporaryWorkspace();
  const sourceBlobCache = new Map<string, Blob | string>();

  try {
    const didCompose = await composeRenderGraphToCanvas({
      targetCanvas: canvas,
      renderGraph: renderDocument.renderGraph,
      backend: defaultCompositeBackend,
      workspace,
      targetSize: {
        width: targetSize?.width ?? canvas.width,
        height: targetSize?.height ?? canvas.height,
      },
      renderLayerNode: async (layerNode, layerCanvas, layerIndex) => {
        let layerSource = sourceBlobCache.get(layerNode.sourceAssetId);
        if (!layerSource) {
          layerSource = resolveAssetRenderSource(layerNode.sourceAsset);
          sourceBlobCache.set(layerNode.sourceAssetId, layerSource);
        }

        await renderImageToCanvas({
          canvas: layerCanvas,
          source: layerSource,
          adjustments: layerNode.adjustments,
          filmProfile: resolveLayerFilmProfile(renderDocument, layerNode.sourceAsset),
          timestampText: null,
          targetSize: {
            width: targetSize?.width ?? canvas.width,
            height: targetSize?.height ?? canvas.height,
          },
          seedKey: `${renderDocument.renderGraph.key}:${layerNode.id}`,
          sourceCacheKey: `${intent}:${renderDocument.renderGraph.key}:layer:${layerNode.sourceAsset.id}:${layerNode.id}:${layerNode.sourceAsset.size}`,
          strictErrors,
          intent,
          renderSlot: `${intent}:${renderDocument.key}:${renderDocument.renderGraph.key}:layer:${layerNode.id}:${layerIndex}`,
        });
      },
    });

    if (!didCompose) {
      throw new Error("Failed to initialize composite render context.");
    }

    applyTimestampOverlay(canvas, renderDocument.adjustments, timestampText);
  } finally {
    release();
  }
};
