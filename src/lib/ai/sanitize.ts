import { clamp } from "@/lib/math";
import type { AiControllableAdjustments } from "./editSchema";
import { FILM_PROFILE_IDS } from "./editSchema";

const clampRound = (value: number, min: number, max: number) => clamp(Math.round(value), min, max);

function sanitizeHslChannel(ch: { hue: number; saturation: number; luminance: number }) {
  return {
    hue: clampRound(ch.hue, -180, 180),
    saturation: clampRound(ch.saturation, -100, 100),
    luminance: clampRound(ch.luminance, -100, 100),
  };
}

function sanitizeColorGradingZone(zone: { hue: number; saturation: number; luminance: number }) {
  return {
    hue: clampRound(zone.hue, 0, 360),
    saturation: clampRound(zone.saturation, 0, 100),
    luminance: clampRound(zone.luminance, -100, 100),
  };
}

export function sanitizeAiAdjustments(raw: AiControllableAdjustments): AiControllableAdjustments {
  return {
    exposure: clampRound(raw.exposure, -100, 100),
    contrast: clampRound(raw.contrast, -100, 100),
    highlights: clampRound(raw.highlights, -100, 100),
    shadows: clampRound(raw.shadows, -100, 100),
    whites: clampRound(raw.whites, -100, 100),
    blacks: clampRound(raw.blacks, -100, 100),
    temperature: clampRound(raw.temperature, -100, 100),
    tint: clampRound(raw.tint, -100, 100),
    vibrance: clampRound(raw.vibrance, -100, 100),
    saturation: clampRound(raw.saturation, -100, 100),
    clarity: clampRound(raw.clarity, -100, 100),
    dehaze: clampRound(raw.dehaze, -100, 100),
    curveHighlights: clampRound(raw.curveHighlights, -100, 100),
    curveLights: clampRound(raw.curveLights, -100, 100),
    curveDarks: clampRound(raw.curveDarks, -100, 100),
    curveShadows: clampRound(raw.curveShadows, -100, 100),
    grain: clampRound(raw.grain, 0, 100),
    grainSize: clampRound(raw.grainSize, 0, 100),
    grainRoughness: clampRound(raw.grainRoughness, 0, 100),
    vignette: clampRound(raw.vignette, -100, 100),
    sharpening: clampRound(raw.sharpening, 0, 100),
    noiseReduction: clampRound(raw.noiseReduction, 0, 100),
    hsl: {
      red: sanitizeHslChannel(raw.hsl.red),
      orange: sanitizeHslChannel(raw.hsl.orange),
      yellow: sanitizeHslChannel(raw.hsl.yellow),
      green: sanitizeHslChannel(raw.hsl.green),
      aqua: sanitizeHslChannel(raw.hsl.aqua),
      blue: sanitizeHslChannel(raw.hsl.blue),
      purple: sanitizeHslChannel(raw.hsl.purple),
      magenta: sanitizeHslChannel(raw.hsl.magenta),
    },
    colorGrading: {
      shadows: sanitizeColorGradingZone(raw.colorGrading.shadows),
      midtones: sanitizeColorGradingZone(raw.colorGrading.midtones),
      highlights: sanitizeColorGradingZone(raw.colorGrading.highlights),
      blend: clampRound(raw.colorGrading.blend, 0, 100),
      balance: clampRound(raw.colorGrading.balance, -100, 100),
    },
  };
}

export function sanitizeFilmProfileId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return (FILM_PROFILE_IDS as readonly string[]).includes(id) ? id : undefined;
}
