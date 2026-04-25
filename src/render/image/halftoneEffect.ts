import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import {
  applyHalftoneCarrierOnGpuToSurface,
  type HalftoneCarrierGpuInput,
} from "@/lib/renderer/gpuHalftoneCarrier";
import { clamp } from "@/lib/math";
import type {
  ImageHalftoneCarrierTransformNode,
  ImageRenderQuality,
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
  _quality: ImageRenderQuality,
  targetSize: ImageRenderTargetSize
): HalftoneCarrierGpuInput => {
  const params = transform.params;
  const bgColor = parseHexColor(params.backgroundColor);
  return {
    width: Math.max(1, Math.round(targetSize.width)),
    height: Math.max(1, Math.round(targetSize.height)),
    frequency: clamp(params.frequency, 4, 80),
    angle: params.angle % 360,
    shape: params.shape,
    colorMode: params.colorMode,
    dotScale: clamp(params.dotScale, 0.5, 2),
    contrast: clamp(params.contrast, 0.5, 3),
    invert: params.invert,
    backgroundColorRgba: new Float32Array([bgColor.r, bgColor.g, bgColor.b, 1]),
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
  quality: ImageRenderQuality;
  targetSize: ImageRenderTargetSize;
}): Promise<RenderSurfaceHandle | null> => {
  const input = prepareHalftoneGpuInput(transform, quality, targetSize);
  return applyHalftoneCarrierOnGpuToSurface({
    surface: baseSurface,
    input,
    slotId: HALFTONE_CARRIER_SLOT_ID,
  });
};
