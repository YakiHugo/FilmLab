import { ensureCanvasSize, type CanvasCompositeRegion } from "./composition";
import type {
  CompositeBackend,
  CompositeBackendWorkspace,
  CompositeLayerRequest,
  CompositeLayerSurface,
} from "./compositeBackend";
import type { RenderGraph, RenderLayerNode } from "./renderGraph";

export interface RenderGraphLayerWorkspace extends CompositeBackendWorkspace {
  getLayerSurface: (layerId: string) => CompositeLayerSurface;
  getLayerRenderTarget: (layerId: string) => HTMLCanvasElement;
}

interface ComposeRenderGraphToCanvasOptions<
  Workspace extends RenderGraphLayerWorkspace & CompositeBackendWorkspace,
> {
  targetCanvas: HTMLCanvasElement;
  renderGraph: RenderGraph;
  backend: CompositeBackend<any>;
  workspace: Workspace;
  region?: CanvasCompositeRegion | null;
  targetSize: {
    width: number;
    height: number;
  };
  renderLayerNode: (
    node: RenderLayerNode,
    renderTarget: HTMLCanvasElement,
    layerIndex: number
  ) => Promise<void>;
}

export const resolveRenderGraphLayerNodesBottomToTop = (renderGraph: RenderGraph) =>
  [...renderGraph.layers].reverse();

export const composeRenderGraphToCanvas = async <
  Workspace extends RenderGraphLayerWorkspace & CompositeBackendWorkspace,
>({
  targetCanvas,
  renderGraph,
  backend,
  workspace,
  region,
  targetSize,
  renderLayerNode,
}: ComposeRenderGraphToCanvasOptions<Workspace>) => {
  ensureCanvasSize(targetCanvas, targetSize.width, targetSize.height);
  const layersBottomToTop = resolveRenderGraphLayerNodesBottomToTop(renderGraph);
  const layerRequests: CompositeLayerRequest[] = [];

  for (let layerIndex = 0; layerIndex < layersBottomToTop.length; layerIndex += 1) {
    const node = layersBottomToTop[layerIndex]!;
    const renderTarget = workspace.getLayerRenderTarget(node.id);
    const layerSurface = workspace.getLayerSurface(node.id);
    ensureCanvasSize(renderTarget, targetSize.width, targetSize.height);
    await renderLayerNode(node, renderTarget, layerIndex);
    layerSurface.width = renderTarget.width;
    layerSurface.height = renderTarget.height;
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
