import { presets } from "@/data/presets";
import {
  ASPECT_RATIOS,
  type ColorGradingAdjustments,
  type EditingAdjustments,
  type HslColorKey,
  type HslAdjustments,
  type PointCurveAdjustments,
  type PointCurvePoint,
  type PresetAdjustments,
  type PresetAdjustmentKey,
} from "@/types";

const defaultHsl: HslAdjustments = {
  red: { hue: 0, saturation: 0, luminance: 0 },
  orange: { hue: 0, saturation: 0, luminance: 0 },
  yellow: { hue: 0, saturation: 0, luminance: 0 },
  green: { hue: 0, saturation: 0, luminance: 0 },
  aqua: { hue: 0, saturation: 0, luminance: 0 },
  blue: { hue: 0, saturation: 0, luminance: 0 },
  purple: { hue: 0, saturation: 0, luminance: 0 },
  magenta: { hue: 0, saturation: 0, luminance: 0 },
};

const defaultColorGrading: ColorGradingAdjustments = {
  shadows: { hue: 0, saturation: 0, luminance: 0 },
  midtones: { hue: 0, saturation: 0, luminance: 0 },
  highlights: { hue: 0, saturation: 0, luminance: 0 },
  blend: 50,
  balance: 0,
};

const defaultPointCurve: PointCurveAdjustments = {
  rgb: [
    { x: 0, y: 0 },
    { x: 64, y: 64 },
    { x: 128, y: 128 },
    { x: 192, y: 192 },
    { x: 255, y: 255 },
  ],
  red: [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ],
  green: [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ],
  blue: [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ],
};

const HSL_KEYS: HslColorKey[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
  "magenta",
];

const POINT_CURVE_CHANNELS: Array<keyof PointCurveAdjustments> = ["rgb", "red", "green", "blue"];

const clonePointCurvePoints = (points: PointCurvePoint[]) =>
  points.map((point) => ({
    x: point.x,
    y: point.y,
  }));

const normalizePointCurvePoints = (
  points: unknown,
  fallback: PointCurvePoint[]
): PointCurvePoint[] => {
  if (!Array.isArray(points)) {
    return clonePointCurvePoints(fallback);
  }

  const normalized = points
    .map((point) => {
      if (!point || typeof point !== "object") {
        return null;
      }
      const x = Number((point as { x?: unknown }).x);
      const y = Number((point as { y?: unknown }).y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }
      return {
        x: Math.min(255, Math.max(0, Math.round(x))),
        y: Math.min(255, Math.max(0, Math.round(y))),
      };
    })
    .filter((point): point is PointCurvePoint => Boolean(point))
    .sort((a, b) => a.x - b.x);

  if (normalized.length < 2) {
    return clonePointCurvePoints(fallback);
  }

  const deduped: PointCurvePoint[] = [];
  for (const point of normalized) {
    const last = deduped[deduped.length - 1];
    if (last && last.x === point.x) {
      last.y = point.y;
      continue;
    }
    deduped.push(point);
  }

  if (deduped.length < 2) {
    return clonePointCurvePoints(fallback);
  }

  deduped[0] = { x: 0, y: deduped[0]?.y ?? 0 };
  const lastIndex = deduped.length - 1;
  deduped[lastIndex] = { x: 255, y: deduped[lastIndex]?.y ?? 255 };
  return deduped;
};

const normalizeRightAngleRotation = (value: number) => {
  const quarterTurns = Math.round(value / 90);
  const normalizedTurns = ((quarterTurns % 4) + 4) % 4;
  return normalizedTurns * 90;
};

type NormalizableAdjustments = Partial<EditingAdjustments> & {
  hsl?: Partial<Record<HslColorKey, Partial<HslAdjustments[HslColorKey]>>>;
  pointCurve?: Partial<Record<keyof PointCurveAdjustments, PointCurvePoint[]>>;
  colorGrading?: Partial<EditingAdjustments["colorGrading"]> & {
    shadows?: Partial<EditingAdjustments["colorGrading"]["shadows"]>;
    midtones?: Partial<EditingAdjustments["colorGrading"]["midtones"]>;
    highlights?: Partial<EditingAdjustments["colorGrading"]["highlights"]>;
  };
};

// Single-entry memoization cache for normalizeAdjustments.
// During slider drags the same adjustments reference is passed many times,
// so this avoids redundant object spreading on every call.
let _lastNormalizeInput: NormalizableAdjustments | null | undefined;
let _lastNormalizeOutput: EditingAdjustments | undefined;

