import { applyPresetAdjustments, createDefaultAdjustments } from "@/lib/adjustments";
import { resolveFilmProfile as resolveRuntimeFilmProfile } from "@/lib/film";
import type {
  EditingAdjustments,
  FilmProfile,
  FilmProfileOverrides,
  Preset,
  PresetAdjustments,
} from "@/types";
import { CUSTOM_PRESETS_KEY, PRESET_ADJUSTMENT_KEYS } from "./constants";

export const loadCustomPresets = () => {
  if (typeof window === "undefined") {
    return [] as Preset[];
  }
  const stored = window.localStorage.getItem(CUSTOM_PRESETS_KEY);
  if (!stored) {
    return [] as Preset[];
  }
  try {
    const parsed = JSON.parse(stored) as Preset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as Preset[];
  }
};

export const persistCustomPresets = (customPresets: Preset[]) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets));
};

export const buildCustomAdjustments = (adjustments: EditingAdjustments) => {
  const base = createDefaultAdjustments();
  return PRESET_ADJUSTMENT_KEYS.reduce<PresetAdjustments>((result, key) => {
    const delta = adjustments[key] - base[key];
    if (Math.abs(delta) >= 1) {
      result[key] = delta;
    }
    return result;
  }, {});
};

export const resolveAdjustments = (
  adjustments: EditingAdjustments | undefined,
  presetId: string | undefined,
  intensity: number | undefined,
  presets: Preset[],
) => {
  const base = adjustments ?? createDefaultAdjustments();
  if (!presetId) {
    return base;
  }
  const preset = presets.find((item) => item.id === presetId);
  if (!preset) {
    return base;
  }
  const resolvedIntensity =
    typeof intensity === "number" ? intensity : preset.intensity;
  return applyPresetAdjustments(base, preset.adjustments, resolvedIntensity);
};

export const resolveFilmProfile = (
  adjustments: EditingAdjustments | undefined,
  presetId: string | undefined,
  filmProfileId: string | undefined,
  filmProfile: FilmProfile | undefined,
  intensity: number | undefined,
  presets: Preset[],
  overrides?: FilmProfileOverrides,
): FilmProfile | null => {
  if (!adjustments) {
    return null;
  }
  return resolveRuntimeFilmProfile({
    adjustments,
    presetId,
    filmProfileId,
    filmProfile,
    intensity,
    presets,
    overrides,
  });
};
