import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import type { EditorLayerBlendMode } from "@/types";
import {
  materializeSurfaceToCanvas,
  runRendererSurfaceOperation,
} from "./gpuSurfaceOperation";

export const blendCanvasLayerOnGpuToSurface = async ({
  surface,
  layerCanvas,
  slotId = "canvas-layer-blend",
  blendMode = "normal",
  opacity = 1,
}: {
  surface: RenderSurfaceHandle;
  layerCanvas: HTMLCanvasElement;
  slotId?: string;
  blendMode?: EditorLayerBlendMode;
  opacity?: number;
}) => {
  if (
    surface.width <= 0 ||
    surface.height <= 0 ||
    layerCanvas.width <= 0 ||
    layerCanvas.height <= 0 ||
    surface.width !== layerCanvas.width ||
    surface.height !== layerCanvas.height
  ) {
    return null;
  }

  return runRendererSurfaceOperation({
    mode: surface.mode,
    width: surface.width,
    height: surface.height,
    slotId,
    render: (renderer) => {
      const baseLinear = renderer.captureLinearSource(
        surface.sourceCanvas,
        surface.width,
        surface.height,
        surface.width,
        surface.height,
        {
          decodeSrgb: false,
        }
      );

      try {
        const layerLinear = renderer.captureLinearSource(
          layerCanvas,
          layerCanvas.width,
          layerCanvas.height,
          layerCanvas.width,
          layerCanvas.height,
          {
            decodeSrgb: false,
          }
        );

        try {
          const blended = renderer.blendLinearLayers(baseLinear, layerLinear, {
            blendMode,
            opacity,
          });
          try {
            renderer.presentTextureResult(blended, {
              inputLinear: false,
              enableDither: false,
            });
          } finally {
            blended.release();
          }
        } finally {
          layerLinear.release();
        }
      } finally {
        baseLinear.release();
      }

      return true;
    },
  });
};

export const blendCanvasLayerOnGpu = async ({
  targetCanvas,
  ...options
}: {
  surface: RenderSurfaceHandle;
  layerCanvas: HTMLCanvasElement;
  targetCanvas: HTMLCanvasElement;
  slotId?: string;
  blendMode?: EditorLayerBlendMode;
  opacity?: number;
}) => {
  const surface = await blendCanvasLayerOnGpuToSurface(options);
  if (!surface) {
    return false;
  }
  return materializeSurfaceToCanvas(surface, targetCanvas);
};
