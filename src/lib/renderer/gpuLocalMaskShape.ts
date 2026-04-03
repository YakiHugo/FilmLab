import type { LocalAdjustmentMask } from "@/types";
import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import {
  materializeSurfaceToCanvas,
  runRendererSurfaceOperation,
} from "./gpuSurfaceOperation";

export const renderLocalMaskShapeOnGpuToSurface = async ({
  width,
  height,
  mask,
  slotId = "local-mask-shape",
  fullWidth,
  fullHeight,
  offsetX,
  offsetY,
}: {
  width: number;
  height: number;
  mask: LocalAdjustmentMask;
  slotId?: string;
  fullWidth?: number;
  fullHeight?: number;
  offsetX?: number;
  offsetY?: number;
}): Promise<RenderSurfaceHandle | null> =>
  runRendererSurfaceOperation({
    mode: "preview",
    width,
    height,
    slotId,
    render: (renderer) =>
      renderer.renderLocalMaskShape(mask, width, height, {
        fullWidth,
        fullHeight,
        offsetX,
        offsetY,
      }),
  });

export const renderLocalMaskShapeOnGpu = async ({
  maskCanvas,
  mask,
  slotId = "local-mask-shape",
  fullWidth,
  fullHeight,
  offsetX,
  offsetY,
}: {
  maskCanvas: HTMLCanvasElement;
  mask: LocalAdjustmentMask;
  slotId?: string;
  fullWidth?: number;
  fullHeight?: number;
  offsetX?: number;
  offsetY?: number;
}) => {
  if (maskCanvas.width <= 0 || maskCanvas.height <= 0) {
    return false;
  }

  const surface = await renderLocalMaskShapeOnGpuToSurface({
    width: maskCanvas.width,
    height: maskCanvas.height,
    mask,
    slotId,
    fullWidth,
    fullHeight,
    offsetX,
    offsetY,
  });

  if (!surface) {
    return false;
  }
  return materializeSurfaceToCanvas(surface, maskCanvas);
};
