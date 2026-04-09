import { clamp } from "@/lib/math";
import type {
  ImageRenderColorState,
  ImageRenderDetailState,
  ImageRenderGeometry,
  ImageRenderToneState,
} from "@/render/image/types";
import type { ResolvedRenderProfile } from "@/types/film";
import type { GeometryUniforms } from "@/lib/renderer/types";

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

export const resolveTransform = (geometry: ImageRenderGeometry, width: number, height: number) => {
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

export const toNumberKey = (value: number, precision = 4) => {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return value.toFixed(precision);
};

export const hashString = (input: string) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

export const createMasterKey = (
  tone: ImageRenderToneState,
  color: ImageRenderColorState,
  detail: Pick<ImageRenderDetailState, "dehaze">
) =>
  [
    "m",
    toNumberKey(tone.exposure, 3),
    toNumberKey(tone.contrast, 3),
    toNumberKey(tone.highlights, 3),
    toNumberKey(tone.shadows, 3),
    toNumberKey(tone.whites, 3),
    toNumberKey(tone.blacks, 3),
    toNumberKey(color.temperature, 3),
    toNumberKey(color.tint, 3),
    Number.isFinite(color.temperatureKelvin ?? NaN)
      ? toNumberKey(color.temperatureKelvin as number, 2)
      : "kelvin:na",
    Number.isFinite(color.tintMG ?? NaN) ? toNumberKey(color.tintMG as number, 2) : "tintmg:na",
    toNumberKey(color.saturation, 3),
    toNumberKey(color.vibrance, 3),
    toNumberKey(color.colorGrading.shadows.hue, 3),
    toNumberKey(color.colorGrading.shadows.saturation, 3),
    toNumberKey(color.colorGrading.shadows.luminance, 3),
    toNumberKey(color.colorGrading.midtones.hue, 3),
    toNumberKey(color.colorGrading.midtones.saturation, 3),
    toNumberKey(color.colorGrading.midtones.luminance, 3),
    toNumberKey(color.colorGrading.highlights.hue, 3),
    toNumberKey(color.colorGrading.highlights.saturation, 3),
    toNumberKey(color.colorGrading.highlights.luminance, 3),
    toNumberKey(color.colorGrading.blend, 3),
    toNumberKey(color.colorGrading.balance, 3),
    toNumberKey(detail.dehaze, 3),
  ].join("|");

export const createHslKey = (color: ImageRenderColorState) =>
  [
    "h",
    toNumberKey(color.hsl.red.hue, 2),
    toNumberKey(color.hsl.red.saturation, 2),
    toNumberKey(color.hsl.red.luminance, 2),
    toNumberKey(color.hsl.orange.hue, 2),
    toNumberKey(color.hsl.orange.saturation, 2),
    toNumberKey(color.hsl.orange.luminance, 2),
    toNumberKey(color.hsl.yellow.hue, 2),
    toNumberKey(color.hsl.yellow.saturation, 2),
    toNumberKey(color.hsl.yellow.luminance, 2),
    toNumberKey(color.hsl.green.hue, 2),
    toNumberKey(color.hsl.green.saturation, 2),
    toNumberKey(color.hsl.green.luminance, 2),
    toNumberKey(color.hsl.aqua.hue, 2),
    toNumberKey(color.hsl.aqua.saturation, 2),
    toNumberKey(color.hsl.aqua.luminance, 2),
    toNumberKey(color.hsl.blue.hue, 2),
    toNumberKey(color.hsl.blue.saturation, 2),
    toNumberKey(color.hsl.blue.luminance, 2),
    toNumberKey(color.hsl.purple.hue, 2),
    toNumberKey(color.hsl.purple.saturation, 2),
    toNumberKey(color.hsl.purple.luminance, 2),
    toNumberKey(color.hsl.magenta.hue, 2),
    toNumberKey(color.hsl.magenta.saturation, 2),
    toNumberKey(color.hsl.magenta.luminance, 2),
    color.bwEnabled ? "bw:1" : "bw:0",
    toNumberKey(color.bwMix?.red ?? 0, 2),
    toNumberKey(color.bwMix?.green ?? 0, 2),
    toNumberKey(color.bwMix?.blue ?? 0, 2),
    toNumberKey(color.calibration?.redHue ?? 0, 2),
    toNumberKey(color.calibration?.redSaturation ?? 0, 2),
    toNumberKey(color.calibration?.greenHue ?? 0, 2),
    toNumberKey(color.calibration?.greenSaturation ?? 0, 2),
    toNumberKey(color.calibration?.blueHue ?? 0, 2),
    toNumberKey(color.calibration?.blueSaturation ?? 0, 2),
  ].join("|");

export const serializeCurvePoints = (points: ImageRenderColorState["pointCurve"]["rgb"]) =>
  points.map((point) => `${toNumberKey(point.x, 0)}:${toNumberKey(point.y, 0)}`).join(",");

export const createCurveKey = (color: Pick<ImageRenderColorState, "pointCurve">) =>
  [
    "c",
    serializeCurvePoints(color.pointCurve.rgb),
    serializeCurvePoints(color.pointCurve.red),
    serializeCurvePoints(color.pointCurve.green),
    serializeCurvePoints(color.pointCurve.blue),
  ].join("|");

export const createDetailKey = (detail: ImageRenderDetailState) =>
  [
    "d",
    toNumberKey(detail.texture, 2),
    toNumberKey(detail.clarity, 2),
    toNumberKey(detail.sharpening, 2),
    toNumberKey(detail.sharpenRadius, 2),
    toNumberKey(detail.sharpenDetail, 2),
    toNumberKey(detail.masking, 2),
    toNumberKey(detail.noiseReduction, 2),
    toNumberKey(detail.colorNoiseReduction, 2),
  ].join("|");

export const createFilmKey = (resolvedProfile: ResolvedRenderProfile, grainSeed: number) => {
  const sourceProfileHash =
    typeof resolvedProfile.source === "object" && resolvedProfile.source
      ? hashString(JSON.stringify(resolvedProfile.source))
      : "none";
  const lutKey = resolvedProfile.lut
    ? `${resolvedProfile.lut.path}:${resolvedProfile.lut.size}:${toNumberKey(
        resolvedProfile.lut.intensity,
        4
      )}`
    : "none";
  const lutBlendKey = resolvedProfile.lutBlend
    ? `${resolvedProfile.lutBlend.path}:${resolvedProfile.lutBlend.size}:${toNumberKey(
        resolvedProfile.lutBlend.mixFactor,
        4
      )}`
    : "none";
  const customLutKey = resolvedProfile.customLut
    ? `${resolvedProfile.customLut.path}:${resolvedProfile.customLut.size}:${toNumberKey(
        resolvedProfile.customLut.intensity,
        4
      )}`
    : "none";
  const printLutKey = resolvedProfile.printLut
    ? `${resolvedProfile.printLut.path}:${resolvedProfile.printLut.size}`
    : "none";
  const pushPullKey = [
    resolvedProfile.pushPull.enabled ? "1" : "0",
    toNumberKey(resolvedProfile.pushPull.ev, 3),
    resolvedProfile.pushPull.source,
    resolvedProfile.pushPull.selectedStop === null
      ? "none"
      : toNumberKey(resolvedProfile.pushPull.selectedStop, 2),
  ].join(":");
  return [
    "f",
    resolvedProfile.mode,
    sourceProfileHash,
    lutKey,
    lutBlendKey,
    customLutKey,
    printLutKey,
    pushPullKey,
    toNumberKey(grainSeed, 0),
  ].join("|");
};

export const createOpticsKey = (resolvedProfile: ResolvedRenderProfile, skipHalationBloom?: boolean) => {
  const halation = resolvedProfile.v3.halation
    ? JSON.stringify(resolvedProfile.v3.halation)
    : "none";
  const bloom = resolvedProfile.v3.bloom ? JSON.stringify(resolvedProfile.v3.bloom) : "none";
  const glow = resolvedProfile.v3.glow ? JSON.stringify(resolvedProfile.v3.glow) : "none";
  return [
    "o",
    skipHalationBloom ? "1" : "0",
    hashString(halation),
    hashString(bloom),
    hashString(glow),
  ].join("|");
};

export const createGeometryKey = (params: {
  sourceKey: string;
  rightAngleRotation: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  outputWidth: number;
  outputHeight: number;
  fullOutputWidth?: number;
  fullOutputHeight?: number;
  outputOffsetX?: number;
  outputOffsetY?: number;
  rotate: number;
  perspectiveEnabled: boolean;
  perspectiveHorizontal: number;
  perspectiveVertical: number;
  scale: number;
  horizontal: number;
  vertical: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  opticsProfile: boolean;
  opticsCA: boolean;
  opticsDistortionK1: number;
  opticsDistortionK2: number;
  opticsCaAmount: number;
  opticsVignette: number;
  opticsVignetteMidpoint: number;
  qualityProfile: RenderQualityProfile;
}) =>
  [
    "g",
    params.sourceKey,
    toNumberKey(params.rightAngleRotation, 0),
    toNumberKey(params.cropX, 3),
    toNumberKey(params.cropY, 3),
    toNumberKey(params.cropWidth, 3),
    toNumberKey(params.cropHeight, 3),
    toNumberKey(params.outputWidth, 0),
    toNumberKey(params.outputHeight, 0),
    toNumberKey(params.fullOutputWidth ?? params.outputWidth, 0),
    toNumberKey(params.fullOutputHeight ?? params.outputHeight, 0),
    toNumberKey(params.outputOffsetX ?? 0, 0),
    toNumberKey(params.outputOffsetY ?? 0, 0),
    toNumberKey(params.rotate, 3),
    params.perspectiveEnabled ? "p:1" : "p:0",
    toNumberKey(params.perspectiveHorizontal, 3),
    toNumberKey(params.perspectiveVertical, 3),
    toNumberKey(params.scale, 3),
    toNumberKey(params.horizontal, 3),
    toNumberKey(params.vertical, 3),
    params.flipHorizontal ? "1" : "0",
    params.flipVertical ? "1" : "0",
    params.opticsProfile ? "op:1" : "op:0",
    params.opticsCA ? "oca:1" : "oca:0",
    toNumberKey(params.opticsDistortionK1, 2),
    toNumberKey(params.opticsDistortionK2, 2),
    toNumberKey(params.opticsCaAmount, 2),
    toNumberKey(params.opticsVignette, 2),
    toNumberKey(params.opticsVignetteMidpoint, 2),
    params.qualityProfile,
  ].join("|");

export const createUploadKey = (params: {
  sourceKey: string;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
}) =>
  [
    "u",
    params.sourceKey,
    `${params.sourceWidth}x${params.sourceHeight}`,
    `${params.targetWidth}x${params.targetHeight}`,
  ].join("|");

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
  // Vignette removal is independent of lens profile
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

export const applyOpticsToPassthroughGeometryUniforms = (
  passthrough: GeometryUniforms,
  optics: GeometryUniforms
) => {
  passthrough.lensEnabled = optics.lensEnabled;
  passthrough.lensK1 = optics.lensK1;
  passthrough.lensK2 = optics.lensK2;
  passthrough.lensVignetteBoost = optics.lensVignetteBoost;
  passthrough.lensVignetteMidpoint = optics.lensVignetteMidpoint;
  passthrough.caEnabled = optics.caEnabled;
  passthrough.caAmountPxRgb = [...optics.caAmountPxRgb] as [number, number, number];

  const lensDistortionActive = Math.abs(optics.lensK1) > 1e-6 || Math.abs(optics.lensK2) > 1e-6;
  const vignetteActive = optics.lensVignetteBoost > 0.001;
  const caAmountMax = Math.max(
    Math.abs(optics.caAmountPxRgb[0]),
    Math.abs(optics.caAmountPxRgb[1]),
    Math.abs(optics.caAmountPxRgb[2])
  );
  const caActive = optics.caEnabled && caAmountMax > 0.001;

  // Keep geometry disabled unless optics actually need the shader path.
  passthrough.enabled = lensDistortionActive || vignetteActive || caActive;
};