export const normalizeAdjustments = (
  adjustments: NormalizableAdjustments | null | undefined
): EditingAdjustments => {
  if (adjustments === _lastNormalizeInput && _lastNormalizeOutput) {
    return _lastNormalizeOutput;
  }
  const result = normalizeAdjustmentsUncached(adjustments);
  _lastNormalizeInput = adjustments;
  _lastNormalizeOutput = result;
  return result;
};

const normalizeAdjustmentsUncached = (
  adjustments: NormalizableAdjustments | null | undefined
): EditingAdjustments => {
  const defaults = createDefaultAdjustments();
  if (!adjustments) {
    return defaults;
  }

  const merged: EditingAdjustments = {
    ...defaults,
    ...adjustments,
    hsl: {
      ...defaults.hsl,
    },
    pointCurve: {
      rgb: clonePointCurvePoints(defaults.pointCurve.rgb),
      red: clonePointCurvePoints(defaults.pointCurve.red),
      green: clonePointCurvePoints(defaults.pointCurve.green),
      blue: clonePointCurvePoints(defaults.pointCurve.blue),
    },
    colorGrading: {
      ...defaults.colorGrading,
      shadows: { ...defaults.colorGrading.shadows },
      midtones: { ...defaults.colorGrading.midtones },
      highlights: { ...defaults.colorGrading.highlights },
      blend: defaults.colorGrading.blend,
      balance: defaults.colorGrading.balance,
    },
  };

  HSL_KEYS.forEach((key) => {
    merged.hsl[key] = {
      ...defaults.hsl[key],
      ...(adjustments.hsl?.[key] ?? {}),
    };
  });

  POINT_CURVE_CHANNELS.forEach((channel) => {
    merged.pointCurve[channel] = normalizePointCurvePoints(
      adjustments.pointCurve?.[channel],
      defaults.pointCurve[channel]
    );
  });

  const grading = adjustments.colorGrading;
  merged.colorGrading.shadows = {
    ...defaults.colorGrading.shadows,
    ...(grading?.shadows ?? {}),
  };
  merged.colorGrading.midtones = {
    ...defaults.colorGrading.midtones,
    ...(grading?.midtones ?? {}),
  };
  merged.colorGrading.highlights = {
    ...defaults.colorGrading.highlights,
    ...(grading?.highlights ?? {}),
  };
  merged.colorGrading.blend =
    typeof grading?.blend === "number" ? grading.blend : defaults.colorGrading.blend;
  merged.colorGrading.balance =
    typeof grading?.balance === "number" ? grading.balance : defaults.colorGrading.balance;

  merged.aspectRatio = (ASPECT_RATIOS as readonly string[]).includes(merged.aspectRatio)
    ? merged.aspectRatio
    : defaults.aspectRatio;
  merged.customAspectRatio =
    typeof merged.customAspectRatio === "number" && merged.customAspectRatio > 0
      ? merged.customAspectRatio
      : defaults.customAspectRatio;
  merged.rotate = clampValue(
    Number.isFinite(merged.rotate) ? merged.rotate : defaults.rotate,
    -45,
    45
  );
  merged.rightAngleRotation = normalizeRightAngleRotation(
    Number.isFinite(merged.rightAngleRotation)
      ? merged.rightAngleRotation
      : defaults.rightAngleRotation
  );
  merged.timestampEnabled = Boolean(merged.timestampEnabled);
  merged.timestampPosition =
    merged.timestampPosition === "bottom-right" ||
    merged.timestampPosition === "bottom-left" ||
    merged.timestampPosition === "top-right" ||
    merged.timestampPosition === "top-left"
      ? merged.timestampPosition
      : defaults.timestampPosition;
  merged.timestampSize = clampValue(
    Number.isFinite(merged.timestampSize) ? merged.timestampSize : defaults.timestampSize,
    12,
    48
  );
  merged.timestampOpacity = clampValue(
    Number.isFinite(merged.timestampOpacity) ? merged.timestampOpacity : defaults.timestampOpacity,
    0,
    100
  );

  return merged;
};

