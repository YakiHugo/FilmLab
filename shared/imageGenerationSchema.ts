import { z } from "zod";
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_PROVIDER_IDS,
  IMAGE_STYLE_IDS,
  REFERENCE_IMAGE_TYPES,
} from "./imageGeneration";

export const imageProviderSchema = z.enum(IMAGE_PROVIDER_IDS);
export const imageAspectRatioSchema = z.enum(IMAGE_ASPECT_RATIOS);
export const imageStyleSchema = z.enum(IMAGE_STYLE_IDS);
export const referenceImageTypeSchema = z.enum(REFERENCE_IMAGE_TYPES);

export const referenceImageSchema = z.object({
  id: z.string().optional(),
  url: z.string().min(1),
  fileName: z.string().optional(),
  weight: z.number().min(0).max(1).optional(),
  type: referenceImageTypeSchema.default("content"),
});

export const imageGenerationRequestSchema = z
  .object({
    prompt: z.string().trim().min(1),
    negativePrompt: z.string().trim().optional(),
    provider: imageProviderSchema.default("openai"),
    model: z.string().trim().min(1).default("gpt-image-1"),
    aspectRatio: imageAspectRatioSchema.default("1:1"),
    width: z.number().int().min(256).max(4096).optional(),
    height: z.number().int().min(256).max(4096).optional(),
    style: imageStyleSchema.default("none"),
    stylePreset: z.string().trim().optional(),
    referenceImages: z.array(referenceImageSchema).max(4).default([]),
    seed: z.number().int().min(0).max(2_147_483_647).optional(),
    guidanceScale: z.number().min(1).max(20).optional(),
    steps: z.number().int().min(1).max(80).optional(),
    sampler: z.string().trim().optional(),
    batchSize: z.number().int().min(1).max(4).default(1),
    modelParams: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .default({}),
  })
  .superRefine((payload, ctx) => {
    if (payload.aspectRatio === "custom" && (!payload.width || !payload.height)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Width and height are required when aspectRatio is custom.",
      });
    }
  });

export type ParsedImageGenerationRequest = z.infer<typeof imageGenerationRequestSchema>;
export type ImageGenerationRequest = z.input<typeof imageGenerationRequestSchema>;
