import { z } from "zod";

const hslChannelSchema = z.object({
  hue: z.number().min(-180).max(180),
  saturation: z.number().min(-100).max(100),
  luminance: z.number().min(-100).max(100),
});

const colorGradingZoneSchema = z.object({
  hue: z.number().min(0).max(360),
  saturation: z.number().min(0).max(100),
  luminance: z.number().min(-100).max(100),
});

export const aiControllableAdjustmentsSchema = z.object({
  // Basic tone
  exposure: z.number().min(-100).max(100),
  contrast: z.number().min(-100).max(100),
  highlights: z.number().min(-100).max(100),
  shadows: z.number().min(-100).max(100),
  whites: z.number().min(-100).max(100),
  blacks: z.number().min(-100).max(100),
  // White balance + color
  temperature: z.number().min(-100).max(100),
  tint: z.number().min(-100).max(100),
  vibrance: z.number().min(-100).max(100),
  saturation: z.number().min(-100).max(100),
  clarity: z.number().min(-100).max(100),
  dehaze: z.number().min(-100).max(100),
  // Curves
  curveHighlights: z.number().min(-100).max(100),
  curveLights: z.number().min(-100).max(100),
  curveDarks: z.number().min(-100).max(100),
  curveShadows: z.number().min(-100).max(100),
  // Effects
  grain: z.number().min(0).max(100),
  grainSize: z.number().min(0).max(100),
  grainRoughness: z.number().min(0).max(100),
  vignette: z.number().min(-100).max(100),
  // Detail
  sharpening: z.number().min(0).max(100),
  noiseReduction: z.number().min(0).max(100),
  // HSL
  hsl: z.object({
    red: hslChannelSchema,
    orange: hslChannelSchema,
    yellow: hslChannelSchema,
    green: hslChannelSchema,
    aqua: hslChannelSchema,
    blue: hslChannelSchema,
    purple: hslChannelSchema,
    magenta: hslChannelSchema,
  }),
  // Color grading
  colorGrading: z.object({
    shadows: colorGradingZoneSchema,
    midtones: colorGradingZoneSchema,
    highlights: colorGradingZoneSchema,
    blend: z.number().min(0).max(100),
    balance: z.number().min(-100).max(100),
  }),
});

export type AiControllableAdjustments = z.infer<typeof aiControllableAdjustmentsSchema>;

export const aiEditResultSchema = z.object({
  adjustments: aiControllableAdjustmentsSchema,
  filmProfileId: z.string().optional(),
});

export type AiEditResult = z.infer<typeof aiEditResultSchema>;

export const FILM_PROFILE_IDS = [
  "film-neutral-v1",
  "film-portrait-soft-v1",
  "film-portrait-fade-v1",
  "film-landscape-cool-v1",
  "film-landscape-golden-v1",
  "film-night-neon-v1",
  "film-bw-contrast-v1",
  "film-bw-soft-v1",
] as const;

export const FILM_PROFILE_DESCRIPTIONS: Record<string, string> = {
  "film-neutral-v1": "Balanced baseline, minimal color shift",
  "film-portrait-soft-v1": "Warm, soft highlights, skin-friendly tones",
  "film-portrait-fade-v1": "Muted, faded, low contrast look",
  "film-landscape-cool-v1": "Cool tones, enhanced clarity and depth",
  "film-landscape-golden-v1": "Golden hour warmth, halation glow",
  "film-night-neon-v1": "High contrast, cool tones, strong halation for neon scenes",
  "film-bw-contrast-v1": "High contrast black and white",
  "film-bw-soft-v1": "Soft black and white with detail preservation",
};
