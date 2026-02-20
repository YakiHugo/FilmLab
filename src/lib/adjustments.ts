import { presets } from "@/data/presets";
import type {
  ColorGradingAdjustments,
  EditingAdjustments,
  HslColorKey,
  HslAdjustments,
  PresetAdjustments,
  PresetAdjustmentKey,
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

type NormalizableAdjustments = Partial<EditingAdjustments> & {
  hsl?: Partial<Record<HslColorKey, Partial<HslAdjustments[HslColorKey]>>>;
  colorGrading?: Partial<EditingAdjustments["colorGrading"]> & {
    shadows?: Partial<EditingAdjustments["colorGrading"]["shadows"]>;
    midtones?: Partial<EditingAdjustments["colorGrading"]["midtones"]>;
    highlights?: Partial<EditingAdjustments["colorGrading"]["highlights"]>;
  };
};

export const normalizeAdjustments = (
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
    typeof grading?.blend === "number"
      ? grading.blend
      : defaults.colorGrading.blend;
  merged.colorGrading.balance =
    typeof grading?.balance === "number"
      ? grading.balance
      : defaults.colorGrading.balance;

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
    masking: 0,
    noiseReduction: 0,
    colorNoiseReduction: 0,
    vignette: 0,
    grain: 0,
    grainSize: 50,
    grainRoughness: 50,
    rotate: 0,
    vertical: 0,
    horizontal: 0,
    scale: 100,
    flipHorizontal: false,
    flipVertical: false,
    aspectRatio: "original",
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
  masking: { min: 0, max: 100 },
  noiseReduction: { min: 0, max: 100 },
  colorNoiseReduction: { min: 0, max: 100 },
};

const clampValue = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

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
