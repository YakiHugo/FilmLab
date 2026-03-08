import { z } from "zod";
import { IMAGE_UPSCALE_SCALES } from "./imageGeneration";

export const imageUpscaleScaleSchema = z.enum(IMAGE_UPSCALE_SCALES);

export const imageUpscaleRequestSchema = z.object({
  provider: z.literal("stability"),
  model: z.string().trim().min(1).default("stable-image-ultra"),
  imageId: z.string().trim().min(1),
  scale: imageUpscaleScaleSchema.default("2x"),
});

export type ParsedImageUpscaleRequest = z.infer<typeof imageUpscaleRequestSchema>;
export type ImageUpscaleRequest = z.input<typeof imageUpscaleRequestSchema>;
