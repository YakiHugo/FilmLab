import { normalizeAdjustments } from "@/lib/adjustments";
import { getStockFilmProfileV2ById } from "@/data/filmStockProfiles";
import type { EditingAdjustments, FilmProfile } from "@/types";
import type {
  FilmProfileAny,
  FilmProfileV2,
  FilmProfileV3,
  ResolvedRenderProfile,
} from "@/types/film";
import { ensureFilmProfileV2, ensureFilmProfileV3 } from "./migrate";
import { createFilmProfileFromAdjustments } from "./profile";
import { ensureFilmProfile } from "./registry";

const isFilmProfileV2 = (profile: FilmProfileAny | null | undefined): profile is FilmProfileV2 =>
  Boolean(profile && profile.version === 2);

const isFilmProfileV3 = (profile: FilmProfileAny | null | undefined): profile is FilmProfileV3 =>
  Boolean(profile && profile.version === 3);

const resolveAssetPath = (rawPath: string): string => {
  const normalized = rawPath.replace(/^\/+/, "");
  const baseUrl = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "/");
  return `${baseUrl}${normalized}`;
};

const resolveLUT = (profile: FilmProfileV3): { path: string; size: 8 | 16; intensity: number } | null => {
  if (!profile.lut3d.enabled || profile.lut3d.intensity <= 0) {
    return null;
  }
  const rawPath = profile.lut3d.path.trim();
  if (!rawPath) {
    return null;
  }
  return {
    path: resolveAssetPath(rawPath),
    size: profile.lut3d.size,
    intensity: profile.lut3d.intensity,
  };
};

const resolveCustomLUT = (
  profile: FilmProfileV3
): { path: string; size: 8 | 16; intensity: number } | null => {
  const custom = profile.customLut;
  if (!custom?.enabled || custom.intensity <= 0) {
    return null;
  }
  const rawPath = custom.path.trim();
  if (!rawPath) {
    return null;
  }
  return {
    path: resolveAssetPath(rawPath),
    size: custom.size,
    intensity: custom.intensity,
  };
};

const resolvePrintLUT = (profile: FilmProfileV3): { path: string; size: 8 | 16 } | null => {
  const print = profile.print;
  if (!print?.enabled || print.stock !== "custom") {
    return null;
  }
  const rawPath = print.lutPath?.trim() ?? "";
  if (!rawPath) {
    return null;
  }
  return {
    path: resolveAssetPath(rawPath),
    size: print.lutSize ?? 16,
  };
};

const applyAdjustmentCustomLUT = (
  profile: FilmProfileV3,
  adjustments: EditingAdjustments
): FilmProfileV3 => {
  const custom = adjustments.customLut;
  if (!custom?.enabled || custom.intensity <= 0) {
    return profile;
  }
  const trimmedPath = custom.path.trim();
  if (!trimmedPath) {
    return profile;
  }
  return {
    ...profile,
    customLut: {
      enabled: true,
      path: trimmedPath,
      size: custom.size,
      intensity: custom.intensity,
    },
  };
};

const applyAdjustmentGlow = (
  profile: FilmProfileV3,
  adjustments: EditingAdjustments
): FilmProfileV3 => {
  const intensity = Math.max(0, Math.min(1, adjustments.glowIntensity / 100));
  const midtoneFocus = Math.max(0, Math.min(1, adjustments.glowMidtoneFocus / 100));
  const bias = Math.max(0, Math.min(1, adjustments.glowBias / 100));
  const radius = Math.max(1, (Math.max(0, Math.min(100, adjustments.glowRadius)) / 100) * 20);

  if (intensity <= 0.0001) {
    return {
      ...profile,
      glow: {
        enabled: false,
        intensity: 0,
        midtoneFocus,
        bias,
        radius,
      },
    };
  }

  return {
    ...profile,
    glow: {
      enabled: true,
      intensity,
      midtoneFocus,
      bias,
      radius,
    },
  };
};

export const resolveRenderProfile = (
  adjustments: EditingAdjustments,
  providedProfile?: FilmProfileAny | null
): ResolvedRenderProfile => {
  const normalizedAdjustments = normalizeAdjustments(adjustments);

  if (providedProfile && isFilmProfileV3(providedProfile)) {
    const v3 = applyAdjustmentGlow(
      applyAdjustmentCustomLUT(ensureFilmProfileV3(providedProfile), normalizedAdjustments),
      normalizedAdjustments
    );
    const v2 = ensureFilmProfileV2(v3);
    return {
      mode: "v3",
      source: providedProfile,
      v2,
      v3,
      lut: resolveLUT(v3),
      customLut: resolveCustomLUT(v3),
      printLut: resolvePrintLUT(v3),
    };
  }

  if (providedProfile && isFilmProfileV2(providedProfile)) {
    const v2 = ensureFilmProfileV2(providedProfile);
    const v3 = applyAdjustmentGlow(
      applyAdjustmentCustomLUT(ensureFilmProfileV3(v2), normalizedAdjustments),
      normalizedAdjustments
    );
    return {
      mode: "v3",
      source: providedProfile,
      v2,
      v3,
      lut: resolveLUT(v3),
      customLut: resolveCustomLUT(v3),
      printLut: resolvePrintLUT(v3),
    };
  }

  if (providedProfile && !isFilmProfileV2(providedProfile) && !isFilmProfileV3(providedProfile)) {
    const stockV2 = getStockFilmProfileV2ById(providedProfile.id);
    if (stockV2) {
      const v2 = ensureFilmProfileV2(stockV2);
      const v3 = applyAdjustmentGlow(
        applyAdjustmentCustomLUT(ensureFilmProfileV3(v2), normalizedAdjustments),
        normalizedAdjustments
      );
      return {
        mode: "v3",
        source: stockV2,
        v2,
        v3,
        lut: resolveLUT(v3),
        customLut: resolveCustomLUT(v3),
        printLut: resolvePrintLUT(v3),
      };
    }
  }

  const runtimeProfile = createFilmProfileFromAdjustments(normalizedAdjustments);
  const legacyV1 = ensureFilmProfile((providedProfile as FilmProfile | undefined) ?? runtimeProfile);
  const v2 = ensureFilmProfileV2(legacyV1);
  const v3 = applyAdjustmentGlow(
    applyAdjustmentCustomLUT(ensureFilmProfileV3(v2), normalizedAdjustments),
    normalizedAdjustments
  );

  return {
    mode: "legacy-v1",
    source: legacyV1,
    legacyV1,
    v2,
    v3,
    lut: resolveLUT(v3),
    customLut: resolveCustomLUT(v3),
    printLut: resolvePrintLUT(v3),
  };
};
