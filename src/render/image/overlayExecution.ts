import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import { clamp } from "@/lib/math";
import { applyNormalLayerBlendOnSurface } from "@/lib/gpu/passes/overlay/normalLayerBlend";
import { renderCaptionOverlayRaster, type CaptionOverlayRenderParams } from "@/lib/captionOverlay";
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
  node: TimestampSemanticOverlayNode,
  layoutScale: number
): TimestampOverlayAdjustments => ({
  timestampEnabled: node.enabled,
  timestampOpacity: node.params.opacity,
  timestampPosition: node.params.position,
  timestampSize: clamp(node.params.size, 12, 48) * layoutScale,
});

const createCaptionRenderParams = (
  node: CaptionSemanticOverlayNode,
  layoutScale: number
): CaptionOverlayRenderParams => ({
  ...node.params,
  fontSize: clamp(node.params.fontSize, 12, 72) * layoutScale,
  padding: clamp(node.params.padding, 0, 100) * layoutScale,
});

const createWatermarkRenderParams = (
  node: WatermarkSemanticOverlayNode,
  layoutScale: number
): WatermarkOverlayRenderParams => ({
  ...node.params,
  fontSize: clamp(node.params.fontSize, 12, 120) * layoutScale,
});

export const resolveImageOverlayLayoutScale = ({
  height,
  referenceHeight,
  referenceWidth,
  width,
}: {
  height: number;
  referenceHeight?: number;
  referenceWidth?: number;
  width: number;
}) => {
  if (
    !Number.isFinite(referenceWidth) ||
    !Number.isFinite(referenceHeight) ||
    !referenceWidth ||
    !referenceHeight
  ) {
    return 1;
  }
  return Math.max(
    0.01,
    Math.min(width / Math.max(1, referenceWidth), height / Math.max(1, referenceHeight))
  );
};

export const resolveImageOverlays = ({
  semanticOverlays,
  layoutScale = 1,
  timestampText,
}: {
  semanticOverlays: readonly SemanticOverlayNode[];
  layoutScale?: number;
  timestampText?: string | null;
}): ImageOverlayNode[] => {
  const safeLayoutScale = Number.isFinite(layoutScale) ? clamp(layoutScale, 0.01, 64) : 1;
  const overlays: ImageOverlayNode[] = [];
  for (const node of semanticOverlays) {
    if (!node.enabled) {
      continue;
    }
    switch (node.type) {
      case "timestamp": {
        if (node.params.opacity <= 0.1) {
          break;
        }
        overlays.push({
          type: "timestamp",
          adjustments: createTimestampAdjustmentsFromOverlayNode(node, safeLayoutScale),
          text: timestampText,
        });
        break;
      }
      case "caption": {
        if (!node.params.text.trim() || node.params.opacity <= 0.1) {
          break;
        }
        overlays.push({
          type: "caption",
          params: createCaptionRenderParams(node, safeLayoutScale),
        });
        break;
      }
      case "watermark": {
        if (!node.params.text.trim() || node.params.opacity <= 0.1) {
          break;
        }
        overlays.push({
          type: "watermark",
          params: createWatermarkRenderParams(node, safeLayoutScale),
        });
        break;
      }
    }
  }
  return overlays;
};

const drawRasterToCanvas = (target: HTMLCanvasElement, raster: HTMLCanvasElement | null) => {
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