export function createDefaultAdjustments(): EditingAdjustments {
  return {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    temperature: 0,
    tint: 0,
    vibrance: 0,
    saturation: 0,
    texture: 0,
    clarity: 0,
    dehaze: 0,
    curveHighlights: 0,
    curveLights: 0,
    curveDarks: 0,
    curveShadows: 0,
    pointCurve: {
      rgb: clonePointCurvePoints(defaultPointCurve.rgb),
      red: clonePointCurvePoints(defaultPointCurve.red),
      green: clonePointCurvePoints(defaultPointCurve.green),
      blue: clonePointCurvePoints(defaultPointCurve.blue),
    },
    hsl: {
      red: { ...defaultHsl.red },
      orange: { ...defaultHsl.orange },
      yellow: { ...defaultHsl.yellow },
      green: { ...defaultHsl.green },
      aqua: { ...defaultHsl.aqua },
      blue: { ...defaultHsl.blue },
      purple: { ...defaultHsl.purple },
      magenta: { ...defaultHsl.magenta },
    },
    colorGrading: {
      shadows: { ...defaultColorGrading.shadows },
      midtones: { ...defaultColorGrading.midtones },
      highlights: { ...defaultColorGrading.highlights },
      blend: defaultColorGrading.blend,
      balance: defaultColorGrading.balance,
    },
    sharpening: 0,
    sharpenRadius: 40,
    sharpenDetail: 25,
    masking: 0,
    noiseReduction: 0,
    colorNoiseReduction: 0,
    vignette: 0,
    grain: 0,
    grainSize: 50,
    grainRoughness: 50,
    rotate: 0,
    rightAngleRotation: 0,
    vertical: 0,
    horizontal: 0,
    scale: 100,
    flipHorizontal: false,
    flipVertical: false,
    customAspectRatio: 4 / 3,
    aspectRatio: "original",
    timestampEnabled: false,
    timestampPosition: "bottom-right",
    timestampSize: 22,
    timestampOpacity: 72,
    opticsProfile: false,
    opticsCA: false,
  };
}

const PRESET_LIMITS: Record<PresetAdjustmentKey, { min: number; max: number }> = {
  exposure: { min: -100, max: 100 },
  contrast: { min: -100, max: 100 },
  highlights: { min: -100, max: 100 },
  shadows: { min: -100, max: 100 },
  whites: { min: -100, max: 100 },
  blacks: { min: -100, max: 100 },
  curveHighlights: { min: -100, max: 100 },
  curveLights: { min: -100, max: 100 },
  curveDarks: { min: -100, max: 100 },
  curveShadows: { min: -100, max: 100 },
  temperature: { min: -100, max: 100 },
  tint: { min: -100, max: 100 },
  vibrance: { min: -100, max: 100 },
  saturation: { min: -100, max: 100 },
  clarity: { min: -100, max: 100 },
  dehaze: { min: -100, max: 100 },
  vignette: { min: -100, max: 100 },
  grain: { min: 0, max: 100 },
  grainSize: { min: 0, max: 100 },
  grainRoughness: { min: 0, max: 100 },
  sharpening: { min: 0, max: 100 },
  sharpenRadius: { min: 0, max: 100 },
  sharpenDetail: { min: 0, max: 100 },
  masking: { min: 0, max: 100 },
  noiseReduction: { min: 0, max: 100 },
  colorNoiseReduction: { min: 0, max: 100 },
};

const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const applyPresetAdjustments = (
  base: EditingAdjustments,
  presetAdjustments: PresetAdjustments,
  intensity = 100
) => {
  const resolvedBase = normalizeAdjustments(base);
  const scale = clampValue(intensity, 0, 100) / 100;
  const next = { ...resolvedBase };
  (Object.keys(presetAdjustments) as PresetAdjustmentKey[]).forEach((key) => {
    const adjustment = presetAdjustments[key];
    if (typeof adjustment !== "number") {
      return;
    }
    const limit = PRESET_LIMITS[key];
    const updated = resolvedBase[key] + adjustment * scale;
    next[key] = clampValue(updated, limit.min, limit.max);
  });
  return next;
};

export const resolveAdjustmentsWithPreset = (
  adjustments: EditingAdjustments | undefined,
  presetId?: string,
  intensity?: number
) => {
  const base = normalizeAdjustments(adjustments);
  if (!presetId) {
    return base;
  }
  const preset = presets.find((item) => item.id === presetId);
  if (!preset) {
    return base;
  }
  const resolvedIntensity = typeof intensity === "number" ? intensity : preset.intensity;
  return applyPresetAdjustments(base, preset.adjustments, resolvedIntensity);
};
