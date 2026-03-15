import { applyMaskToLayerCanvas, generateMaskTexture } from "@/lib/layerMaskTexture";
import {
  ensureCanvasSize,
  resolveLayerBlendOperation,
  type CanvasCompositeRegion,
} from "./composition";
import type {
  CompositeBackend,
  CompositeBackendComposeOptions,
  CompositeLayerRequest,
} from "./compositeBackend";

const normalizeCompositeRegion = (region?: CanvasCompositeRegion | null) =>
  region && region.width > 0 && region.height > 0
    ? {
        x: Math.max(0, Math.round(region.x)),
        y: Math.max(0, Math.round(region.y)),
        width: Math.max(1, Math.round(region.width)),
        height: Math.max(1, Math.round(region.height)),
      }
    : null;

const resolveLayerDrawSource = (
  layer: CompositeLayerRequest,
  options: Pick<CompositeBackendComposeOptions, "targetSize" | "workspace">
): CanvasImageSource => {
  if (!layer.mask) {
    return layer.surface.canvas;
  }

  const generatedMask = generateMaskTexture(layer.mask.value, {
    width: options.targetSize.width,
    height: options.targetSize.height,
    referenceSource: layer.mask.referenceSource ?? layer.surface.canvas,
    targetCanvas: options.workspace.getLayerMaskCanvas(layer.layerId),
    scratchCanvas: options.workspace.getLayerMaskScratchCanvas(layer.layerId),
  });

  if (!generatedMask) {
    return layer.surface.canvas;
  }

  return applyMaskToLayerCanvas(
    layer.surface.canvas,
    generatedMask,
    options.workspace.getMaskedLayerCanvas(layer.layerId)
  );
};

export const canvas2dCompositeBackend: CompositeBackend = {
  id: "canvas2d",
  compose: ({
    targetCanvas,
    targetSize,
    region,
    layers,
    workspace,
  }: CompositeBackendComposeOptions) => {
    ensureCanvasSize(targetCanvas, targetSize.width, targetSize.height);
    const context = targetCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return false;
    }

    const drawRegion = normalizeCompositeRegion(region);
    if (drawRegion) {
      context.clearRect(drawRegion.x, drawRegion.y, drawRegion.width, drawRegion.height);
    } else {
      context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    }

    for (const layer of layers) {
      const drawSource = resolveLayerDrawSource(layer, {
        targetSize,
        workspace,
      });

      context.save();
      context.globalAlpha = layer.opacity;
      context.globalCompositeOperation = resolveLayerBlendOperation(layer.blendMode);
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
  },
};

export const defaultCompositeBackend = canvas2dCompositeBackend;
