import type {
  ColorScienceModule,
  DefectsModule,
  EditingAdjustments,
  FilmModuleConfig,
  FilmModuleId,
  FilmProfile,
  GrainModule,
  ScanModule,
  ToneModule,
} from "@/types";
import { clamp } from "./utils";

const FILM_PROFILE_VERSION = 1 as const;

const MODULE_ORDER: FilmModuleId[] = ["colorScience", "tone", "scan", "grain", "defects"];

const createDefaultColorScienceModule = (): ColorScienceModule => ({
  id: "colorScience",
  enabled: true,
  amount: 100,
  seedMode: "perAsset",
  params: {
    lutStrength: 0.35,
    rgbMix: [1, 1, 1],
    temperatureShift: 0,
    tintShift: 0,
  },
});

const createDefaultToneModule = (): ToneModule => ({
  id: "tone",
  enabled: true,
  amount: 100,
  params: {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    curveHighlights: 0,
    curveLights: 0,
    curveDarks: 0,
    curveShadows: 0,
  },
});

const createDefaultScanModule = (): ScanModule => ({
  id: "scan",
  enabled: true,
  amount: 100,
  seedMode: "perAsset",
  params: {
    halationThreshold: 0.88,
    halationAmount: 0.16,
    bloomThreshold: 0.82,
    bloomAmount: 0.12,
    vignetteAmount: 0,
    scanWarmth: 0,
  },
});

const createDefaultGrainModule = (): GrainModule => ({
  id: "grain",
  enabled: true,
  amount: 100,
  seedMode: "perAsset",
  params: {
    amount: 0,
    size: 0.5,
    roughness: 0.5,
    color: 0.08,
    shadowBoost: 0.45,
  },
});

const createDefaultDefectsModule = (): DefectsModule => ({
  id: "defects",
  enabled: false,
  amount: 40,
  seedMode: "perRender",
  params: {
    leakProbability: 0.2,
    leakStrength: 0.16,
    dustAmount: 0.12,
    scratchAmount: 0.08,
  },
});

export const createDefaultFilmModules = (): FilmModuleConfig[] => [
  createDefaultColorScienceModule(),
  createDefaultToneModule(),
  createDefaultScanModule(),
  createDefaultGrainModule(),
  createDefaultDefectsModule(),
];

const cloneModule = (module: FilmModuleConfig): FilmModuleConfig => {
  switch (module.id) {
    case "colorScience":
      return {
        ...module,
        params: {
          ...module.params,
          rgbMix: [...module.params.rgbMix] as [number, number, number],
        },
      };
    case "tone":
      return {
        ...module,
        params: {
          ...module.params,
        },
      };
    case "scan":
      return {
        ...module,
        params: {
          ...module.params,
        },
      };
    case "grain":
      return {
        ...module,
        params: {
          ...module.params,
        },
      };
    case "defects":
      return {
        ...module,
        params: {
          ...module.params,
        },
      };
    default:
      return module;
  }
};

export const cloneFilmProfile = (profile: FilmProfile): FilmProfile => ({
  ...profile,
  tags: profile.tags ? [...profile.tags] : undefined,
  modules: profile.modules.map((module) => cloneModule(module)),
});

