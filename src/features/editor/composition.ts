import type { EditorLayerBlendMode } from "@/types";

export interface CanvasCompositeRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasCompositeLayerSurface {
  drawSource: CanvasImageSource;
  opacity: number;
  blendMode: EditorLayerBlendMode;
}

export const ensureCanvasSize = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number
) => {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  if (canvas.width !== safeWidth) {
    canvas.width = safeWidth;
  }
  if (canvas.height !== safeHeight) {
    canvas.height = safeHeight;
  }
};

export const resolveLayerBlendOperation = (
  blendMode: EditorLayerBlendMode
): GlobalCompositeOperation => {
  if (blendMode === "multiply") {
    return "multiply";
  }
  if (blendMode === "screen") {
    return "screen";
  }
  if (blendMode === "overlay") {
    return "overlay";
  }
  if (blendMode === "softLight") {
    return "soft-light";
  }
  return "source-over";
};

export const copyCanvas = (
  targetCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement
) => {
  ensureCanvasSize(targetCanvas, sourceCanvas.width, sourceCanvas.height);
  const context = targetCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return false;
  }
  context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  context.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
  return true;
};

interface CompositeCanvasLayersOptions {
  targetCanvas: HTMLCanvasElement;
  layerSurfaces: CanvasCompositeLayerSurface[];
  region?: CanvasCompositeRegion | null;
}

export const compositeCanvasLayers = ({
  targetCanvas,
  layerSurfaces,
  region,
}: CompositeCanvasLayersOptions) => {
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

  for (const layerSurface of layerSurfaces) {
    context.save();
    context.globalAlpha = layerSurface.opacity;
    context.globalCompositeOperation = resolveLayerBlendOperation(
      layerSurface.blendMode
    );
    if (drawRegion) {
      context.drawImage(
        layerSurface.drawSource,
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
      context.drawImage(layerSurface.drawSource, 0, 0, targetCanvas.width, targetCanvas.height);
    }
    context.restore();
  }

  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  return true;
};
