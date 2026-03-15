import { ensureCanvasSize, type CanvasCompositeRegion } from "./composition";
import type {
  CompositeBackend,
  CompositeBackendWorkspace,
  CompositeLayerRequest,
} from "./compositeBackend";
import type { RenderGraph, RenderLayerNode } from "./renderGraph";

export interface RenderGraphCanvasWorkspace extends CompositeBackendWorkspace {
  getLayerCanvas: (layerId: string) => HTMLCanvasElement;
}

interface ComposeRenderGraphToCanvasOptions {
  targetCanvas: HTMLCanvasElement;
  renderGraph: RenderGraph;
  backend: CompositeBackend;
  workspace: RenderGraphCanvasWorkspace;
  region?: CanvasCompositeRegion | null;
  targetSize: {
    width: number;
    height: number;
  };
  renderLayerNode: (
    node: RenderLayerNode,
    canvas: HTMLCanvasElement,
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
    const layerCanvas = workspace.getLayerCanvas(node.id);
    ensureCanvasSize(layerCanvas, targetSize.width, targetSize.height);
    await renderLayerNode(node, layerCanvas, layerIndex);
    layerRequests.push({
      layerId: node.id,
      surface: {
        canvas: layerCanvas,
        width: layerCanvas.width,
        height: layerCanvas.height,
      },
      opacity: node.opacity,
      blendMode: node.blendMode,
      mask: node.mask
        ? {
            value: node.mask,
            referenceSource: layerCanvas,
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