const normalizeModule = (module: FilmModuleConfig): FilmModuleConfig => {
  switch (module.id) {
    case "colorScience": {
      const fallback = createDefaultColorScienceModule();
      return {
        ...fallback,
        ...module,
        amount: clamp(module.amount, 0, 100),
        params: {
          ...fallback.params,
          ...module.params,
          lutStrength: clamp(module.params.lutStrength, 0, 1),
          rgbMix: [
            clamp(module.params.rgbMix[0], 0.5, 1.5),
            clamp(module.params.rgbMix[1], 0.5, 1.5),
            clamp(module.params.rgbMix[2], 0.5, 1.5),
          ],
          temperatureShift: clamp(module.params.temperatureShift, -100, 100),
          tintShift: clamp(module.params.tintShift, -100, 100),
        },
      };
    }
    case "tone": {
      const fallback = createDefaultToneModule();
      return {
        ...fallback,
        ...module,
        amount: clamp(module.amount, 0, 100),
        params: {
          ...fallback.params,
          ...module.params,
          exposure: clamp(module.params.exposure, -100, 100),
          contrast: clamp(module.params.contrast, -100, 100),
          highlights: clamp(module.params.highlights, -100, 100),
          shadows: clamp(module.params.shadows, -100, 100),
          whites: clamp(module.params.whites, -100, 100),
          blacks: clamp(module.params.blacks, -100, 100),
          curveHighlights: clamp(module.params.curveHighlights, -100, 100),
          curveLights: clamp(module.params.curveLights, -100, 100),
          curveDarks: clamp(module.params.curveDarks, -100, 100),
          curveShadows: clamp(module.params.curveShadows, -100, 100),
        },
      };
    }
    case "scan": {
      const fallback = createDefaultScanModule();
      return {
        ...fallback,
        ...module,
        amount: clamp(module.amount, 0, 100),
        params: {
          ...fallback.params,
          ...module.params,
          halationThreshold: clamp(module.params.halationThreshold, 0.5, 1),
          halationAmount: clamp(module.params.halationAmount, 0, 1),
          bloomThreshold: clamp(module.params.bloomThreshold, 0.4, 1),
          bloomAmount: clamp(module.params.bloomAmount, 0, 1),
          vignetteAmount: clamp(module.params.vignetteAmount, -1, 1),
          scanWarmth: clamp(module.params.scanWarmth, -100, 100),
        },
      };
    }
    case "grain": {
      const fallback = createDefaultGrainModule();
      return {
        ...fallback,
        ...module,
        amount: clamp(module.amount, 0, 100),
        params: {
          ...fallback.params,
          ...module.params,
          amount: clamp(module.params.amount, 0, 1),
          size: clamp(module.params.size, 0, 1),
          roughness: clamp(module.params.roughness, 0, 1),
          color: clamp(module.params.color, 0, 1),
          shadowBoost: clamp(module.params.shadowBoost, 0, 1),
        },
      };
    }
    case "defects": {
      const fallback = createDefaultDefectsModule();
      return {
        ...fallback,
        ...module,
        amount: clamp(module.amount, 0, 100),
        params: {
          ...fallback.params,
          ...module.params,
          leakProbability: clamp(module.params.leakProbability, 0, 1),
          leakStrength: clamp(module.params.leakStrength, 0, 1),
          dustAmount: clamp(module.params.dustAmount, 0, 1),
          scratchAmount: clamp(module.params.scratchAmount, 0, 1),
        },
      };
    }
    default:
      return module;
  }
};

const moduleById = (modules: FilmModuleConfig[]) => {
  const map = new Map<FilmModuleId, FilmModuleConfig>();
  modules.forEach((module) => {
    map.set(module.id, module);
  });
  return map;
};

// Single-entry memoization cache for normalizeFilmProfile.
// During render the same profile reference is passed to resolveFilmUniforms
// and resolveHalationBloomUniforms, so this avoids redundant cloning/normalization.
let _lastNFPInput: FilmProfile | null = null;
let _lastNFPOutput: FilmProfile | undefined;

export const normalizeFilmProfile = (profile: FilmProfile): FilmProfile => {
  if (profile === _lastNFPInput && _lastNFPOutput) {
    return _lastNFPOutput;
  }
  const result = normalizeFilmProfileUncached(profile);
  _lastNFPInput = profile;
  _lastNFPOutput = result;
  return result;
};

const normalizeFilmProfileUncached = (profile: FilmProfile): FilmProfile => {
  const fallbackModules = moduleById(createDefaultFilmModules());
  const incomingModules = moduleById(profile.modules);
  const modules = MODULE_ORDER.map((moduleId) => {
    const candidate = incomingModules.get(moduleId) ?? fallbackModules.get(moduleId);
    if (!candidate) {
      throw new Error(`Missing fallback module for ${moduleId}.`);
    }
    return normalizeModule(cloneModule(candidate));
  });
  return {
    ...profile,
    name: profile.name,
    description: profile.description,
    version: FILM_PROFILE_VERSION,
    modules,
  };
};

export const createDefaultFilmProfile = (
  id = "filmlab-neutral-v1",
  name = "Neutral Film"
): FilmProfile =>
  normalizeFilmProfile({
    id,
    version: FILM_PROFILE_VERSION,
    name,
    modules: createDefaultFilmModules(),
  });

export const scaleFilmProfileAmount = (profile: FilmProfile, intensity: number) => {
  const ratio = clamp(intensity, 0, 100) / 100;
  return normalizeFilmProfile({
    ...profile,
    modules: profile.modules.map((module) => ({
      ...module,
      amount: clamp(module.amount * ratio, 0, 100),
    })),
  });
};

const averageHslSaturation = (adjustments: EditingAdjustments) => {
  const channels = Object.values(adjustments.hsl);
  const total = channels.reduce((sum, channel) => sum + channel.saturation, 0);
  return total / Math.max(1, channels.length);
};

