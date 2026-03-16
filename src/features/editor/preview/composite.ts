import type {
  CanvasCompositeLayerSurface,
  CanvasCompositeRegion,
} from "../composition";
import {
  compositeCanvasLayers,
  copyCanvas,
  ensureCanvasSize,
  resolveLayerBlendOperation,
} from "../composition";

export type PreviewCompositeRegion = CanvasCompositeRegion;
export type RetainedPreviewLayerSurface = CanvasCompositeLayerSurface;

export const ensurePreviewCanvasSize = ensureCanvasSize;

export const resolvePreviewLayerBlendOperation = resolveLayerBlendOperation;

export { resolveLayerBlendOperation };

export const copyPreviewCanvas = copyCanvas;

export const compositeRetainedPreviewLayers = ({
  targetCanvas,
  layerSurfaces,
  region,
}: {
  targetCanvas: HTMLCanvasElement;
  layerSurfaces: RetainedPreviewLayerSurface[];
  region?: PreviewCompositeRegion | null;
}) =>
  compositeCanvasLayers({
    targetCanvas,
    layerSurfaces,
    region,
  });
