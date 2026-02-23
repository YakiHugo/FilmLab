import type { EditingAdjustments, FilmProfile } from "@/types";
import type { FilmProfileV2 } from "@/types/film";
import type { MasterUniforms, FilmUniforms, HalationBloomUniforms } from "./types";
import { getFilmModule, normalizeFilmProfile } from "@/lib/film/profile";

const IDENTITY_3X3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Transpose 3x3 row-major → column-major for WebGL. */
function transpose3x3(m: number[]): number[] {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/**
 * Map EditingAdjustments to MasterUniforms for the Master shader pass.
 *
 * The Master shader operates in linear space with scientific color models
 * (OKLab HSL, LMS white balance) instead of the RGB approximations in the
 * legacy shader. Parameter ranges are preserved for UI compatibility.
 */
export function resolveFromAdjustments(adj: EditingAdjustments): MasterUniforms {
  // Callers are expected to pass already-normalized adjustments.
  // Avoid double-normalizing which wastes CPU and can mask bugs.
  const grading = adj.colorGrading;
  return {
    // Exposure: map from [-100, 100] UI range to [-5, 5] EV
    exposure: (adj.exposure / 100) * 5,

    // These pass through directly (shader normalizes by /100)
    contrast: adj.contrast,
    highlights: adj.highlights,
    shadows: adj.shadows,
    whites: adj.whites,
    blacks: adj.blacks,

    // White balance
    temperature: adj.temperature,
    tint: adj.tint,

    // OKLab HSL: hueShift is new (not in v1 UI), default to 0
    hueShift: 0,
    saturation: adj.saturation,
    vibrance: adj.vibrance,
    luminance: 0, // Not exposed in current UI

    // Curves
    curveHighlights: adj.curveHighlights,
    curveLights: adj.curveLights,
    curveDarks: adj.curveDarks,
    curveShadows: adj.curveShadows,

    // 3-way color grading
    colorGradeShadows: [
      grading.shadows.hue,
      grading.shadows.saturation / 100,
      grading.shadows.luminance / 100,
    ],
    colorGradeMidtones: [
      grading.midtones.hue,
      grading.midtones.saturation / 100,
      grading.midtones.luminance / 100,
    ],
    colorGradeHighlights: [
      grading.highlights.hue,
      grading.highlights.saturation / 100,
      grading.highlights.luminance / 100,
    ],
    colorGradeBlend: grading.blend / 100,
    colorGradeBalance: grading.balance / 100,

    // Detail
    dehaze: adj.dehaze,
  };
}

/**
 * Resolve Film uniforms from an existing v1 FilmProfile.
 *
 * Maps the legacy 5-module system (colorScience, tone, scan, grain, defects)
 * into the new Film shader uniform format.
 */
export function resolveFilmUniforms(
  profile: FilmProfile,
  options?: { grainSeed?: number }
): FilmUniforms {
  const normalized = normalizeFilmProfile(profile);
  const tone = getFilmModule(normalized, "tone");
  const grain = getFilmModule(normalized, "grain");
  const scan = getFilmModule(normalized, "scan");
  const colorScience = getFilmModule(normalized, "colorScience");

  const toneAmount = tone?.enabled ? tone.amount / 100 : 0;
  const grainAmount = grain?.enabled ? grain.amount / 100 : 0;
  const scanAmount = scan?.enabled ? scan.amount / 100 : 0;

  // Derive color cast from scanWarmth
  const warmth = (scan?.params.scanWarmth ?? 0) / 100;
  const warmthScale = warmth * 0.12 * scanAmount;
  const hasColorCast = Math.abs(warmthScale) > 0.001;

  return {
    // Layer 1: Tone Response
    // Map from legacy tone module -- derive S-curve params from tone settings
    u_toneEnabled: toneAmount > 0,
    u_shoulder: 0, // Identity for v1 profiles; v2 profiles specify explicit values
    u_toe: 0, // Identity for v1 profiles; v2 profiles specify explicit values
    u_gamma: 1.0,

    // Layer 2: Color Matrix (derived from colorScience.rgbMix as diagonal)
    // Transpose to column-major for WebGL, consistent with V2 path.
    u_colorMatrixEnabled: colorScience?.enabled
      ? colorScience.params.rgbMix[0] !== 1 ||
        colorScience.params.rgbMix[1] !== 1 ||
        colorScience.params.rgbMix[2] !== 1
      : false,
    u_colorMatrix: colorScience?.enabled
      ? transpose3x3([
          colorScience.params.rgbMix[0],
          0,
          0,
          0,
          colorScience.params.rgbMix[1],
          0,
          0,
          0,
          colorScience.params.rgbMix[2],
        ])
      : IDENTITY_3X3,

    // Layer 3: LUT (not available in v1 profiles, disabled by default)
    u_lutEnabled: false,
    u_lutIntensity: 0.0,

    // Layer 4: Color Cast (derived from scanWarmth)
    u_colorCastEnabled: hasColorCast,
    u_colorCastShadows: [warmthScale * 0.5, 0, -warmthScale * 0.5],
    u_colorCastMidtones: [warmthScale * 0.3, 0, -warmthScale * 0.3],
    u_colorCastHighlights: [warmthScale * 0.1, 0, -warmthScale * 0.1],

    // Layer 5: Grain
    u_grainEnabled: grainAmount > 0 && (grain?.params.amount ?? 0) > 0,
    u_grainAmount: (grain?.params.amount ?? 0) * grainAmount,
    u_grainSize: grain?.params.size ?? 0.5,
    u_grainRoughness: grain?.params.roughness ?? 0.5,
    u_grainShadowBias: grain?.params.shadowBoost ?? 0.45,
    u_grainSeed: options?.grainSeed ?? Date.now(),
    u_grainIsColor: (grain?.params.color ?? 0.08) > 0.01,

    // Layer 6: Vignette
    u_vignetteEnabled: scanAmount > 0 && Math.abs(scan?.params.vignetteAmount ?? 0) > 0.001,
    u_vignetteAmount: (scan?.params.vignetteAmount ?? 0) * scanAmount,
    u_vignetteMidpoint: 0.5,
    u_vignetteRoundness: 0.5,
  };
}

/**
 * Resolve Halation/Bloom uniforms from a v1 FilmProfile.
 *
 * Maps the legacy scan module's halation/bloom parameters into the
 * new multi-pass HalationBloomFilter uniform format.
 */
export function resolveHalationBloomUniforms(profile: FilmProfile): HalationBloomUniforms {
  const normalized = normalizeFilmProfile(profile);
  const scan = getFilmModule(normalized, "scan");
  const scanAmount = scan?.enabled ? scan.amount / 100 : 0;

  const halIntensity = (scan?.params.halationAmount ?? 0) * scanAmount;
  const bloomIntensity = (scan?.params.bloomAmount ?? 0) * scanAmount;

  return {
    halationEnabled: halIntensity > 0.001,
    halationThreshold: scan?.params.halationThreshold ?? 0.9,
    halationIntensity: halIntensity,
    halationColor: [1.0, 0.3, 0.1], // Classic warm film halation
    halationRadius: Math.max(1, halIntensity * 8),

    bloomEnabled: bloomIntensity > 0.001,
    bloomThreshold: scan?.params.bloomThreshold ?? 0.85,
    bloomIntensity: bloomIntensity,
    bloomRadius: Math.max(1, bloomIntensity * 10),
  };
}

/**
 * Resolve Film uniforms from a V2 FilmProfile.
 *
 * Directly maps the structured V2 profile layers to shader uniforms.
 */
export function resolveFilmUniformsV2(
  profile: FilmProfileV2,
  options?: { grainSeed?: number }
): FilmUniforms {
  const cc = profile.colorCast;

  return {
    // Layer 1: Tone Response
    u_toneEnabled: profile.toneResponse.enabled,
    u_shoulder: profile.toneResponse.shoulder,
    u_toe: profile.toneResponse.toe,
    u_gamma: profile.toneResponse.gamma,

    // Layer 2: Color Matrix
    u_colorMatrixEnabled: profile.colorMatrix?.enabled ?? false,
    u_colorMatrix: transpose3x3(profile.colorMatrix?.matrix ?? IDENTITY_3X3),

    // Layer 3: LUT
    u_lutEnabled: profile.lut.enabled && profile.lut.intensity > 0,
    u_lutIntensity: profile.lut.intensity,

    // Layer 4: Color Cast
    u_colorCastEnabled: cc?.enabled ?? false,
    u_colorCastShadows: cc?.shadows ?? [0, 0, 0],
    u_colorCastMidtones: cc?.midtones ?? [0, 0, 0],
    u_colorCastHighlights: cc?.highlights ?? [0, 0, 0],

    // Layer 5: Grain
    u_grainEnabled: profile.grain.enabled && profile.grain.amount > 0,
    u_grainAmount: profile.grain.amount,
    u_grainSize: profile.grain.size,
    u_grainRoughness: profile.grain.roughness,
    u_grainShadowBias: profile.grain.shadowBias,
    u_grainSeed: options?.grainSeed ?? Date.now(),
    u_grainIsColor: profile.grain.colorGrain,

    // Layer 6: Vignette
    u_vignetteEnabled: profile.vignette.enabled && Math.abs(profile.vignette.amount) > 0.001,
    u_vignetteAmount: profile.vignette.amount,
    u_vignetteMidpoint: profile.vignette.midpoint,
    u_vignetteRoundness: profile.vignette.roundness,
  };
}

/**
 * Resolve Halation/Bloom uniforms from a V2 FilmProfile.
 */
export function resolveHalationBloomUniformsV2(profile: FilmProfileV2): HalationBloomUniforms {
  const hal = profile.halation;
  const bloom = profile.bloom;

  return {
    halationEnabled: hal?.enabled ?? false,
    halationThreshold: hal?.threshold ?? 0.9,
    halationIntensity: hal?.intensity ?? 0,
    halationColor: hal?.color ?? [1.0, 0.3, 0.1],
    halationRadius: hal?.radius,

    bloomEnabled: bloom?.enabled ?? false,
    bloomThreshold: bloom?.threshold ?? 0.85,
    bloomIntensity: bloom?.intensity ?? 0,
    bloomRadius: bloom?.radius,
  };
}
