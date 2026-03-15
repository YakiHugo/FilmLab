import { applyMaskToLayerCanvas, generateMaskTexture } from "@/lib/layerMaskTexture";
import {
  ensureCanvasSize,
  resolveLayerBlendOperation,
  type CanvasCompositeRegion,
} from "./composition";
import type { RenderGraph, RenderLayerNode } from "./renderGraph";

export interface RenderGraphCanvasWorkspace {
  getLayerCanvas: (layerId: string) => HTMLCanvasElement;
  getLayerMaskCanvas: (layerId: string) => HTMLCanvasElement;
  getLayerMaskScratchCanvas: (layerId: string) => HTMLCanvasElement;
  getMaskedLayerCanvas: (layerId: string) => HTMLCanvasElement;
}

interface ComposeRenderGraphToCanvasOptions {
  targetCanvas: HTMLCanvasElement;
  renderGraph: RenderGraph;
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

const resolveLayerDrawSource = ({
  node,
  layerCanvas,
  maskCanvas,
  scratchCanvas,
  maskedLayerCanvas,
  targetSize,
}: {
  node: RenderLayerNode;
  layerCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
  scratchCanvas: HTMLCanvasElement;
  maskedLayerCanvas: HTMLCanvasElement;
  targetSize: {
    width: number;
    height: number;
  };
}): CanvasImageSource => {
  if (!node.mask) {
    return layerCanvas;
  }

  const generatedMask = generateMaskTexture(node.mask, {
    width: targetSize.width,
    height: targetSize.height,
    referenceSource: layerCanvas,
    targetCanvas: maskCanvas,
    scratchCanvas,
  });

  if (!generatedMask) {
    return layerCanvas;
  }

  return applyMaskToLayerCanvas(layerCanvas, generatedMask, maskedLayerCanvas);
};

export const composeRenderGraphToCanvas = async ({
  targetCanvas,
  renderGraph,
  workspace,
  region,
  targetSize,
  renderLayerNode,
}: ComposeRenderGraphToCanvasOptions) => {
  ensureCanvasSize(targetCanvas, targetSize.width, targetSize.height);
  const context = targetCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return false;
  }
  const drawRegion =
    region && region.width > 0 && region.height > 0
      ? {
          x: Math.max(0, Math.round(region.x)),
          y: Math.max(0, Math.round(region.y)),
          width: Math.max(1, Math.round(region.width)),
          height: Math.max(1, Math.round(region.height)),
        }
      : null;
  if (drawRegion) {
    context.clearRect(drawRegion.x, drawRegion.y, drawRegion.width, drawRegion.height);
  } else {
    context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  }
  const layersBottomToTop = resolveRenderGraphLayerNodesBottomToTop(renderGraph);

  for (let layerIndex = 0; layerIndex < layersBottomToTop.length; layerIndex += 1) {
    const node = layersBottomToTop[layerIndex]!;
    const layerCanvas = workspace.getLayerCanvas(node.id);
    ensureCanvasSize(layerCanvas, targetSize.width, targetSize.height);
    await renderLayerNode(node, layerCanvas, layerIndex);

    const drawSource = resolveLayerDrawSource({
      node,
      layerCanvas,
      maskCanvas: workspace.getLayerMaskCanvas(node.id),
      scratchCanvas: workspace.getLayerMaskScratchCanvas(node.id),
      maskedLayerCanvas: workspace.getMaskedLayerCanvas(node.id),
      targetSize,
    });

    context.save();
    context.globalAlpha = node.opacity;
    context.globalCompositeOperation = resolveLayerBlendOperation(node.blendMode);
    if (drawRegion) {
      context.drawImage(
        drawSource,
        drawRegion.x,
        drawRegion.y,
        drawRegion.width,
        drawRegion.height,
        drawRegion.x,
        drawRegion.y,
        drawRegion.width,
        drawRegion.height
      );
    } else {
      context.drawImage(drawSource, 0, 0, targetCanvas.width, targetCanvas.height);
    }
    context.restore();
  }

  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  return true;
};
