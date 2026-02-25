import { normalizeAdjustments } from "@/lib/adjustments";
import { getStockFilmProfileV2ById } from "@/data/filmStockProfiles";
import type { EditingAdjustments, FilmProfile } from "@/types";
import type { FilmProfileAny, FilmProfileV2, ResolvedRenderProfile } from "@/types/film";
import { ensureFilmProfileV2 } from "./migrate";
import { createFilmProfileFromAdjustments } from "./profile";
import { ensureFilmProfile } from "./registry";

const isFilmProfileV2 = (profile: FilmProfileAny | null | undefined): profile is FilmProfileV2 =>
  Boolean(profile && profile.version === 2);

const resolveAssetPath = (rawPath: string): string => {
  const normalized = rawPath.replace(/^\/+/, "");
  const baseUrl = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "/");
  return `${baseUrl}${normalized}`;
};

const resolveLUT = (
  profile: FilmProfileV2
): { path: string; size: 8 | 16; intensity: number } | null => {
  if (!profile.lut.enabled || profile.lut.intensity <= 0) {
    return null;
  }
  const rawPath = profile.lut.path.trim();
  if (!rawPath) {
    return null;
  }
  return {
    path: resolveAssetPath(rawPath),
    size: profile.lut.size,
    intensity: profile.lut.intensity,
  };
};

/**
 * Build the canonical render-profile payload consumed by the renderer bridge.
 * V1 is kept for compatibility; V2 is used whenever the input profile is V2.
 */
export const resolveRenderProfile = (
  adjustments: EditingAdjustments,
  providedProfile?: FilmProfileAny | null
): ResolvedRenderProfile => {
  if (providedProfile && isFilmProfileV2(providedProfile)) {
    const v2 = ensureFilmProfileV2(providedProfile);
    return {
      mode: "v2",
      source: providedProfile,
      v2,
      lut: resolveLUT(v2),
    };
  }

  if (providedProfile && !isFilmProfileV2(providedProfile)) {
    const stockV2 = getStockFilmProfileV2ById(providedProfile.id);
    if (stockV2) {
      return {
        mode: "v2",
        source: stockV2,
        v2: stockV2,
        lut: resolveLUT(stockV2),
      };
    }
  }

  const runtimeProfile = createFilmProfileFromAdjustments(normalizeAdjustments(adjustments));
  const legacyV1 = ensureFilmProfile((providedProfile as FilmProfile | undefined) ?? runtimeProfile);
  const v2 = ensureFilmProfileV2(legacyV1);

  return {
    mode: "legacy-v1",
    source: legacyV1,
    legacyV1,
    v2,
    lut: resolveLUT(v2),
  };
};
