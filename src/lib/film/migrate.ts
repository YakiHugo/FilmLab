import type { FilmProfile } from "@/types";
import type { FilmProfileAny, FilmProfileV2, FilmProfileV3 } from "@/types/film";
import { getFilmModule, normalizeFilmProfile } from "./profile";

export function migrateFilmProfileV1ToV2(v1: FilmProfile): FilmProfileV2 {
  const normalized = normalizeFilmProfile(v1);
  const scan = getFilmModule(normalized, "scan");
  const grain = getFilmModule(normalized, "grain");
  const colorScience = getFilmModule(normalized, "colorScience");
  const defects = getFilmModule(normalized, "defects");

  const scanAmount = scan?.enabled ? scan.amount / 100 : 0;
  const grainAmount = grain?.enabled ? grain.amount / 100 : 0;
  const defectsAmount = defects?.enabled ? defects.amount / 100 : 0;

  let filmType: FilmProfileV2["type"] = "negative";
  if (v1.tags?.includes("bw")) filmType = "bw";
  else if (v1.tags?.includes("slide")) filmType = "slide";
  else if (v1.tags?.includes("instant")) filmType = "instant";

  const warmth = (scan?.params.scanWarmth ?? 0) / 100;
  const warmthScale = warmth * 0.12 * scanAmount;

  return {
    id: v1.id,
    version: 2,
    name: v1.name,
    description: v1.description,
    type: filmType,
    tags: v1.tags,
    toneResponse: {
      enabled: true,
      shoulder: 0.8,
      toe: 0.3,
      gamma: 1.0,
    },
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
    lut: {
      enabled: false,
      path: "",
      size: 8,
      intensity: colorScience?.params.lutStrength ?? 0.35,
    },
    colorCast:
      Math.abs(warmthScale) > 0.001
        ? {
            enabled: true,
            shadows: [warmthScale * 0.5, 0, -warmthScale * 0.5],
            midtones: [warmthScale * 0.3, 0, -warmthScale * 0.3],
            highlights: [warmthScale * 0.1, 0, -warmthScale * 0.1],
          }
        : undefined,
    halation: {
      enabled: scanAmount > 0 && (scan?.params.halationAmount ?? 0) > 0.001,
      intensity: (scan?.params.halationAmount ?? 0) * scanAmount,
      threshold: scan?.params.halationThreshold ?? 0.9,
      color: [1.0, 0.3, 0.1],
      radius: Math.max(1, (scan?.params.halationAmount ?? 0) * 8),
    },
    bloom: {
      enabled: scanAmount > 0 && (scan?.params.bloomAmount ?? 0) > 0.001,
      intensity: (scan?.params.bloomAmount ?? 0) * scanAmount,
      threshold: scan?.params.bloomThreshold ?? 0.85,
      radius: Math.max(1, (scan?.params.bloomAmount ?? 0) * 10),
    },
    grain: {
      enabled: grainAmount > 0 && (grain?.params.amount ?? 0) > 0,
      amount: (grain?.params.amount ?? 0) * grainAmount,
      size: grain?.params.size ?? 0.5,
      colorGrain: (grain?.params.color ?? 0.08) > 0.01,
      roughness: grain?.params.roughness ?? 0.5,
      shadowBias: grain?.params.shadowBoost ?? 0.45,
    },
    vignette: {
      enabled: scanAmount > 0 && Math.abs(scan?.params.vignetteAmount ?? 0) > 0.001,
      amount: (scan?.params.vignetteAmount ?? 0) * scanAmount,
      midpoint: 0.5,
      roundness: 0.5,
    },
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

export function migrateFilmProfileV2ToV3(v2: FilmProfileV2): FilmProfileV3 {
  const grain = v2.grain;
  return {
    id: v2.id,
    version: 3,
    name: v2.name,
    description: v2.description,
    type: v2.type,
    tags: v2.tags,
    expand: {
      enabled: false,
      blackPoint: 0,
      whitePoint: 1,
    },
    filmCompression: {
      enabled: false,
      highlightRolloff: 0.4,
      shoulderWidth: 0.4,
    },
    filmDeveloper: {
      enabled: false,
      contrast: 0,
      gamma: 1,
      colorSeparation: [1, 1, 1],
    },
    toneResponse: { ...v2.toneResponse },
    colorMatrix: v2.colorMatrix ? { ...v2.colorMatrix } : undefined,
    lut3d: {
      enabled: v2.lut.enabled,
      path: v2.lut.path,
      size: v2.lut.size,
      intensity: v2.lut.intensity,
    },
    pushPull: {
      enabled: false,
      ev: 0,
      minEv: -2,
      maxEv: 2,
    },
    print: {
      enabled: false,
      stock: "kodak-2383",
      density: 0,
      contrast: 0,
      warmth: 0,
      targetWhiteKelvin: 6500,
    },
    cmyColorHead: {
      enabled: false,
      cyan: 0,
      magenta: 0,
      yellow: 0,
    },
    colorCast: v2.colorCast
      ? {
          enabled: v2.colorCast.enabled,
          shadows: [...v2.colorCast.shadows] as [number, number, number],
          midtones: [...v2.colorCast.midtones] as [number, number, number],
          highlights: [...v2.colorCast.highlights] as [number, number, number],
        }
      : undefined,
    printToning: {
      enabled: false,
      shadows: [0, 0, 0],
      midtones: [0, 0, 0],
      highlights: [0, 0, 0],
      strength: 0.35,
    },
    halation: {
      enabled: v2.halation?.enabled ?? false,
      intensity: v2.halation?.intensity ?? 0,
      threshold: v2.halation?.threshold ?? 0.9,
      radius: v2.halation?.radius ?? 3,
      hue: 16,
      saturation: 0.75,
      blueCompensation: 0.2,
    },
    bloom: {
      enabled: v2.bloom?.enabled ?? false,
      intensity: v2.bloom?.intensity ?? 0,
      threshold: v2.bloom?.threshold ?? 0.85,
      radius: v2.bloom?.radius ?? 4,
    },
    grain: {
      enabled: grain.enabled,
      model: "blue-noise",
      amount: grain.amount,
      size: grain.size,
      colorGrain: grain.colorGrain,
      roughness: grain.roughness,
      shadowBias: grain.shadowBias,
      crystalDensity: 0.5,
      crystalSizeMean: 0.5,
      crystalSizeVariance: 0.35,
      colorSeparation: [1, 1, 1],
      scannerMTF: 0.55,
      filmFormat: "35mm",
    },
    vignette: { ...v2.vignette },
    glow: {
      enabled: false,
      intensity: 0,
      midtoneFocus: 0.5,
      bias: 0.25,
      radius: 4,
    },
    filmBreath: {
      enabled: false,
      amount: 0,
    },
    gateWeave: {
      enabled: false,
      amount: 0,
      seed: 0,
    },
    filmDamage: {
      enabled: false,
      amount: 0,
    },
    overscan: {
      enabled: false,
      amount: 0,
      roundness: 0.5,
    },
    customLut: {
      enabled: false,
      path: "",
      size: 8,
      intensity: 0,
    },
    defects: v2.defects ? { ...v2.defects } : undefined,
  };
}

function isFilmProfileV2(profile: FilmProfileAny): profile is FilmProfileV2 {
  return (profile as FilmProfileV2).version === 2;
}

function isFilmProfileV3(profile: FilmProfileAny): profile is FilmProfileV3 {
  return (profile as FilmProfileV3).version === 3;
}

export function ensureFilmProfileV2(profile: FilmProfileAny): FilmProfileV2 {
  if (isFilmProfileV2(profile)) {
    return profile;
  }
  if (isFilmProfileV3(profile)) {
    return {
      id: profile.id,
      version: 2,
      name: profile.name,
      description: profile.description,
      type: profile.type,
      tags: profile.tags,
      toneResponse: { ...profile.toneResponse },
      colorMatrix: profile.colorMatrix ? { ...profile.colorMatrix } : undefined,
      lut: {
        enabled: profile.lut3d.enabled,
        path: profile.lut3d.path,
        size: profile.lut3d.size,
        intensity: profile.lut3d.intensity,
      },
      colorCast: profile.colorCast
        ? {
            enabled: profile.colorCast.enabled,
            shadows: [...profile.colorCast.shadows] as [number, number, number],
            midtones: [...profile.colorCast.midtones] as [number, number, number],
            highlights: [...profile.colorCast.highlights] as [number, number, number],
          }
        : undefined,
      halation: profile.halation
        ? {
            enabled: profile.halation.enabled,
            intensity: profile.halation.intensity,
            threshold: profile.halation.threshold,
            color: [1.0, 0.3, 0.1],
            radius: profile.halation.radius,
          }
        : undefined,
      bloom: profile.bloom ? { ...profile.bloom } : undefined,
      grain: {
        enabled: profile.grain.enabled,
        amount: profile.grain.amount,
        size: profile.grain.size,
        colorGrain: profile.grain.colorGrain,
        roughness: profile.grain.roughness,
        shadowBias: profile.grain.shadowBias,
      },
      vignette: { ...profile.vignette },
      defects: profile.defects ? { ...profile.defects } : undefined,
    };
  }
  return migrateFilmProfileV1ToV2(profile);
}

export function ensureFilmProfileV3(profile: FilmProfileAny): FilmProfileV3 {
  if (isFilmProfileV3(profile)) {
    return profile;
  }
  if (isFilmProfileV2(profile)) {
    return migrateFilmProfileV2ToV3(profile);
  }
  return migrateFilmProfileV2ToV3(migrateFilmProfileV1ToV2(profile));
}
