import { renderImageToCanvas } from "@/lib/imageProcessing";
import { applyTimestampOverlay } from "@/lib/timestampOverlay";
import type { Asset } from "@/types";
import type { RenderIntent } from "@/lib/renderIntent";
import { defaultCompositeBackend } from "./canvas2dCompositeBackend";
import {
  createCanvasBackedCompositeLayerSurface,
  type CanvasBackedCompositeLayerSurface,
} from "./compositeBackend";
import type { RenderDocument } from "./document";
import {
  composeRenderGraphToCanvas,
  type RenderGraphLayerWorkspace,
} from "./renderGraphComposition";
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

const getWorkspaceCanvas = (
  map: Map<string, HTMLCanvasElement>,
  layerId: string
) => {
  const existing = map.get(layerId);
  if (existing) {
    return existing;
  }

  const created = globalThis.document.createElement("canvas");
  map.set(layerId, created);
  return created;
};

const getWorkspaceLayerSurface = (
  map: Map<string, CanvasBackedCompositeLayerSurface>,
  layerId: string
) => {
  const existing = map.get(layerId);
  if (existing) {
    return existing;
  }

  const created = createCanvasBackedCompositeLayerSurface(
    globalThis.document.createElement("canvas")
  );
  map.set(layerId, created);
  return created;
};

const createTemporaryWorkspace = () => {
  const layerSurfaces = new Map<string, CanvasBackedCompositeLayerSurface>();
  const layerMaskCanvases = new Map<string, HTMLCanvasElement>();
  const layerMaskScratchCanvases = new Map<string, HTMLCanvasElement>();
  const maskedLayerCanvases = new Map<string, HTMLCanvasElement>();

  const workspace: RenderGraphLayerWorkspace = {
    getLayerSurface: (layerId) => getWorkspaceLayerSurface(layerSurfaces, layerId),
    getLayerMaskCanvas: (layerId) => getWorkspaceCanvas(layerMaskCanvases, layerId),
    getLayerMaskScratchCanvas: (layerId) =>
      getWorkspaceCanvas(layerMaskScratchCanvases, layerId),
    getMaskedLayerCanvas: (layerId) => getWorkspaceCanvas(maskedLayerCanvases, layerId),
  };

  const release = () => {
    for (const surface of layerSurfaces.values()) {
      surface.width = 0;
      surface.height = 0;
      surface.renderTarget.width = 0;
      surface.renderTarget.height = 0;
    }
    layerSurfaces.clear();

    const releaseCanvasMap = (map: Map<string, HTMLCanvasElement>) => {
      for (const canvas of map.values()) {
        canvas.width = 0;
        canvas.height = 0;
      }
      map.clear();
    };

    releaseCanvasMap(layerMaskCanvases);
    releaseCanvasMap(layerMaskScratchCanvases);
    releaseCanvasMap(maskedLayerCanvases);
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
      renderLayerNode: async (layerNode, layerSurface, layerIndex) => {
        let layerSource = sourceBlobCache.get(layerNode.sourceAssetId);
        if (!layerSource) {
          layerSource = resolveAssetRenderSource(layerNode.sourceAsset);
          sourceBlobCache.set(layerNode.sourceAssetId, layerSource);
        }

        await renderImageToCanvas({
          canvas: layerSurface.renderTarget,
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
