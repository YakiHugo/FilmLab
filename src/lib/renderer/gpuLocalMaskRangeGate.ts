import type { LocalAdjustmentMask } from "@/types";
import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import {
  materializeSurfaceToCanvas,
  runRendererSurfaceOperation,
} from "./gpuSurfaceOperation";

export const applyLocalMaskRangeOnGpuToSurface = async ({
  referenceSource,
  maskSource,
  width,
  height,
  mask,
  slotId = "local-mask-range",
}: {
  referenceSource: CanvasImageSource;
  maskSource: CanvasImageSource;
  width: number;
  height: number;
  mask: LocalAdjustmentMask;
  slotId?: string;
}): Promise<RenderSurfaceHandle | null> =>
  runRendererSurfaceOperation({
    mode: "preview",
    width,
    height,
    slotId,
    render: (renderer) =>
      renderer.applyLocalMaskRangeGateSource(
        referenceSource as TexImageSource,
        width,
        height,
        maskSource as TexImageSource,
        width,
        height,
        mask
      ),
  });

export const applyLocalMaskRangeOnGpu = async ({
  maskCanvas,
  referenceSource,
  mask,
  slotId = "local-mask-range",
}: {
  maskCanvas: HTMLCanvasElement;
  referenceSource: CanvasImageSource;
  mask: LocalAdjustmentMask;
  slotId?: string;
}) => {
  if (maskCanvas.width <= 0 || maskCanvas.height <= 0) {
    return false;
  }

  const surface = await applyLocalMaskRangeOnGpuToSurface({
    referenceSource,
    maskSource: maskCanvas,
    width: maskCanvas.width,
    height: maskCanvas.height,
    mask,
    slotId,
  });

  if (!surface) {
    return false;
  }
  return materializeSurfaceToCanvas(surface, maskCanvas);
};