export const createFilmProfileFromAdjustments = (
  adjustments: EditingAdjustments,
  options?: {
    id?: string;
    name?: string;
  }
): FilmProfile => {
  const warmFactor = adjustments.temperature / 100;
  const tintFactor = adjustments.tint / 100;
  const hslAverage = averageHslSaturation(adjustments) / 100;
  const redSat = adjustments.hsl.red.saturation / 100;
  const blueSat = adjustments.hsl.blue.saturation / 100;

  const defectsEnergy = clamp(
    Math.max(0, adjustments.texture) * 0.42 +
      Math.max(0, adjustments.clarity) * 0.3 +
      Math.max(0, adjustments.dehaze) * 0.28,
    0,
    100
  );

  const profile: FilmProfile = {
    id: options?.id ?? "runtime-adjustments-profile",
    version: FILM_PROFILE_VERSION,
    name: options?.name ?? "Runtime Film Profile",
    modules: [
      {
        id: "colorScience",
        enabled: true,
        amount: 100,
        seedMode: "perAsset",
        params: {
          lutStrength: clamp(
            0.32 + adjustments.saturation / 280 + adjustments.vibrance / 260,
            0,
            1
          ),
          rgbMix: [
            clamp(1 + warmFactor * 0.1 + redSat * 0.08 + hslAverage * 0.06, 0.7, 1.35),
            clamp(1 - Math.abs(tintFactor) * 0.06 + hslAverage * 0.04, 0.7, 1.35),
            clamp(1 - warmFactor * 0.1 + blueSat * 0.08 + hslAverage * 0.06, 0.7, 1.35),
          ],
          temperatureShift: adjustments.temperature,
          tintShift: adjustments.tint,
        },
      },
      {
        id: "tone",
        enabled: true,
        amount: 100,
        params: {
          exposure: adjustments.exposure,
          contrast: adjustments.contrast,
          highlights: adjustments.highlights,
          shadows: adjustments.shadows,
          whites: adjustments.whites,
          blacks: adjustments.blacks,
          curveHighlights: adjustments.curveHighlights,
          curveLights: adjustments.curveLights,
          curveDarks: adjustments.curveDarks,
          curveShadows: adjustments.curveShadows,
        },
      },
      {
        id: "scan",
        enabled: true,
        amount: 100,
        seedMode: "perAsset",
        params: {
          halationThreshold: clamp(0.9 - adjustments.highlights / 500, 0.65, 0.98),
          halationAmount: clamp(
            Math.max(0, adjustments.highlights) / 260 + Math.max(0, adjustments.whites) / 380,
            0,
            1
          ),
          bloomThreshold: clamp(0.85 - adjustments.whites / 520, 0.55, 0.98),
          bloomAmount: clamp(
            Math.max(0, adjustments.whites) / 260 + Math.max(0, adjustments.dehaze) / 600,
            0,
            1
          ),
          vignetteAmount: clamp(adjustments.vignette / 100, -1, 1),
          scanWarmth: adjustments.temperature,
        },
      },
      {
        id: "grain",
        enabled: adjustments.grain > 0,
        amount: Math.max(0, adjustments.grain),
        seedMode: "perAsset",
        params: {
          amount: clamp(adjustments.grain / 100, 0, 1),
          size: clamp(adjustments.grainSize / 100, 0, 1),
          roughness: clamp(adjustments.grainRoughness / 100, 0, 1),
          color: clamp(0.05 + adjustments.grainRoughness / 140, 0, 1),
          shadowBoost: clamp(
            0.35 + (100 - adjustments.shadows) / 400 + adjustments.grainRoughness / 260,
            0,
            1
          ),
        },
      },
      {
        id: "defects",
        enabled: defectsEnergy > 6,
        amount: defectsEnergy,
        seedMode: "perRender",
        params: {
          leakProbability: clamp(
            (Math.max(0, adjustments.highlights) + Math.max(0, adjustments.whites)) / 280,
            0,
            1
          ),
          leakStrength: clamp(
            Math.max(0, adjustments.vignette) / 220 + Math.max(0, adjustments.temperature) / 400,
            0,
            1
          ),
          dustAmount: clamp(Math.max(0, adjustments.texture) / 120, 0, 1),
          scratchAmount: clamp(Math.max(0, adjustments.clarity) / 180, 0, 1),
        },
      },
    ],
  };

  return normalizeFilmProfile(profile);
};

export const getFilmModule = <TId extends FilmModuleId>(profile: FilmProfile, moduleId: TId) =>
  profile.modules.find((module) => module.id === moduleId) as
    | Extract<FilmModuleConfig, { id: TId }>
    | undefined;
