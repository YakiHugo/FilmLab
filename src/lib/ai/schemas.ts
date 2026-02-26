import { z } from "zod";

export const histogramSummarySchema = z.object({
  meanBrightness: z.number(),
  contrastSpread: z.number(),
  temperature: z.enum(["warm", "neutral", "cool"]),
  saturationLevel: z.enum(["low", "medium", "high"]),
  shadowCharacter: z.enum(["crushed", "normal", "lifted"]),
  highlightCharacter: z.enum(["clipped", "normal", "rolled"]),
  isMonochrome: z.boolean(),
});

export type HistogramSummarySchema = z.infer<typeof histogramSummarySchema>;
