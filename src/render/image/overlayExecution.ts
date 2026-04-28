import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import { applyNormalLayerBlendOnSurface } from "@/lib/gpu/passes/overlay/normalLayerBlend";
import {
  renderCaptionOverlayRaster,
  type CaptionOverlayRenderParams,
} from "@/lib/captionOverlay";
import {
  applyTimestampOverlay,
  applyTimestampOverlayToSurfaceIfSupported,
  type TimestampOverlayAdjustments,
} from "@/lib/timestampOverlay";
import {
  renderWatermarkOverlayRaster,
  type WatermarkOverlayRenderParams,
} from "@/lib/watermarkOverlay";
import type {
  CaptionSemanticOverlayNode,
  SemanticOverlayNode,
  TimestampSemanticOverlayNode,
  WatermarkSemanticOverlayNode,
} from "./types";

interface TimestampImageOverlay {
  type: "timestamp";
  adjustments: TimestampOverlayAdjustments;
  text?: string | null;
}

interface CaptionImageOverlay {
  type: "caption";
  params: CaptionOverlayRenderParams;
}

interface WatermarkImageOverlay {
  type: "watermark";
  params: WatermarkOverlayRenderParams;
}

export type ImageOverlayNode = TimestampImageOverlay | CaptionImageOverlay | WatermarkImageOverlay;

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

const createTimestampAdjustmentsFromOverlayNode = (
  node: TimestampSemanticOverlayNode
): TimestampOverlayAdjustments => ({
  timestampEnabled: node.enabled,
  timestampOpacity: node.params.opacity,
  timestampPosition: node.params.position,
  timestampSize: node.params.size,
});

const createCaptionRenderParams = (
  node: CaptionSemanticOverlayNode
): CaptionOverlayRenderParams => ({ ...node.params });

const createWatermarkRenderParams = (
  node: WatermarkSemanticOverlayNode
): WatermarkOverlayRenderParams => ({ ...node.params });

export const resolveImageOverlays = ({
  semanticOverlays,
  timestampText,
}: {
  semanticOverlays: readonly SemanticOverlayNode[];
  timestampText?: string | null;
}): ImageOverlayNode[] => {
  const overlays: ImageOverlayNode[] = [];
  for (const node of semanticOverlays) {
    if (!node.enabled) {
      continue;
    }
    switch (node.type) {
      case "timestamp":
        overlays.push({
          type: "timestamp",
          adjustments: createTimestampAdjustmentsFromOverlayNode(node),
          text: timestampText,
        });
        break;
      case "caption":
        overlays.push({
          type: "caption",
          params: createCaptionRenderParams(node),
        });
        break;
      case "watermark":
        overlays.push({
          type: "watermark",
          params: createWatermarkRenderParams(node),
        });
        break;
    }
  }
  return overlays;
};

const drawRasterToCanvas = (
  target: HTMLCanvasElement,
  raster: HTMLCanvasElement | null
) => {
  if (!raster) return;
  const ctx = target.getContext("2d");
  if (ctx) ctx.drawImage(raster, 0, 0);
  raster.width = 0;
  raster.height = 0;
};

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
    case "caption":
      drawRasterToCanvas(
        overlayCanvas,
        await renderCaptionOverlayRaster({ width, height, params: overlay.params })
      );
      break;
    case "watermark":
      drawRasterToCanvas(
        overlayCanvas,
        await renderWatermarkOverlayRaster({ width, height, params: overlay.params })
      );
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

    const overlayCanvas = await renderOverlayToCanvas(
      overlay,
      currentSurface.width,
      currentSurface.height
    );
    try {
      const blendedSurface = await applyNormalLayerBlendOnSurface({
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
