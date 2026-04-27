import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import {
  applyHalftoneOnSurface,
  type ApplyHalftoneOnSurfaceInput,
} from "@/lib/gpu/passes/carrier/halftone";
import { clamp } from "@/lib/math";
import type { RenderQualityTier } from "./qualityTier";
import type {
  ImageHalftoneCarrierTransformNode,
  ImageRenderTargetSize,
} from "./types";

const HALFTONE_CARRIER_SLOT_ID = "halftone-carrier";

const parseHexColor = (value: string | null): { r: number; g: number; b: number } => {
  if (!value || value.length < 7) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(value.slice(1, 3), 16) / 255,
    g: parseInt(value.slice(3, 5), 16) / 255,
    b: parseInt(value.slice(5, 7), 16) / 255,
  };
};

const prepareHalftoneGpuInput = (
  transform: ImageHalftoneCarrierTransformNode,
  _quality: RenderQualityTier,
  targetSize: ImageRenderTargetSize
): ApplyHalftoneOnSurfaceInput => {
  const params = transform.params;
  const bgColor = parseHexColor(params.backgroundColor);
  return {
    canvasWidth: Math.max(1, Math.round(targetSize.width)),
    canvasHeight: Math.max(1, Math.round(targetSize.height)),
    frequency: clamp(params.frequency, 4, 80),
    angle: params.angle % 360,
    shape: params.shape,
    colorMode: params.colorMode,
    dotScale: clamp(params.dotScale, 0.5, 2),
    contrast: clamp(params.contrast, 0.5, 3),
    invert: params.invert,
    backgroundColor: [bgColor.r, bgColor.g, bgColor.b],
    backgroundOpacity: clamp(params.backgroundOpacity, 0, 1),
  };
};

export const applyImageHalftoneCarrierTransform = async ({
  baseSurface,
  transform,
  quality,
  targetSize,
}: {
  baseSurface: RenderSurfaceHandle;
  transform: ImageHalftoneCarrierTransformNode;
  quality: RenderQualityTier;
  targetSize: ImageRenderTargetSize;
}): Promise<RenderSurfaceHandle | null> => {
  const input = prepareHalftoneGpuInput(transform, quality, targetSize);
  return applyHalftoneOnSurface({
    surface: baseSurface,
    input,
    slotId: HALFTONE_CARRIER_SLOT_ID,
  });
};
