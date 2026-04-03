import {
  materializeSurfaceToCanvas,
  runRendererSurfaceOperation,
} from "./gpuSurfaceOperation";

export const blendMaskedCanvasesOnGpuToSurface = async ({
  baseCanvas,
  layerCanvas,
  maskCanvas,
  slotId = "masked-canvas-blend",
}: {
  baseCanvas: HTMLCanvasElement;
  layerCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
  slotId?: string;
}) => {
  if (
    baseCanvas.width <= 0 ||
    baseCanvas.height <= 0 ||
    baseCanvas.width !== layerCanvas.width ||
    baseCanvas.height !== layerCanvas.height ||
    baseCanvas.width !== maskCanvas.width ||
    baseCanvas.height !== maskCanvas.height
  ) {
    return null;
  }

  return runRendererSurfaceOperation({
    mode: "preview",
    width: baseCanvas.width,
    height: baseCanvas.height,
    slotId,
    render: (renderer) => {
      const baseLinear = renderer.captureLinearSource(
        baseCanvas,
        baseCanvas.width,
        baseCanvas.height,
        baseCanvas.width,
        baseCanvas.height,
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
          const blended = renderer.blendLinearWithMask(baseLinear, layerLinear, maskCanvas);
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

export const blendMaskedCanvasesOnGpu = async ({
  baseCanvas,
  layerCanvas,
  maskCanvas,
  targetCanvas,
  slotId = "masked-canvas-blend",
}: {
  baseCanvas: HTMLCanvasElement;
  layerCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
  targetCanvas: HTMLCanvasElement;
  slotId?: string;
}) => {
  const surface = await blendMaskedCanvasesOnGpuToSurface({
    baseCanvas,
    layerCanvas,
    maskCanvas,
    slotId,
  });

  if (!surface) {
    return false;
  }
  return materializeSurfaceToCanvas(surface, targetCanvas);
};
