import { normalizeAdjustments } from "@/lib/adjustments";
import { clamp } from "@/lib/math";
import type { EditingAdjustments } from "@/types";
import { FILM_PROFILE_IDS, aiControllableAdjustmentsSchema } from "./editSchema";
import type { AiControllableAdjustments } from "./editSchema";

const clampRound = (value: number, min: number, max: number) => clamp(Math.round(value), min, max);

function sanitizeHslChannel(ch?: { hue: number; saturation: number; luminance: number }) {
  return {
    hue: clampRound(ch?.hue ?? 0, -180, 180),
    saturation: clampRound(ch?.saturation ?? 0, -100, 100),
    luminance: clampRound(ch?.luminance ?? 0, -100, 100),
  };
}

function sanitizeColorGradingZone(zone?: { hue: number; saturation: number; luminance: number }) {
  return {
    hue: clampRound(zone?.hue ?? 0, 0, 360),
    saturation: clampRound(zone?.saturation ?? 0, 0, 100),
    luminance: clampRound(zone?.luminance ?? 0, -100, 100),
  };
}

export function sanitizeAiAdjustments(raw: AiControllableAdjustments): AiControllableAdjustments {
  return {
    exposure: clampRound(raw.exposure ?? 0, -100, 100),
    contrast: clampRound(raw.contrast ?? 0, -100, 100),
    highlights: clampRound(raw.highlights ?? 0, -100, 100),
    shadows: clampRound(raw.shadows ?? 0, -100, 100),
    whites: clampRound(raw.whites ?? 0, -100, 100),
    blacks: clampRound(raw.blacks ?? 0, -100, 100),
    temperature: clampRound(raw.temperature ?? 0, -100, 100),
    tint: clampRound(raw.tint ?? 0, -100, 100),
    vibrance: clampRound(raw.vibrance ?? 0, -100, 100),
    saturation: clampRound(raw.saturation ?? 0, -100, 100),
    clarity: clampRound(raw.clarity ?? 0, -100, 100),
    dehaze: clampRound(raw.dehaze ?? 0, -100, 100),
    curveHighlights: clampRound(raw.curveHighlights ?? 0, -100, 100),
    curveLights: clampRound(raw.curveLights ?? 0, -100, 100),
    curveDarks: clampRound(raw.curveDarks ?? 0, -100, 100),
    curveShadows: clampRound(raw.curveShadows ?? 0, -100, 100),
    grain: clampRound(raw.grain ?? 0, 0, 100),
    grainSize: clampRound(raw.grainSize ?? 0, 0, 100),
    grainRoughness: clampRound(raw.grainRoughness ?? 0, 0, 100),
    vignette: clampRound(raw.vignette ?? 0, -100, 100),
    sharpening: clampRound(raw.sharpening ?? 0, 0, 100),
    noiseReduction: clampRound(raw.noiseReduction ?? 0, 0, 100),
    hsl: {
      red: sanitizeHslChannel(raw.hsl?.red),
      orange: sanitizeHslChannel(raw.hsl?.orange),
      yellow: sanitizeHslChannel(raw.hsl?.yellow),
      green: sanitizeHslChannel(raw.hsl?.green),
      aqua: sanitizeHslChannel(raw.hsl?.aqua),
      blue: sanitizeHslChannel(raw.hsl?.blue),
      purple: sanitizeHslChannel(raw.hsl?.purple),
      magenta: sanitizeHslChannel(raw.hsl?.magenta),
    },
    colorGrading: {
      shadows: sanitizeColorGradingZone(raw.colorGrading?.shadows),
      midtones: sanitizeColorGradingZone(raw.colorGrading?.midtones),
      highlights: sanitizeColorGradingZone(raw.colorGrading?.highlights),
      blend: clampRound(raw.colorGrading?.blend ?? 50, 0, 100),
      balance: clampRound(raw.colorGrading?.balance ?? 0, -100, 100),
    },
  };
}

export function sanitizeFilmProfileId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return (FILM_PROFILE_IDS as readonly string[]).includes(id) ? id : undefined;
}

const AI_ADJUSTMENT_KEYS = Object.keys(
  aiControllableAdjustmentsSchema.shape
) as (keyof AiControllableAdjustments)[];

export function buildPatchFromAiResult(
  current: EditingAdjustments | null | undefined,
  result: AiControllableAdjustments
): Partial<EditingAdjustments> {
  const base = normalizeAdjustments(current);
  const patch: Record<string, unknown> = { ...base };

  for (const key of AI_ADJUSTMENT_KEYS) {
    patch[key] = result[key];
  }

  return patch as Partial<EditingAdjustments>;
}
