import { presets as basePresets } from "@/data/presets";
import { applyPresetAdjustments, createDefaultAdjustments } from "@/lib/adjustments";
import {
  normalizeFilmProfile,
  resolveFilmProfile as resolveRuntimeFilmProfile,
} from "@/lib/film";
import type {
  EditingAdjustments,
  FilmProfile,
  FilmProfileOverrides,
  Preset,
  PresetAdjustmentKey,
  PresetAdjustments,
} from "@/types";

export const CUSTOM_PRESETS_KEY = "filmlab.customPresets";

const presetAdjustmentKeys: PresetAdjustmentKey[] = [
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "temperature",
  "tint",
  "vibrance",
  "saturation",
  "clarity",
  "dehaze",
  "vignette",
  "grain",
];

const isPresetLike = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.adjustments === "object"
  );
};

export const loadCustomPresets = () => {
  if (typeof window === "undefined") {
    return [] as Preset[];
  }
  const stored = window.localStorage.getItem(CUSTOM_PRESETS_KEY);
  if (!stored) {
    return [] as Preset[];
  }
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as Preset[];
    }
    return normalizeImportedPresets(parsed);
  } catch {
    return [] as Preset[];
  }
};

export const saveCustomPresets = (presets: Preset[]) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
};

export const buildCustomAdjustments = (adjustments: EditingAdjustments) => {
  const base = createDefaultAdjustments();
  return presetAdjustmentKeys.reduce<PresetAdjustments>((result, key) => {
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
  presets: Preset[]
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
  overrides?: FilmProfileOverrides
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

export const mergePresetsById = (current: Preset[], incoming: Preset[]) => {
  if (incoming.length === 0) {
    return current;
  }
  const existing = new Map(current.map((preset) => [preset.id, preset]));
  incoming.forEach((preset) => {
    existing.set(preset.id, preset);
  });
  return Array.from(existing.values());
};

export const normalizeImportedPresets = (parsed: unknown): Preset[] => {
  const incoming = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { presets?: unknown }).presets)
      ? (parsed as { presets: unknown[] }).presets
      : [];

  const defaultTags = basePresets[0]?.tags ?? ([] as Preset["tags"]);
  const fallbackIntensity = basePresets[0]?.intensity ?? 100;
  const fallbackDescription = basePresets[0]?.description ?? "Imported preset";
  const timestamp = Date.now();

  return incoming
    .filter(isPresetLike)
    .map((preset, index) => {
      const rawTags = Array.isArray(preset.tags)
        ? preset.tags.filter((tag): tag is string => typeof tag === "string")
        : [];

      const normalizedFilmProfile = (() => {
        if (!preset.filmProfile || typeof preset.filmProfile !== "object") {
          return undefined;
        }
        try {
          return normalizeFilmProfile(preset.filmProfile as FilmProfile);
        } catch {
          return undefined;
        }
      })();

      return {
        id: (preset.id as string) || `imported-${timestamp}-${index}`,
        name: (preset.name as string) || `Imported preset ${index + 1}`,
        tags: (rawTags.length > 0
          ? rawTags
          : defaultTags) as Preset["tags"],
        intensity:
          typeof preset.intensity === "number"
            ? preset.intensity
            : fallbackIntensity,
        description:
          typeof preset.description === "string"
            ? preset.description
            : fallbackDescription,
        adjustments: (preset.adjustments as Preset["adjustments"]) ?? {},
        filmProfileId:
          typeof preset.filmProfileId === "string"
            ? preset.filmProfileId
            : undefined,
        filmProfile: normalizedFilmProfile,
      };
    });
};
