import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import { runRendererSurfaceOperation } from "./gpuSurfaceOperation";

export interface ChannelDriftGpuInput {
  width: number;
  height: number;
  redOffsetX: number;
  redOffsetY: number;
  greenOffsetX: number;
  greenOffsetY: number;
  blueOffsetX: number;
  blueOffsetY: number;
  intensity: number;
}

export const applyChannelDriftOnGpuToSurface = async ({
  surface,
  input,
  slotId = "channel-drift",
}: {
  surface: RenderSurfaceHandle;
  input: ChannelDriftGpuInput;
  slotId?: string;
}): Promise<RenderSurfaceHandle | null> => {
  if (surface.width <= 0 || surface.height <= 0) {
    return null;
  }
  return runRendererSurfaceOperation({
    mode: surface.mode,
    width: surface.width,
    height: surface.height,
    slotId,
    render: (renderer) =>
      renderer.renderChannelDriftComposite({
        baseCanvas: surface.sourceCanvas,
        damage: input,
      }),
  });
};
