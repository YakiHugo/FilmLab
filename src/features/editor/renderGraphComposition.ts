import { ensureCanvasSize, type CanvasCompositeRegion } from "./composition";
import type {
  CompositeBackend,
  CanvasBackedCompositeLayerSurface,
  CompositeBackendWorkspace,
  CompositeLayerRequest,
} from "./compositeBackend";
import type { RenderGraph, RenderLayerNode } from "./renderGraph";

export interface RenderGraphLayerWorkspace extends CompositeBackendWorkspace {
  getLayerSurface: (layerId: string) => CanvasBackedCompositeLayerSurface;
}

interface ComposeRenderGraphToCanvasOptions {
  targetCanvas: HTMLCanvasElement;
  renderGraph: RenderGraph;
  backend: CompositeBackend;
  workspace: RenderGraphLayerWorkspace;
  region?: CanvasCompositeRegion | null;
  targetSize: {
    width: number;
    height: number;
  };
  renderLayerNode: (
    node: RenderLayerNode,
    surface: CanvasBackedCompositeLayerSurface,
    layerIndex: number
  ) => Promise<void>;
}

export const resolveRenderGraphLayerNodesBottomToTop = (renderGraph: RenderGraph) =>
  [...renderGraph.layers].reverse();

export const composeRenderGraphToCanvas = async ({
  targetCanvas,
  renderGraph,
  backend,
  workspace,
  region,
  targetSize,
  renderLayerNode,
}: ComposeRenderGraphToCanvasOptions) => {
  ensureCanvasSize(targetCanvas, targetSize.width, targetSize.height);
  const layersBottomToTop = resolveRenderGraphLayerNodesBottomToTop(renderGraph);
  const layerRequests: CompositeLayerRequest[] = [];

  for (let layerIndex = 0; layerIndex < layersBottomToTop.length; layerIndex += 1) {
    const node = layersBottomToTop[layerIndex]!;
    const layerSurface = workspace.getLayerSurface(node.id);
    ensureCanvasSize(layerSurface.renderTarget, targetSize.width, targetSize.height);
    layerSurface.width = layerSurface.renderTarget.width;
    layerSurface.height = layerSurface.renderTarget.height;
    await renderLayerNode(node, layerSurface, layerIndex);
    layerRequests.push({
      layerId: node.id,
      surface: layerSurface,
      opacity: node.opacity,
      blendMode: node.blendMode,
      mask: node.mask
        ? {
            value: node.mask,
            referenceSource: layerSurface.drawSource,
          }
        : undefined,
    });
  }

  return backend.compose({
    targetCanvas,
    targetSize,
    region,
    layers: layerRequests,
    workspace,
  });
};
