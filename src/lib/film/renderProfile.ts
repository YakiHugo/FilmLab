import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import { getStockFilmProfileV2ById } from "@/data/filmStockProfiles";
import type {
  ImageRenderDevelopState,
  ImageRenderFilmState,
  ImageRenderFxState,
} from "@/render/image/types";
import type { EditingAdjustments, FilmProfile } from "@/types";
import type {
  FilmProfileAny,
  FilmProfileV2,
  FilmProfileV3,
  ResolvedPushPull,
  ResolvedRenderProfile,
} from "@/types/film";
import { ensureFilmProfileV2, ensureFilmProfileV3 } from "./migrate";
import { createFilmProfileFromAdjustments } from "./profile";
import { ensureFilmProfile, resolveFilmProfile } from "./registry";

const isFilmProfileV2 = (profile: FilmProfileAny | null | undefined): profile is FilmProfileV2 =>
  Boolean(profile && profile.version === 2);

const isFilmProfileV3 = (profile: FilmProfileAny | null | undefined): profile is FilmProfileV3 =>
  Boolean(profile && profile.version === 3);

const resolveAssetPath = (rawPath: string): string => {
  const normalized = rawPath.replace(/^\/+/, "");
  const baseUrl = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "/");
  return `${baseUrl}${normalized}`;
};

const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const resolveAdjustmentPushPullEv = (adjustments: EditingAdjustments): number | null => {
  const raw = adjustments as unknown as Record<string, unknown>;
  const candidates: unknown[] = [raw.pushPullEv, raw.pushPull, raw.filmPushPullEv];
  for (const candidate of candidates) {
    const direct = toFiniteNumber(candidate);
    if (direct !== null) {
      return direct;
    }
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const nested = candidate as { ev?: unknown; value?: unknown };
    const nestedEv = toFiniteNumber(nested.ev);
    if (nestedEv !== null) {
      return nestedEv;
    }
    const nestedValue = toFiniteNumber(nested.value);
    if (nestedValue !== null) {
      return nestedValue;
    }
  }
  return null;
};

