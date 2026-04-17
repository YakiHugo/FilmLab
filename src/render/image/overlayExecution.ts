import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import { blendCanvasLayerOnGpuToSurface } from "@/lib/renderer/gpuCanvasLayerBlend";
import {
  applyTimestampOverlay,
  applyTimestampOverlayToSurfaceIfSupported,
  type TimestampOverlayAdjustments,
} from "@/lib/timestampOverlay";
import type { ImageRenderOutputState } from "./types";

interface TimestampImageOverlay {
  type: "timestamp";
  adjustments: TimestampOverlayAdjustments;
  text?: string | null;
}

export type ImageOverlayNode = TimestampImageOverlay;

const ensureCanvasSize = (canvas: HTMLCanvasElement, width: number, height: number) => {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  if (canvas.width !== safeWidth) {
    canvas.width = safeWidth;
  }
  if (canvas.height !== safeHeight) {
    canvas.height = safeHeight;
  }
};

const createTimestampAdjustmentsFromOutput = (
  output: ImageRenderOutputState
): TimestampOverlayAdjustments => ({
  timestampEnabled: output.timestamp.enabled,
  timestampOpacity: output.timestamp.opacity,
  timestampPosition: output.timestamp.position,
  timestampSize: output.timestamp.size,
});

export const resolveImageOverlays = ({
  output,
  timestampText,
}: {
  output: ImageRenderOutputState;
  timestampText?: string | null;
}): ImageOverlayNode[] =>
  output.timestamp.enabled
    ? [
        {
          type: "timestamp",
          adjustments: createTimestampAdjustmentsFromOutput(output),
          text: timestampText,
        },
      ]
    : [];

const renderOverlayToCanvas = async (
  overlay: ImageOverlayNode,
  width: number,
  height: number
): Promise<HTMLCanvasElement> => {
  const overlayCanvas = document.createElement("canvas");
  ensureCanvasSize(overlayCanvas, width, height);
  switch (overlay.type) {
    case "timestamp":
      await applyTimestampOverlay(overlayCanvas, overlay.adjustments, overlay.text);
      break;
  }
  return overlayCanvas;
};

export const applyImageOverlays = async ({
  surface,
  overlays,
}: {
  surface: RenderSurfaceHandle;
  overlays: readonly ImageOverlayNode[];
}): Promise<RenderSurfaceHandle> => {
  let currentSurface = surface;

  for (let index = 0; index < overlays.length; index += 1) {
    const overlay = overlays[index];
    if (!overlay) {
      continue;
    }

    if (overlay.type === "timestamp") {
      const nextSurface = await applyTimestampOverlayToSurfaceIfSupported({
        surface: currentSurface,
        adjustments: overlay.adjustments,
        timestampText: overlay.text,
        slotId: `${currentSurface.slotId}:image-overlay:timestamp:${index}`,
      });
      if (nextSurface) {
        currentSurface = nextSurface;
        continue;
      }
    }

    // GPU-direct rasterization unavailable — bake the overlay to a Canvas2D
    // layer and composite it back onto the surface via a GPU blend. The CPU
    // island stays bounded inside this stage: input is a Surface, output is a
    // Surface.
    const overlayCanvas = await renderOverlayToCanvas(
      overlay,
      currentSurface.width,
      currentSurface.height
    );
    try {
      const blendedSurface = await blendCanvasLayerOnGpuToSurface({
        surface: currentSurface,
        layerCanvas: overlayCanvas,
        slotId: `${currentSurface.slotId}:image-overlay:${index}`,
      });
      if (!blendedSurface) {
        throw new Error(`Overlay blend failed for overlay ${index}`);
      }
      currentSurface = blendedSurface;
    } finally {
      overlayCanvas.width = 0;
      overlayCanvas.height = 0;
    }
  }

  return currentSurface;
};
