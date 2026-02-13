import type { EditingAdjustments, FilmProfile } from "@/types";
import type { MasterUniforms, FilmUniforms } from "./types";
import { getFilmModule, normalizeFilmProfile } from "@/lib/film/profile";

/**
 * Map EditingAdjustments to MasterUniforms for the Master shader pass.
 *
 * The Master shader operates in linear space with scientific color models
 * (OKLab HSL, LMS white balance) instead of the RGB approximations in the
 * legacy shader. Parameter ranges are preserved for UI compatibility.
 */
export function resolveFromAdjustments(
  adj: EditingAdjustments
): MasterUniforms {
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

  const toneAmount = tone?.enabled ? (tone.amount / 100) : 0;
  const grainAmount = grain?.enabled ? (grain.amount / 100) : 0;
  const scanAmount = scan?.enabled ? (scan.amount / 100) : 0;

  return {
    // Layer 1: Tone Response
    // Map from legacy tone module -- derive S-curve params from tone settings
    u_toneEnabled: toneAmount > 0,
    u_shoulder: 0.8, // Default shoulder (could derive from highlights/whites)
    u_toe: 0.3, // Default toe (could derive from shadows/blacks)
    u_gamma: 1.0,

    // Layer 3: LUT (not available in v1 profiles, disabled by default)
    u_lutEnabled: false,
    u_lutIntensity: 0.0,

    // Layer 6: Grain
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
