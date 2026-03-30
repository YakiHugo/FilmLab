import type {
  ColorScienceModule,
  DefectsModule,
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

export const getFilmModule = <TId extends FilmModuleId>(profile: FilmProfile, moduleId: TId) =>
  profile.modules.find((module) => module.id === moduleId) as
    | Extract<FilmModuleConfig, { id: TId }>
    | undefined;
