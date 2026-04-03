import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import { blendCanvasLayerOnGpuToSurface } from "@/lib/renderer/gpuCanvasLayerBlend";
import {
  applyTimestampOverlay,
  applyTimestampOverlayToCanvasIfSupported,
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

const resolveOverlaySlotPrefix = (fallback: string, slotIdPrefix?: string) => {
  const normalized = slotIdPrefix?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
};

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

export const renderImageOverlaysToCanvases = async ({
  width,
  height,
  overlays,
}: {
  width: number;
  height: number;
  overlays: readonly ImageOverlayNode[];
}) => {
  const renderedCanvases: HTMLCanvasElement[] = [];

  for (const overlay of overlays) {
    const overlayCanvas = document.createElement("canvas");
    ensureCanvasSize(overlayCanvas, width, height);

    switch (overlay.type) {
      case "timestamp":
        await applyTimestampOverlay(overlayCanvas, overlay.adjustments, overlay.text);
        break;
    }

    renderedCanvases.push(overlayCanvas);
  }

  return renderedCanvases;
};

export const drawImageOverlayCanvasesToCanvas = ({
  canvas,
  overlayCanvases,
}: {
  canvas: HTMLCanvasElement;
  overlayCanvases: readonly HTMLCanvasElement[];
}) => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || typeof context.drawImage !== "function") {
    return false;
  }

  for (const overlayCanvas of overlayCanvases) {
    context.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height);
  }
  return true;
};

export const blendImageOverlayCanvasesToSurfaceIfSupported = async ({
  surface,
  overlayCanvases,
  slotIdPrefix,
}: {
  surface: RenderSurfaceHandle;
  overlayCanvases: readonly HTMLCanvasElement[];
  slotIdPrefix?: string;
}) => {
  let currentSurface = surface;
  const resolvedSlotPrefix = resolveOverlaySlotPrefix(surface.slotId, slotIdPrefix);

  for (let index = 0; index < overlayCanvases.length; index += 1) {
    const overlayCanvas = overlayCanvases[index];
    if (!overlayCanvas) {
      continue;
    }
    const nextSurface = await blendCanvasLayerOnGpuToSurface({
      surface: currentSurface,
      layerCanvas: overlayCanvas,
      slotId: `${resolvedSlotPrefix}:image-overlay:${index}`,
    });
    if (!nextSurface) {
      return null;
    }
    currentSurface = nextSurface;
  }

  return currentSurface;
};

export const applyImageOverlaysToSurfaceIfSupported = async ({
  surface,
  overlays,
  slotIdPrefix,
}: {
  surface: RenderSurfaceHandle;
  overlays: readonly ImageOverlayNode[];
  slotIdPrefix?: string;
}) => {
  let currentSurface = surface;
  const resolvedSlotPrefix = resolveOverlaySlotPrefix(surface.slotId, slotIdPrefix);

  for (let index = 0; index < overlays.length; index += 1) {
    const overlay = overlays[index];
    if (!overlay) {
      continue;
    }

    switch (overlay.type) {
      case "timestamp": {
        const nextSurface = await applyTimestampOverlayToSurfaceIfSupported({
          surface: currentSurface,
          adjustments: overlay.adjustments,
          timestampText: overlay.text,
          slotId: `${resolvedSlotPrefix}:image-overlay:timestamp:${index}`,
        });
        if (nextSurface) {
          currentSurface = nextSurface;
          continue;
        }
        break;
      }
      default:
        break;
    }

    const fallbackCanvases = await renderImageOverlaysToCanvases({
      width: currentSurface.width,
      height: currentSurface.height,
      overlays: overlays.slice(index),
    });
    try {
      return blendImageOverlayCanvasesToSurfaceIfSupported({
        surface: currentSurface,
        overlayCanvases: fallbackCanvases,
        slotIdPrefix: resolvedSlotPrefix,
      });
    } finally {
      cleanupImageOverlayCanvases(fallbackCanvases);
    }
  }

  return currentSurface;
};

export const cleanupImageOverlayCanvases = (overlayCanvases: readonly HTMLCanvasElement[]) => {
  for (const overlayCanvas of overlayCanvases) {
    overlayCanvas.width = 0;
    overlayCanvas.height = 0;
  }
};

export const applyImageOverlaysToCanvasIfSupported = async ({
  canvas,
  overlays,
  slotIdPrefix,
}: {
  canvas: HTMLCanvasElement;
  overlays: readonly ImageOverlayNode[];
  slotIdPrefix?: string;
}) => {
  const resolvedSlotPrefix = resolveOverlaySlotPrefix("image-overlay-canvas", slotIdPrefix);

  for (let index = 0; index < overlays.length; index += 1) {
    const overlay = overlays[index];
    if (!overlay) {
      continue;
    }

    switch (overlay.type) {
      case "timestamp": {
        const applied = await applyTimestampOverlayToCanvasIfSupported({
          canvas,
          adjustments: overlay.adjustments,
          timestampText: overlay.text,
          slotId: `${resolvedSlotPrefix}:image-overlay:timestamp:${index}`,
        });
        if (applied) {
          continue;
        }
        break;
      }
      default:
        break;
    }

    const fallbackCanvases = await renderImageOverlaysToCanvases({
      width: canvas.width,
      height: canvas.height,
      overlays: overlays.slice(index),
    });
    try {
      return drawImageOverlayCanvasesToCanvas({
        canvas,
        overlayCanvases: fallbackCanvases,
      });
    } finally {
      cleanupImageOverlayCanvases(fallbackCanvases);
    }
  }

  return true;
};

export const applyImageOverlays = async ({
  canvas,
  overlays,
  slotIdPrefix,
}: {
  canvas: HTMLCanvasElement;
  overlays: readonly ImageOverlayNode[];
  slotIdPrefix?: string;
}) => {
  await applyImageOverlaysToCanvasIfSupported({
    canvas,
    overlays,
    slotIdPrefix,
  });
};
