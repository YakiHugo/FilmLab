import { filmProfiles, presetFilmProfileMap } from "@/data/filmProfiles";
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

const applyFilmProfileOverrides = (
  profile: FilmProfile,
  overrides?: FilmProfileOverrides
) => {
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
      enabled:
        typeof override.enabled === "boolean" ? override.enabled : module.enabled,
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
    return applyFilmProfileOverrides(
      scaleFilmProfileAmount(baseProfile, resolvedIntensity),
      overrides
    );
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
