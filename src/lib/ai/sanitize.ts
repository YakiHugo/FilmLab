import type { AiControllableAdjustments } from "./editSchema";
import { FILM_PROFILE_IDS } from "./editSchema";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

function sanitizeHslChannel(ch: { hue: number; saturation: number; luminance: number }) {
  return {
    hue: clamp(ch.hue, -180, 180),
    saturation: clamp(ch.saturation, -100, 100),
    luminance: clamp(ch.luminance, -100, 100),
  };
}

function sanitizeColorGradingZone(zone: { hue: number; saturation: number; luminance: number }) {
  return {
    hue: clamp(zone.hue, 0, 360),
    saturation: clamp(zone.saturation, 0, 100),
    luminance: clamp(zone.luminance, -100, 100),
  };
}

export function sanitizeAiAdjustments(
  raw: AiControllableAdjustments
): AiControllableAdjustments {
  return {
    exposure: clamp(raw.exposure, -100, 100),
    contrast: clamp(raw.contrast, -100, 100),
    highlights: clamp(raw.highlights, -100, 100),
    shadows: clamp(raw.shadows, -100, 100),
    whites: clamp(raw.whites, -100, 100),
    blacks: clamp(raw.blacks, -100, 100),
    temperature: clamp(raw.temperature, -100, 100),
    tint: clamp(raw.tint, -100, 100),
    vibrance: clamp(raw.vibrance, -100, 100),
    saturation: clamp(raw.saturation, -100, 100),
    clarity: clamp(raw.clarity, -100, 100),
    dehaze: clamp(raw.dehaze, -100, 100),
    curveHighlights: clamp(raw.curveHighlights, -100, 100),
    curveLights: clamp(raw.curveLights, -100, 100),
    curveDarks: clamp(raw.curveDarks, -100, 100),
    curveShadows: clamp(raw.curveShadows, -100, 100),
    grain: clamp(raw.grain, 0, 100),
    grainSize: clamp(raw.grainSize, 0, 100),
    grainRoughness: clamp(raw.grainRoughness, 0, 100),
    vignette: clamp(raw.vignette, -100, 100),
    sharpening: clamp(raw.sharpening, 0, 100),
    noiseReduction: clamp(raw.noiseReduction, 0, 100),
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
      blend: clamp(raw.colorGrading.blend, 0, 100),
      balance: clamp(raw.colorGrading.balance, -100, 100),
    },
  };
}

export function sanitizeFilmProfileId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return (FILM_PROFILE_IDS as readonly string[]).includes(id) ? id : undefined;
}