const resolveStatePushPullEv = (
  fx: Pick<ImageRenderFxState, "pushPullEv">
): number | null => {
  const value = fx.pushPullEv;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const createFallbackAdjustmentsFromState = (
  develop: Pick<ImageRenderDevelopState, "tone" | "color" | "detail" | "fx">
): EditingAdjustments => {
  const fallback = createDefaultAdjustments();
  fallback.exposure = develop.tone.exposure;
  fallback.contrast = develop.tone.contrast;
  fallback.highlights = develop.tone.highlights;
  fallback.shadows = develop.tone.shadows;
  fallback.whites = develop.tone.whites;
  fallback.blacks = develop.tone.blacks;
  fallback.temperature = develop.color.temperature;
  fallback.tint = develop.color.tint;
  fallback.vibrance = develop.color.vibrance;
  fallback.saturation = develop.color.saturation;
  fallback.hsl = structuredClone(develop.color.hsl);
  fallback.texture = develop.detail.texture;
  fallback.clarity = develop.detail.clarity;
  fallback.dehaze = develop.detail.dehaze;
  fallback.vignette = develop.fx.vignette;
  fallback.grain = develop.fx.grain;
  fallback.grainSize = develop.fx.grainSize;
  fallback.grainRoughness = develop.fx.grainRoughness;
  fallback.customLut = develop.fx.customLut ? structuredClone(develop.fx.customLut) : undefined;
  fallback.pushPullEv = develop.fx.pushPullEv;
  fallback.glowIntensity = develop.fx.glowIntensity;
  fallback.glowMidtoneFocus = develop.fx.glowMidtoneFocus;
  fallback.glowBias = develop.fx.glowBias;
  fallback.glowRadius = develop.fx.glowRadius;
  return fallback;
};

const resolveEffectivePushPull = (
  profile: FilmProfileV3,
  adjustments: EditingAdjustments
): Omit<ResolvedPushPull, "selectedStop"> & { minEv: number; maxEv: number } => {
  const rawMinEv = toFiniteNumber(profile.pushPull?.minEv) ?? -2;
  const rawMaxEv = toFiniteNumber(profile.pushPull?.maxEv) ?? 2;
  const minEv = Math.min(rawMinEv, rawMaxEv);
  const maxEv = Math.max(rawMinEv, rawMaxEv);
  const adjustmentEv = resolveAdjustmentPushPullEv(adjustments);
  const profileEv = toFiniteNumber(profile.pushPull?.ev);
  const source: ResolvedPushPull["source"] =
    adjustmentEv !== null ? "adjustments" : profileEv !== null ? "profile" : "none";
  const ev = clampValue(adjustmentEv ?? profileEv ?? 0, minEv, maxEv);
  const enabled = Boolean(profile.pushPull?.enabled) || Math.abs(ev) > 1.0e-4;
  return { enabled, ev, source, minEv, maxEv };
};

const resolveEffectivePushPullFromState = (
  profile: FilmProfileV3,
  fx: Pick<ImageRenderFxState, "pushPullEv">
): Omit<ResolvedPushPull, "selectedStop"> & { minEv: number; maxEv: number } => {
  const rawMinEv = toFiniteNumber(profile.pushPull?.minEv) ?? -2;
  const rawMaxEv = toFiniteNumber(profile.pushPull?.maxEv) ?? 2;
  const minEv = Math.min(rawMinEv, rawMaxEv);
  const maxEv = Math.max(rawMinEv, rawMaxEv);
  const adjustmentEv = resolveStatePushPullEv(fx);
  const profileEv = toFiniteNumber(profile.pushPull?.ev);
  const source: ResolvedPushPull["source"] =
    adjustmentEv !== null ? "adjustments" : profileEv !== null ? "profile" : "none";
  const ev = clampValue(adjustmentEv ?? profileEv ?? 0, minEv, maxEv);
  const enabled = Boolean(profile.pushPull?.enabled) || Math.abs(ev) > 1.0e-4;
  return { enabled, ev, source, minEv, maxEv };
};

const applyAdjustmentPushPull = (
  profile: FilmProfileV3,
  adjustments: EditingAdjustments
): {
  profile: FilmProfileV3;
  pushPull: Omit<ResolvedPushPull, "selectedStop">;
} => {
  const resolved = resolveEffectivePushPull(profile, adjustments);
  const current = profile.pushPull;
  return {
    profile: {
      ...profile,
      pushPull: {
        enabled: resolved.enabled,
        ev: resolved.ev,
        minEv: current?.minEv ?? resolved.minEv,
        maxEv: current?.maxEv ?? resolved.maxEv,
        lutByStop: current?.lutByStop,
      },
    },
    pushPull: {
      enabled: resolved.enabled,
      ev: resolved.ev,
      source: resolved.source,
    },
  };
};

const applyStatePushPull = (
  profile: FilmProfileV3,
  fx: Pick<ImageRenderFxState, "pushPullEv">
): {
  profile: FilmProfileV3;
  pushPull: Omit<ResolvedPushPull, "selectedStop">;
} => {
  const resolved = resolveEffectivePushPullFromState(profile, fx);
  const current = profile.pushPull;
  return {
    profile: {
      ...profile,
      pushPull: {
        enabled: resolved.enabled,
        ev: resolved.ev,
        minEv: current?.minEv ?? resolved.minEv,
        maxEv: current?.maxEv ?? resolved.maxEv,
        lutByStop: current?.lutByStop,
      },
    },
    pushPull: {
      enabled: resolved.enabled,
      ev: resolved.ev,
      source: resolved.source,
    },
  };
};

interface PushPullLutStop {
  stop: number;
  path: string;
  size?: 8 | 16;
  intensity?: number;
}

const collectPushPullLutStops = (profile: FilmProfileV3): PushPullLutStop[] => {
  const lutByStop = profile.pushPull?.lutByStop;
  if (!lutByStop) {
    return [];
  }

  const stops: PushPullLutStop[] = [];
  const entries = Object.entries(lutByStop);
  for (const [stopKey, rawValue] of entries) {
    const stop = Number(stopKey);
    if (!Number.isFinite(stop)) {
      continue;
    }

    let path = "";
    let size: 8 | 16 | undefined;
    let intensity: number | undefined;

    if (typeof rawValue === "string") {
      path = rawValue.trim();
    } else if (rawValue && typeof rawValue === "object") {
      path = rawValue.path.trim();
      size = rawValue.size === 16 ? 16 : rawValue.size === 8 ? 8 : undefined;
      const stopIntensity = toFiniteNumber(rawValue.intensity);
      if (stopIntensity !== null) {
        intensity = clampValue(stopIntensity, 0, 1);
      }
    }

    if (!path) {
      continue;
    }
    stops.push({ stop, path, size, intensity });
  }

  return stops.sort((left, right) => left.stop - right.stop);
};

const resolvePushPullLUTBlend = (
  profile: FilmProfileV3,
  effectiveEv: number
): {
  primary: PushPullLutStop;
  secondary: PushPullLutStop | null;
  mixFactor: number;
  selectedStop: number | null;
} | null => {
  const stops = collectPushPullLutStops(profile);
  if (stops.length === 0) {
    return null;
  }

  const nearest = stops.reduce((best, current) => {
    const bestDistance = Math.abs(best.stop - effectiveEv);
    const currentDistance = Math.abs(current.stop - effectiveEv);
    if (currentDistance < bestDistance) {
      return current;
    }
    if (currentDistance === bestDistance && Math.abs(current.stop) < Math.abs(best.stop)) {
      return current;
    }
    return best;
  });

  let lower: PushPullLutStop | null = null;
  let upper: PushPullLutStop | null = null;
  for (const stop of stops) {
    if (stop.stop <= effectiveEv) {
      lower = stop;
    }
    if (!upper && stop.stop >= effectiveEv) {
      upper = stop;
    }
  }

  if (lower && upper && lower.stop !== upper.stop) {
    const mixFactor = clampValue((effectiveEv - lower.stop) / (upper.stop - lower.stop), 0, 1);
    return {
      primary: lower,
      secondary: upper,
      mixFactor,
      selectedStop: nearest.stop,
    };
  }

  const primary = lower ?? upper ?? nearest;
  return {
    primary,
    secondary: null,
    mixFactor: 0,
    selectedStop: nearest.stop,
  };
};

const resolveLUT = (
  profile: FilmProfileV3,
  effectivePushPullEv: number,
  pushPullEnabled: boolean
): {
  lut: { path: string; size: 8 | 16; intensity: number } | null;
  lutBlend: { path: string; size: 8 | 16; mixFactor: number } | null;
  selectedStop: number | null;
} => {
  if (!profile.lut3d.enabled) {
    return { lut: null, lutBlend: null, selectedStop: null };
  }

  let rawPath = profile.lut3d.path.trim();
  let size: 8 | 16 = profile.lut3d.size;
  let intensity = clampValue(profile.lut3d.intensity, 0, 1);
  let lutBlend: { path: string; size: 8 | 16; mixFactor: number } | null = null;
  let selectedStop: number | null = null;

  if (pushPullEnabled) {
    const stopLut = resolvePushPullLUTBlend(profile, effectivePushPullEv);
    if (stopLut) {
      const baseIntensity = intensity;
      const primaryIntensity = stopLut.primary.intensity ?? baseIntensity;
      rawPath = stopLut.primary.path;
      size = stopLut.primary.size ?? size;
      intensity = primaryIntensity;
      selectedStop = stopLut.selectedStop;

      if (stopLut.secondary && stopLut.mixFactor > 1.0e-4) {
        const secondarySize = stopLut.secondary.size ?? size;
        const secondaryIntensity = stopLut.secondary.intensity ?? baseIntensity;
        intensity = clampValue(
          primaryIntensity + (secondaryIntensity - primaryIntensity) * stopLut.mixFactor,
          0,
          1
        );
        lutBlend = {
          path: resolveAssetPath(stopLut.secondary.path),
          size: secondarySize,
          mixFactor: stopLut.mixFactor,
        };
      }
    }
  }

  if (!rawPath || intensity <= 0) {
    return { lut: null, lutBlend: null, selectedStop };
  }

  return {
    lut: {
      path: resolveAssetPath(rawPath),
      size,
      intensity,
    },
    lutBlend,
    selectedStop,
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

const applyStateCustomLUT = (
  profile: FilmProfileV3,
  fx: Pick<ImageRenderFxState, "customLut">
): FilmProfileV3 => {
  const custom = fx.customLut;
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

const applyStateGlow = (
  profile: FilmProfileV3,
  fx: Pick<
    ImageRenderFxState,
    "glowIntensity" | "glowMidtoneFocus" | "glowBias" | "glowRadius"
  >
): FilmProfileV3 => {
  const intensity = Math.max(0, Math.min(1, fx.glowIntensity / 100));
  const midtoneFocus = Math.max(0, Math.min(1, fx.glowMidtoneFocus / 100));
  const bias = Math.max(0, Math.min(1, fx.glowBias / 100));
  const radius = Math.max(1, (Math.max(0, Math.min(100, fx.glowRadius)) / 100) * 20);

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

const normalizeAdvancedFields = (profile: FilmProfileV3): FilmProfileV3 => {
  let next = profile;
  if (profile.print) {
    const targetWhiteKelvin = clampValue(
      toFiniteNumber(profile.print.targetWhiteKelvin) ?? 6500,
      5500,
      6500
    );
    if (profile.print.targetWhiteKelvin !== targetWhiteKelvin) {
      next = {
        ...next,
        print: {
          ...profile.print,
          targetWhiteKelvin,
        },
      };
    }
  }

  if (profile.gateWeave) {
    const amount = clampValue(toFiniteNumber(profile.gateWeave.amount) ?? 0, 0, 1);
    const seed = toFiniteNumber(profile.gateWeave.seed) ?? 0;
    if (profile.gateWeave.amount !== amount || profile.gateWeave.seed !== seed) {
      next = {
        ...next,
        gateWeave: {
          ...profile.gateWeave,
          amount,
          seed,
        },
      };
    }
  }
  return next;
};

const buildResolvedProfile = (
  mode: ResolvedRenderProfile["mode"],
  source: FilmProfileAny,
  v3Base: FilmProfileV3,
  adjustments: EditingAdjustments,
  legacyV1?: FilmProfile
): ResolvedRenderProfile => {
  const normalizedV3 = normalizeAdvancedFields(v3Base);
  const pushPullApplied = applyAdjustmentPushPull(normalizedV3, adjustments);
  const v3 = applyAdjustmentGlow(
    applyAdjustmentCustomLUT(pushPullApplied.profile, adjustments),
    adjustments
  );
  const v2 = ensureFilmProfileV2(v3);
  const lut = resolveLUT(v3, pushPullApplied.pushPull.ev, pushPullApplied.pushPull.enabled);
  return {
    mode,
    source,
    legacyV1,
    v2,
    v3,
    lut: lut.lut,
    lutBlend: lut.lutBlend,
    customLut: resolveCustomLUT(v3),
    printLut: resolvePrintLUT(v3),
    pushPull: {
      ...pushPullApplied.pushPull,
      selectedStop: lut.selectedStop,
    },
  };
};

const resolveStateFilmProfile = (film: ImageRenderFilmState): FilmProfileAny | undefined => {
  const baseProfile = film.profile ?? undefined;
  const overrides = film.profileOverrides ?? undefined;
  if (!baseProfile) {
    return undefined;
  }
  if (!overrides || Object.keys(overrides).length === 0) {
    return baseProfile;
  }
  return resolveFilmProfile({
    adjustments: createDefaultAdjustments(),
    filmProfile: baseProfile,
    overrides,
  });
};

const buildResolvedProfileFromState = (
  mode: ResolvedRenderProfile["mode"],
  source: FilmProfileAny,
  v3Base: FilmProfileV3,
  fx: Pick<
    ImageRenderFxState,
    "customLut" | "pushPullEv" | "glowIntensity" | "glowMidtoneFocus" | "glowBias" | "glowRadius"
  >,
  legacyV1?: FilmProfile
): ResolvedRenderProfile => {
  const normalizedV3 = normalizeAdvancedFields(v3Base);
  const pushPullApplied = applyStatePushPull(normalizedV3, fx);
  const v3 = applyStateGlow(
    applyStateCustomLUT(pushPullApplied.profile, fx),
    fx
  );
  const v2 = ensureFilmProfileV2(v3);
  const lut = resolveLUT(v3, pushPullApplied.pushPull.ev, pushPullApplied.pushPull.enabled);
  return {
    mode,
    source,
    legacyV1,
    v2,
    v3,
    lut: lut.lut,
    lutBlend: lut.lutBlend,
    customLut: resolveCustomLUT(v3),
    printLut: resolvePrintLUT(v3),
    pushPull: {
      ...pushPullApplied.pushPull,
      selectedStop: lut.selectedStop,
    },
  };
};

export const resolveRenderProfile = (
  adjustments: EditingAdjustments,
  providedProfile?: FilmProfileAny | null
): ResolvedRenderProfile => {
  const normalizedAdjustments = normalizeAdjustments(adjustments);

  if (providedProfile && isFilmProfileV3(providedProfile)) {
    return buildResolvedProfile(
      "v3",
      providedProfile,
      ensureFilmProfileV3(providedProfile),
      normalizedAdjustments
    );
  }

  if (providedProfile && isFilmProfileV2(providedProfile)) {
    const v2 = ensureFilmProfileV2(providedProfile);
    return buildResolvedProfile("v3", providedProfile, ensureFilmProfileV3(v2), normalizedAdjustments);
  }

  if (providedProfile && !isFilmProfileV2(providedProfile) && !isFilmProfileV3(providedProfile)) {
    const stockV2 = getStockFilmProfileV2ById(providedProfile.id);
    if (stockV2) {
      const v2 = ensureFilmProfileV2(stockV2);
      return buildResolvedProfile(
        "v3",
        stockV2,
        ensureFilmProfileV3(v2),
        normalizedAdjustments
      );
    }
  }

  const runtimeProfile = createFilmProfileFromAdjustments(normalizedAdjustments);
  const legacyV1 = ensureFilmProfile((providedProfile as FilmProfile | undefined) ?? runtimeProfile);
  const v2 = ensureFilmProfileV2(legacyV1);
  return buildResolvedProfile(
    "legacy-v1",
    legacyV1,
    ensureFilmProfileV3(v2),
    normalizedAdjustments,
    legacyV1
  );
};

export const resolveRenderProfileFromState = ({
  film,
  develop,
}: {
  film: ImageRenderFilmState;
  develop: Pick<ImageRenderDevelopState, "tone" | "color" | "detail" | "fx">;
}): ResolvedRenderProfile => {
  const fx = develop.fx;
  const providedProfile = resolveStateFilmProfile(film);

  if (providedProfile && isFilmProfileV3(providedProfile)) {
    return buildResolvedProfileFromState("v3", providedProfile, ensureFilmProfileV3(providedProfile), fx);
  }

  if (providedProfile && isFilmProfileV2(providedProfile)) {
    const v2 = ensureFilmProfileV2(providedProfile);
    return buildResolvedProfileFromState("v3", providedProfile, ensureFilmProfileV3(v2), fx);
  }

  if (providedProfile && !isFilmProfileV2(providedProfile) && !isFilmProfileV3(providedProfile)) {
    const stockV2 = getStockFilmProfileV2ById(providedProfile.id);
    if (stockV2) {
      const v2 = ensureFilmProfileV2(stockV2);
      return buildResolvedProfileFromState("v3", stockV2, ensureFilmProfileV3(v2), fx);
    }
  }

  const runtimeProfile = createFilmProfileFromAdjustments(
    createFallbackAdjustmentsFromState(develop)
  );
  const legacyV1 = ensureFilmProfile(runtimeProfile);
  const v2 = ensureFilmProfileV2(legacyV1);
  return buildResolvedProfileFromState(
    "legacy-v1",
    legacyV1,
    ensureFilmProfileV3(v2),
    fx,
    legacyV1
  );
};
