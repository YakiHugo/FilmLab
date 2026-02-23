import { filmProfiles, presetFilmProfileMap } from "@/data/filmProfiles";
import { createDefaultAdjustments } from "@/lib/adjustments";
import type {
  EditingAdjustments,
  FilmModuleConfig,
  FilmProfile,
  FilmProfileOverrides,
  Preset,
} from "@/types";
import {
  cloneFilmProfile,
  createDefaultFilmProfile,
  createFilmProfileFromAdjustments,
  getFilmModule,
  normalizeFilmProfile,
  scaleFilmProfileAmount,
} from "./profile";

const builtInProfileMap = new Map(
  filmProfiles.map((profile) => [profile.id, normalizeFilmProfile(profile)])
);

const EPSILON = 1e-6;
const neutralAdjustmentProfile = createFilmProfileFromAdjustments(createDefaultAdjustments(), {
  id: "runtime-neutral-adjustments",
  name: "Runtime Neutral Adjustments",
});

export const listBuiltInFilmProfiles = () =>
  Array.from(builtInProfileMap.values()).map((profile) => cloneFilmProfile(profile));

export const getBuiltInFilmProfile = (profileId: string) => {
  const profile = builtInProfileMap.get(profileId);
  return profile ? cloneFilmProfile(profile) : null;
};

export const resolvePresetFilmProfile = (preset: Preset | undefined) => {
  if (!preset) {
    return null;
  }
  if (preset.filmProfile) {
    return normalizeFilmProfile(preset.filmProfile);
  }
  const profileId = preset.filmProfileId ?? presetFilmProfileMap[preset.id];
  if (!profileId) {
    return null;
  }
  return getBuiltInFilmProfile(profileId);
};

interface ResolveFilmProfileOptions {
  adjustments: EditingAdjustments;
  presetId?: string;
  filmProfileId?: string;
  filmProfile?: FilmProfile;
  intensity?: number;
  presets?: Preset[];
  fallbackName?: string;
  overrides?: FilmProfileOverrides;
}

const applyFilmProfileOverrides = (profile: FilmProfile, overrides?: FilmProfileOverrides) => {
  if (!overrides || Object.keys(overrides).length === 0) {
    return profile;
  }
  const nextModules = profile.modules.map((module) => {
    const override = overrides[module.id];
    if (!override) {
      return module;
    }
    const nextModule: FilmModuleConfig = {
      ...module,
      enabled: typeof override.enabled === "boolean" ? override.enabled : module.enabled,
      amount: typeof override.amount === "number" ? override.amount : module.amount,
      params: {
        ...module.params,
        ...(override.params ?? {}),
      },
    } as FilmModuleConfig;
    return nextModule;
  });

  return normalizeFilmProfile({
    ...profile,
    modules: nextModules,
  });
};

const extractParamDeltas = (
  runtimeParams: Record<string, unknown>,
  neutralParams: Record<string, unknown>
) => {
  const deltas: Record<string, unknown> = {};
  Object.keys(runtimeParams).forEach((key) => {
    const runtimeValue = runtimeParams[key];
    const neutralValue = neutralParams[key];

    if (typeof runtimeValue === "number" && typeof neutralValue === "number") {
      const delta = runtimeValue - neutralValue;
      if (Math.abs(delta) > EPSILON) {
        deltas[key] = delta;
      }
      return;
    }

    if (
      Array.isArray(runtimeValue) &&
      Array.isArray(neutralValue) &&
      runtimeValue.length === neutralValue.length &&
      runtimeValue.every((value) => typeof value === "number") &&
      neutralValue.every((value) => typeof value === "number")
    ) {
      const deltaArray = runtimeValue.map(
        (value, index) => (value as number) - (neutralValue[index] as number)
      );
      if (deltaArray.some((value) => Math.abs(value) > EPSILON)) {
        deltas[key] = deltaArray;
      }
    }
  });
  return deltas;
};

