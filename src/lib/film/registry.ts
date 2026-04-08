import { filmProfiles } from "@/data/filmProfiles";
import { stockFilmProfilesV2 } from "@/data/filmStockProfiles";
import type {
  FilmModuleConfig,
  FilmProfileOverrides,
  Preset,
} from "@/types";
import type { FilmProfileAny } from "@/types/film";
import {
  cloneFilmProfile,
  createDefaultFilmProfile,
  getFilmModule,
  normalizeFilmProfile,
  scaleFilmProfileAmount,
} from "./profile";

const cloneFilmProfileAny = <T extends FilmProfileAny>(profile: T): T => {
  if (profile.version === 1) {
    return cloneFilmProfile(normalizeFilmProfile(profile)) as T;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(profile) as T;
  }
  return JSON.parse(JSON.stringify(profile)) as T;
};

const builtInProfileMap = new Map<string, FilmProfileAny>([
  ...filmProfiles.map((profile) => [profile.id, normalizeFilmProfile(profile)] as const),
  ...stockFilmProfilesV2.map((profile) => [profile.id, cloneFilmProfileAny(profile)] as const),
]);

const applyFilmProfileOverrides = (
  profile: FilmProfileAny,
  overrides?: FilmProfileOverrides
): FilmProfileAny => {
  if (!overrides || Object.keys(overrides).length === 0 || profile.version !== 1) {
    return cloneFilmProfileAny(profile);
  }

  const nextModules = profile.modules.map((module) => {
    const override = overrides[module.id];
    if (!override) {
      return module;
    }
    return {
      ...module,
      enabled: typeof override.enabled === "boolean" ? override.enabled : module.enabled,
      amount: typeof override.amount === "number" ? override.amount : module.amount,
      params: {
        ...module.params,
        ...(override.params ?? {}),
      },
    } as FilmModuleConfig;
  });

  return normalizeFilmProfile({
    ...profile,
    modules: nextModules,
  });
};

export const listBuiltInFilmProfiles = () =>
  Array.from(builtInProfileMap.values()).map((profile) => cloneFilmProfileAny(profile));

export const getBuiltInFilmProfile = (profileId: string): FilmProfileAny | null => {
  const profile = builtInProfileMap.get(profileId);
  return profile ? cloneFilmProfileAny(profile) : null;
};

export const resolvePresetFilmProfile = (preset: Preset | undefined): FilmProfileAny | null => {
  if (!preset) {
    return null;
  }
  if (preset.renderState.film.profile) {
    return cloneFilmProfileAny(preset.renderState.film.profile);
  }
  const profileId = preset.renderState.film.profileId;
  if (!profileId) {
    return null;
  }
  return getBuiltInFilmProfile(profileId);
};

export const resolveFilmProfile = ({
  presetId,
  filmProfileId,
  filmProfile,
  intensity,
  presets,
  overrides,
}: {
  presetId?: string;
  filmProfileId?: string;
  filmProfile?: FilmProfileAny | null;
  intensity?: number;
  presets?: Preset[];
  overrides?: FilmProfileOverrides;
}): FilmProfileAny | null => {
  const preset = presetId ? presets?.find((item) => item.id === presetId) : undefined;
  const explicitProfile = filmProfile ? cloneFilmProfileAny(filmProfile) : null;
  const builtInProfile = filmProfileId ? getBuiltInFilmProfile(filmProfileId) : null;
  const presetProfile = resolvePresetFilmProfile(preset);
  const baseProfile = explicitProfile ?? builtInProfile ?? presetProfile;

  if (!baseProfile) {
    return null;
  }

  const resolvedIntensity = typeof intensity === "number" ? intensity : preset?.intensity;
  const scaledProfile =
    baseProfile.version === 1 && typeof resolvedIntensity === "number"
      ? scaleFilmProfileAmount(baseProfile, resolvedIntensity)
      : cloneFilmProfileAny(baseProfile);

  return applyFilmProfileOverrides(scaledProfile, overrides);
};

export const ensureFilmProfile = (profile: FilmProfileAny | null | undefined): FilmProfileAny => {
  if (!profile) {
    return createDefaultFilmProfile();
  }
  return cloneFilmProfileAny(profile);
};

export const resolveFilmModule = <TId extends FilmModuleConfig["id"]>(
  profile: FilmProfileAny,
  moduleId: TId
) => (profile.version === 1 ? getFilmModule(profile, moduleId) : null);
