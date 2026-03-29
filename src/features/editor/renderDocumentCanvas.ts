import { renderSingleImageToCanvas } from "@/render/image";
import { applyTimestampOverlay } from "@/lib/timestampOverlay";
import type { RenderIntent } from "@/lib/renderIntent";
import {
  defaultCompositeBackend,
  type Canvas2dCompositeBackendWorkspace,
} from "./canvas2dCompositeBackend";
import {
  createCanvasCompositeLayerSurface,
  type CompositeLayerSurface,
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
import {
  createEditorImageRenderRequest,
  createRenderDocumentImageRenderDocument,
  createRenderLayerImageRenderDocument,
} from "./imageRenderAdapter";

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
  signal?: AbortSignal;
  renderSlotPrefix?: string;
}

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
  map: Map<string, CompositeLayerSurface>,
  layerCanvases: Map<string, HTMLCanvasElement>,
  layerId: string
) => {
  const existing = map.get(layerId);
  if (existing) {
    return existing;
  }

  const created = createCanvasCompositeLayerSurface(
    getWorkspaceCanvas(layerCanvases, layerId)
  );
  map.set(layerId, created);
  return created;
};

const createTemporaryWorkspace = () => {
  const layerCanvases = new Map<string, HTMLCanvasElement>();
  const layerSurfaces = new Map<string, CompositeLayerSurface>();
  const layerMaskCanvases = new Map<string, HTMLCanvasElement>();
  const layerMaskScratchCanvases = new Map<string, HTMLCanvasElement>();
  const maskedLayerCanvases = new Map<string, HTMLCanvasElement>();

  const workspace: RenderGraphLayerWorkspace & Canvas2dCompositeBackendWorkspace = {
    getLayerSurface: (layerId) =>
      getWorkspaceLayerSurface(layerSurfaces, layerCanvases, layerId),
    getLayerRenderTarget: (layerId) => getWorkspaceCanvas(layerCanvases, layerId),
    getLayerMaskCanvas: (layerId) => getWorkspaceCanvas(layerMaskCanvases, layerId),
    getLayerMaskScratchCanvas: (layerId) =>
      getWorkspaceCanvas(layerMaskScratchCanvases, layerId),
    getMaskedLayerCanvas: (layerId) => getWorkspaceCanvas(maskedLayerCanvases, layerId),
  };

  const release = () => {
    for (const surface of layerSurfaces.values()) {
      surface.width = 0;
      surface.height = 0;
    }
    layerSurfaces.clear();

    const releaseCanvasMap = (map: Map<string, HTMLCanvasElement>) => {
      for (const canvas of map.values()) {
        canvas.width = 0;
        canvas.height = 0;
      }
      map.clear();
    };

    releaseCanvasMap(layerCanvases);
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
  signal,
  renderSlotPrefix,
}: RenderDocumentToCanvasOptions) => {
  const normalizedRenderSlotPrefix = renderSlotPrefix?.trim();
  const resolveRenderSlot = (suffix: string, fallback: string) =>
    normalizedRenderSlotPrefix ? `${normalizedRenderSlotPrefix}:${suffix}` : fallback;
  const normalizedTargetSize = {
    width: targetSize?.width ?? canvas.width,
    height: targetSize?.height ?? canvas.height,
  };
  const singleLayerNode = resolveSingleRenderableLayerEntry(renderDocument.renderGraph.layers);

  if (singleLayerNode && !requiresLayerComposite(singleLayerNode)) {
    await renderSingleImageToCanvas({
      canvas,
      document: createRenderLayerImageRenderDocument(renderDocument, singleLayerNode),
      request: createEditorImageRenderRequest({
        intent,
        targetSize: normalizedTargetSize,
        timestampText,
        strictErrors,
        signal,
        renderSlotId: resolveRenderSlot(
          `layer:${singleLayerNode.id}:single`,
          `${intent}:${renderDocument.key}:${renderDocument.renderGraph.key}:layer:${singleLayerNode.id}:single`
        ),
      }),
    });
    return;
  }

  if (renderDocument.renderGraph.layers.length === 0) {
    await renderSingleImageToCanvas({
      canvas,
      document: createRenderDocumentImageRenderDocument(renderDocument),
      request: createEditorImageRenderRequest({
        intent,
        targetSize: normalizedTargetSize,
        timestampText,
        strictErrors,
        signal,
        renderSlotId: resolveRenderSlot(
          "base",
          `${intent}:${renderDocument.key}:${renderDocument.renderGraph.key}:base`
        ),
      }),
    });
    return;
  }

  const { workspace, release } = createTemporaryWorkspace();

  try {
    const didCompose = await composeRenderGraphToCanvas({
      targetCanvas: canvas,
      renderGraph: renderDocument.renderGraph,
      backend: defaultCompositeBackend,
      workspace,
      targetSize: normalizedTargetSize,
      renderLayerNode: async (layerNode, layerCanvas, layerIndex) => {
        await renderSingleImageToCanvas({
          canvas: layerCanvas,
          document: createRenderLayerImageRenderDocument(renderDocument, layerNode),
          request: createEditorImageRenderRequest({
            intent,
            targetSize: normalizedTargetSize,
            timestampText: null,
            strictErrors,
            signal,
            renderSlotId: resolveRenderSlot(
              `layer:${layerNode.id}:${layerIndex}`,
              `${intent}:${renderDocument.key}:${renderDocument.renderGraph.key}:layer:${layerNode.id}:${layerIndex}`
            ),
          }),
        });
      },
    });

    if (!didCompose) {
      throw new Error("Failed to initialize composite render context.");
    }

    await applyTimestampOverlay(canvas, renderDocument.adjustments, timestampText);
  } finally {
    release();
  }
};
