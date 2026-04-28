import { clamp } from "@/lib/math";
import type { ImageRenderGeometry } from "@/render/image/types";
import type { GeometryUniforms } from "@/lib/gpu/uniformTypes";

export type RenderQualityProfile = "interactive" | "full";

export const resolveAspectRatio = (
  value: ImageRenderGeometry["aspectRatio"],
  customAspectRatio: number,
  fallback?: number
) => {
  if (value === "original") {
    return fallback ?? 1;
  }
  if (value === "free") {
    if (Number.isFinite(customAspectRatio) && customAspectRatio > 0) {
      return customAspectRatio;
    }
    return fallback ?? 1;
  }
  const [w, h] = value.split(":").map(Number);
  if (!w || !h) {
    return fallback ?? 1;
  }
  return w / h;
};

export const resolveRightAngleQuarterTurns = (rightAngleRotation: number) => {
  const quarterTurns = Math.round(rightAngleRotation / 90);
  return ((quarterTurns % 4) + 4) % 4;
};

export const resolveOrientedDimensions = (
  width: number,
  height: number,
  rightAngleRotation: number
) => {
  const quarterTurns = resolveRightAngleQuarterTurns(rightAngleRotation);
  return {
    quarterTurns,
    width: quarterTurns % 2 === 0 ? width : height,
    height: quarterTurns % 2 === 0 ? height : width,
  };
};

export const resolveOrientedAspectRatio = (aspectRatio: number, rightAngleRotation: number) => {
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  return resolveRightAngleQuarterTurns(rightAngleRotation) % 2 === 1
    ? 1 / safeAspectRatio
    : safeAspectRatio;
};

const resolveTransform = (geometry: ImageRenderGeometry, width: number, height: number) => {
  const scale = clamp(geometry.scale / 100, 0.5, 2.0);
  const translateX = clamp(geometry.horizontal / 5, -20, 20);
  const translateY = clamp(geometry.vertical / 5, -20, 20);
  const flipHorizontal = geometry.flipHorizontal ? -1 : 1;
  const flipVertical = geometry.flipVertical ? -1 : 1;
  return {
    scale,
    rotate: (geometry.rotate * Math.PI) / 180,
    translateX: (translateX / 100) * width,
    translateY: (translateY / 100) * height,
    flipHorizontal,
    flipVertical,
  };
};

export const createGeometryUniforms = (params: {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  fullOutputWidth?: number;
  fullOutputHeight?: number;
  outputOffsetX?: number;
  outputOffsetY?: number;
  geometry: ImageRenderGeometry;
}): GeometryUniforms => {
  const sourceWidth = Math.max(1, params.sourceWidth);
  const sourceHeight = Math.max(1, params.sourceHeight);
  const outputWidth = Math.max(1, params.outputWidth);
  const outputHeight = Math.max(1, params.outputHeight);
  const fullOutputWidth = Math.max(1, params.fullOutputWidth ?? outputWidth);
  const fullOutputHeight = Math.max(1, params.fullOutputHeight ?? outputHeight);
  const transform = resolveTransform(params.geometry, fullOutputWidth, fullOutputHeight);
  const perspectiveHorizontal = params.geometry.perspectiveHorizontal ?? 0;
  const perspectiveVertical = params.geometry.perspectiveVertical ?? 0;
  const perspectiveEnabled = Boolean(params.geometry.perspectiveEnabled);
  const kx = (perspectiveHorizontal / 100) * 0.35;
  const ky = (perspectiveVertical / 100) * 0.35;
  const homography = perspectiveEnabled
    ? [1, 0, 0, 0, 1, 0, kx, ky, 1]
    : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const lensEnabled = params.geometry.opticsProfile;
  const opticsVignetteStrength = clamp(params.geometry.opticsVignette / 100, 0, 1);
  const lensK1Control = clamp((params.geometry.opticsDistortionK1 ?? 0) / 100, -1, 1);
  const lensK2Control = clamp((params.geometry.opticsDistortionK2 ?? 0) / 100, -1, 1);
  const lensK1 = lensEnabled ? lensK1Control * 0.5 : 0;
  const lensK2 = lensEnabled ? lensK2Control * 0.3 : 0;
  const vignetteMidpointControl = clamp(
    (params.geometry.opticsVignetteMidpoint ?? 50) / 100,
    0,
    1
  );
  const lensVignetteMidpoint = 0.05 + vignetteMidpointControl * 0.4;
  const caEnabled = params.geometry.opticsCA;
  const caAmountControl = clamp((params.geometry.opticsCaAmount ?? 0) / 100, 0, 1);
  const caAmountBasePx = caEnabled ? caAmountControl * 2.5 : 0;

  return {
    enabled: true,
    cropRect: [
      params.cropX / sourceWidth,
      params.cropY / sourceHeight,
      params.cropWidth / sourceWidth,
      params.cropHeight / sourceHeight,
    ],
    sourceSize: [sourceWidth, sourceHeight],
    outputSize: [outputWidth, outputHeight],
    translatePx: [
      transform.translateX - (params.outputOffsetX ?? 0),
      transform.translateY - (params.outputOffsetY ?? 0),
    ],
    rotate: transform.rotate,
    perspectiveEnabled,
    homography,
    scale: transform.scale,
    flip: [transform.flipHorizontal, transform.flipVertical],
    lensEnabled,
    lensK1,
    lensK2,
    lensVignetteBoost: opticsVignetteStrength,
    lensVignetteMidpoint,
    caEnabled,
    // Signed RGB offsets (px at frame edge); blue shifts opposite red.
    caAmountPxRgb: [caAmountBasePx, 0, -caAmountBasePx * 0.9],
  };
};

export const createPassthroughGeometryUniforms = (
  outputWidth: number,
  outputHeight: number
): GeometryUniforms => ({
  enabled: false,
  cropRect: [0, 0, 1, 1],
  sourceSize: [Math.max(1, outputWidth), Math.max(1, outputHeight)],
  outputSize: [Math.max(1, outputWidth), Math.max(1, outputHeight)],
  translatePx: [0, 0],
  rotate: 0,
  perspectiveEnabled: false,
  homography: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  scale: 1,
  flip: [1, 1],
  lensEnabled: false,
  lensK1: 0,
  lensK2: 0,
  lensVignetteBoost: 0,
  lensVignetteMidpoint: 0.25,
  caEnabled: false,
  caAmountPxRgb: [0, 0, 0],
});
