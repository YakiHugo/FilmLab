import type { FilmProfile } from "@/types";
import type { FilmProfileAny, FilmProfileV2 } from "@/types/film";
import { getFilmModule, normalizeFilmProfile } from "./profile";

/**
 * Migrate a V1 FilmProfile to V2 format.
 *
 * Maps the 5-module system (colorScience, tone, scan, grain, defects)
 * into the 6-layer model. Missing V2 fields are filled with sensible
 * defaults derived from the V1 data where possible.
 *
 * The migration is lossless: no V1 information is discarded.
 */
export function migrateFilmProfileV1ToV2(v1: FilmProfile): FilmProfileV2 {
  const normalized = normalizeFilmProfile(v1);
  const scan = getFilmModule(normalized, "scan");
  const grain = getFilmModule(normalized, "grain");
  const colorScience = getFilmModule(normalized, "colorScience");
  const defects = getFilmModule(normalized, "defects");

  const scanAmount = scan?.enabled ? scan.amount / 100 : 0;
  const grainAmount = grain?.enabled ? grain.amount / 100 : 0;
  const defectsAmount = defects?.enabled ? defects.amount / 100 : 0;

  // Derive type from tags (best-effort; V1 didn't have an explicit type)
  let filmType: FilmProfileV2["type"] = "negative";
  if (v1.tags?.includes("bw")) filmType = "bw";
  else if (v1.tags?.includes("slide")) filmType = "slide";
  else if (v1.tags?.includes("instant")) filmType = "instant";

  // Derive color cast from scanWarmth (V1's only color-shift param)
  const warmth = (scan?.params.scanWarmth ?? 0) / 100;
  const warmthScale = warmth * 0.12 * scanAmount;

  return {
    id: v1.id,
    version: 2,
    name: v1.name,
    description: v1.description,
    type: filmType,
    tags: v1.tags,

    // Layer 1: Tone Response — V1 has no explicit S-curve, use defaults
    toneResponse: {
      enabled: true,
      shoulder: 0.8,
      toe: 0.3,
      gamma: 1.0,
    },

    // Layer 2: Color Matrix — derived from colorScience.rgbMix as diagonal
    colorMatrix:
      colorScience?.enabled &&
      (colorScience.params.rgbMix[0] !== 1 ||
        colorScience.params.rgbMix[1] !== 1 ||
        colorScience.params.rgbMix[2] !== 1)
        ? {
            enabled: true,
            matrix: [
              colorScience.params.rgbMix[0],
              0,
              0,
              0,
              colorScience.params.rgbMix[1],
              0,
              0,
              0,
              colorScience.params.rgbMix[2],
            ],
          }
        : undefined,

    // Layer 3: LUT — V1 has no real LUT support, disabled
    lut: {
      enabled: false,
      path: "",
      size: 8,
      intensity: colorScience?.params.lutStrength ?? 0.35,
    },

    // Layer 4: Color Cast — derived from scanWarmth
    colorCast:
      Math.abs(warmthScale) > 0.001
        ? {
            enabled: true,
            shadows: [warmthScale * 0.5, 0, -warmthScale * 0.5],
            midtones: [warmthScale * 0.3, 0, -warmthScale * 0.3],
            highlights: [warmthScale * 0.1, 0, -warmthScale * 0.1],
          }
        : undefined,

    // Layer 5: Halation — mapped from scan module
    halation: {
      enabled: scanAmount > 0 && (scan?.params.halationAmount ?? 0) > 0.001,
      intensity: (scan?.params.halationAmount ?? 0) * scanAmount,
      threshold: scan?.params.halationThreshold ?? 0.9,
      color: [1.0, 0.3, 0.1], // Classic warm halation tint
      radius: Math.max(1, (scan?.params.halationAmount ?? 0) * 8),
    },

    // Layer 5: Bloom — mapped from scan module
    bloom: {
      enabled: scanAmount > 0 && (scan?.params.bloomAmount ?? 0) > 0.001,
      intensity: (scan?.params.bloomAmount ?? 0) * scanAmount,
      threshold: scan?.params.bloomThreshold ?? 0.85,
      radius: Math.max(1, (scan?.params.bloomAmount ?? 0) * 10),
    },

    // Layer 6: Grain
    grain: {
      enabled: grainAmount > 0 && (grain?.params.amount ?? 0) > 0,
      amount: (grain?.params.amount ?? 0) * grainAmount,
      size: grain?.params.size ?? 0.5,
      colorGrain: (grain?.params.color ?? 0.08) > 0.01,
      roughness: grain?.params.roughness ?? 0.5,
      shadowBias: grain?.params.shadowBoost ?? 0.45,
    },

    // Layer 6: Vignette
    vignette: {
      enabled: scanAmount > 0 && Math.abs(scan?.params.vignetteAmount ?? 0) > 0.001,
      amount: (scan?.params.vignetteAmount ?? 0) * scanAmount,
      midpoint: 0.5,
      roundness: 0.5,
    },

    // Defects — preserve V1 defects data so migration is lossless
    defects: defects
      ? {
            enabled: defects.enabled && defectsAmount > 0,
            leakProbability: (defects.params.leakProbability ?? 0) * (defectsAmount || 1),
            leakStrength: (defects.params.leakStrength ?? 0) * (defectsAmount || 1),
            dustAmount: (defects.params.dustAmount ?? 0) * (defectsAmount || 1),
            scratchAmount: (defects.params.scratchAmount ?? 0) * (defectsAmount || 1),
          }
      : undefined,
  };
}

/** Type guard: returns true when the profile is already V2 format. */
function isFilmProfileV2(profile: FilmProfileAny): profile is FilmProfileV2 {
  return profile.version === 2;
}

/**
 * Auto-detect profile version and ensure V2 format.
 *
 * - V2 profiles pass through unchanged.
 * - V1 profiles are migrated via `migrateFilmProfileV1ToV2`.
 */
export function ensureFilmProfileV2(profile: FilmProfileAny): FilmProfileV2 {
  if (isFilmProfileV2(profile)) {
    return profile;
  }
  return migrateFilmProfileV1ToV2(profile);
}
