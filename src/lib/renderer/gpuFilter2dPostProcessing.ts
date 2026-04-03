import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import type { Filter2dPostProcessingParams } from "@/lib/filter2dShared";
import {
  materializeSurfaceToCanvas,
  runRendererCanvasOperation,
  runRendererSurfaceOperation,
} from "./gpuSurfaceOperation";

export const applyFilter2dOnGpu = async ({
  canvas,
  params,
  slotId = "filter2d-postprocess",
}: {
  canvas: HTMLCanvasElement;
  params: Filter2dPostProcessingParams;
  slotId?: string;
}) => {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return false;
  }

  return runRendererCanvasOperation({
    mode: "preview",
    width: canvas.width,
    height: canvas.height,
    slotId,
    targetCanvas: canvas,
    render: (renderer) => renderer.applyFilter2dSource(canvas, canvas.width, canvas.height, params),
  });
};

export const applyFilter2dOnGpuToSurface = async ({
  surface,
  params,
  slotId = "filter2d-postprocess",
}: {
  surface: RenderSurfaceHandle;
  params: Filter2dPostProcessingParams;
  slotId?: string;
}) =>
  runRendererSurfaceOperation({
    mode: surface.mode,
    width: surface.width,
    height: surface.height,
    slotId,
    render: (renderer) =>
      renderer.applyFilter2dSource(surface.sourceCanvas, surface.width, surface.height, params),
  });

export const applyFilter2dOnGpuToCanvas = async ({
  surface,
  params,
  targetCanvas,
  slotId = "filter2d-postprocess",
}: {
  surface: RenderSurfaceHandle;
  params: Filter2dPostProcessingParams;
  targetCanvas: HTMLCanvasElement;
  slotId?: string;
}) => {
  const nextSurface = await applyFilter2dOnGpuToSurface({
    surface,
    params,
    slotId,
  });
  if (!nextSurface) {
    return false;
  }
  return materializeSurfaceToCanvas(nextSurface, targetCanvas);
};
