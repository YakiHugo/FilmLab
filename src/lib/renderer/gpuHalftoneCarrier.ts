import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import { runRendererSurfaceOperation } from "./gpuSurfaceOperation";

export interface HalftoneCarrierGpuInput {
  width: number;
  height: number;
  frequency: number;
  angle: number;
  shape: "circle" | "diamond" | "line" | "square";
  colorMode: "mono" | "cmyk" | "rgb";
  dotScale: number;
  contrast: number;
  invert: boolean;
  backgroundColorRgba: Float32Array;
  backgroundOpacity: number;
}

export const applyHalftoneCarrierOnGpuToSurface = async ({
  surface,
  input,
  slotId = "halftone-carrier",
}: {
  surface: RenderSurfaceHandle;
  input: HalftoneCarrierGpuInput;
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
      renderer.renderHalftoneCarrierComposite({
        baseCanvas: surface.sourceCanvas,
        carrier: input,
      }),
  });
};