const applyParamDeltas = (baseParams: Record<string, unknown>, deltas: Record<string, unknown>) => {
  const nextParams: Record<string, unknown> = {
    ...baseParams,
  };

  Object.keys(deltas).forEach((key) => {
    const deltaValue = deltas[key];
    const baseValue = baseParams[key];

    if (typeof deltaValue === "number" && typeof baseValue === "number") {
      nextParams[key] = baseValue + deltaValue;
      return;
    }

    if (
      Array.isArray(deltaValue) &&
      Array.isArray(baseValue) &&
      deltaValue.length === baseValue.length &&
      deltaValue.every((value) => typeof value === "number") &&
      baseValue.every((value) => typeof value === "number")
    ) {
      nextParams[key] = baseValue.map(
        (value, index) => (value as number) + (deltaValue[index] as number)
      );
    }
  });

  return nextParams;
};

const mergeAdjustmentProfileIntoBaseProfile = (
  baseProfile: FilmProfile,
  adjustments: EditingAdjustments
) => {
  const adjustmentProfile = createFilmProfileFromAdjustments(adjustments, {
    id: "runtime-adjustments-overlay",
    name: "Runtime Adjustments Overlay",
  });

  const adjustmentModuleMap = new Map(
    adjustmentProfile.modules.map((module) => [module.id, module])
  );
  const neutralModuleMap = new Map(
    neutralAdjustmentProfile.modules.map((module) => [module.id, module])
  );

  const nextModules = baseProfile.modules.map((module) => {
    const adjustmentModule = adjustmentModuleMap.get(module.id);
    const neutralModule = neutralModuleMap.get(module.id);

    if (!adjustmentModule || !neutralModule) {
      return module;
    }

    const amountDelta = adjustmentModule.amount - neutralModule.amount;
    const paramsDelta = extractParamDeltas(
      adjustmentModule.params as unknown as Record<string, unknown>,
      neutralModule.params as unknown as Record<string, unknown>
    );
    const hasParamDelta = Object.keys(paramsDelta).length > 0;
    const toggledByAdjustment = adjustmentModule.enabled !== neutralModule.enabled;

    if (Math.abs(amountDelta) <= EPSILON && !hasParamDelta && !toggledByAdjustment) {
      return module;
    }

    return {
      ...module,
      enabled: toggledByAdjustment ? adjustmentModule.enabled : module.enabled,
      amount: module.amount + amountDelta,
      params: applyParamDeltas(
        module.params as unknown as Record<string, unknown>,
        paramsDelta
      ) as unknown as FilmModuleConfig["params"],
    } as FilmModuleConfig;
  });

  return normalizeFilmProfile({
    ...baseProfile,
    modules: nextModules,
  });
};

export const resolveFilmProfile = ({
  adjustments,
  presetId,
  filmProfileId,
  filmProfile,
  intensity,
  presets,
  fallbackName,
  overrides,
}: ResolveFilmProfileOptions): FilmProfile => {
  const preset = presetId ? presets?.find((item) => item.id === presetId) : undefined;
  const explicitFilmProfile = filmProfile ? normalizeFilmProfile(filmProfile) : null;
  const explicitProfile = filmProfileId ? getBuiltInFilmProfile(filmProfileId) : null;
  const presetProfile = resolvePresetFilmProfile(preset);
  const baseProfile = explicitFilmProfile ?? explicitProfile ?? presetProfile;

  if (baseProfile) {
    const resolvedIntensity =
      typeof intensity === "number" ? intensity : (preset?.intensity ?? 100);
    const scaledBaseProfile = scaleFilmProfileAmount(baseProfile, resolvedIntensity);
    const mergedProfile = mergeAdjustmentProfileIntoBaseProfile(scaledBaseProfile, adjustments);
    return applyFilmProfileOverrides(mergedProfile, overrides);
  }

  return applyFilmProfileOverrides(
    createFilmProfileFromAdjustments(adjustments, {
      id: presetId ? `runtime-${presetId}` : "runtime-manual-profile",
      name: fallbackName ?? preset?.name ?? "Runtime Film Profile",
    }),
    overrides
  );
};

export const ensureFilmProfile = (profile: FilmProfile | null | undefined) => {
  if (!profile) {
    return createDefaultFilmProfile();
  }
  return normalizeFilmProfile(profile);
};

export const resolveFilmModule = <TId extends FilmModuleConfig["id"]>(
  profile: FilmProfile,
  moduleId: TId
) => getFilmModule(profile, moduleId);
