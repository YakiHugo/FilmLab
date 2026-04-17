import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import type { Filter2dPostProcessingParams } from "@/lib/filter2dShared";
import { runRendererSurfaceOperation } from "./gpuSurfaceOperation";

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
