import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import type { TimestampOverlayGpuInput } from "@/lib/timestampOverlay";
import { runRendererCanvasOperation, runRendererSurfaceOperation } from "./gpuSurfaceOperation";

export const applyTimestampOverlayOnGpuToSurface = async ({
  surface,
  overlay,
  slotId = "timestamp-overlay",
}: {
  surface: RenderSurfaceHandle;
  overlay: TimestampOverlayGpuInput;
  slotId?: string;
}) => {
  if (
    surface.width <= 0 ||
    surface.height <= 0 ||
    surface.width !== overlay.width ||
    surface.height !== overlay.height
  ) {
    return null;
  }

  return runRendererSurfaceOperation({
    mode: surface.mode,
    width: surface.width,
    height: surface.height,
    slotId,
    render: (renderer) =>
      renderer.renderTimestampOverlayComposite({
        baseCanvas: surface.sourceCanvas,
        overlay,
      }),
  });
};

export const applyTimestampOverlayOnGpu = async ({
  targetCanvas,
  overlay,
  slotId = "timestamp-overlay",
}: {
  targetCanvas: HTMLCanvasElement;
  overlay: TimestampOverlayGpuInput;
  slotId?: string;
}) => {
  if (
    targetCanvas.width <= 0 ||
    targetCanvas.height <= 0 ||
    targetCanvas.width !== overlay.width ||
    targetCanvas.height !== overlay.height
  ) {
    return false;
  }

  return runRendererCanvasOperation({
    targetCanvas,
    width: targetCanvas.width,
    height: targetCanvas.height,
    slotId,
    render: (renderer) =>
      renderer.renderTimestampOverlayComposite({
        baseCanvas: targetCanvas,
        overlay,
      }),
  });
};
