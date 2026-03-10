import { z } from "zod";
import { IMAGE_PROVIDER_IDS, IMAGE_UPSCALE_SCALES } from "./imageGeneration";

export const imageUpscaleScaleSchema = z.enum(IMAGE_UPSCALE_SCALES);

export const imageUpscaleRequestSchema = z.object({
  provider: z.enum(IMAGE_PROVIDER_IDS),
  model: z.string().trim().min(1).default("doubao-seedream-5-0-260128"),
  imageId: z.string().trim().min(1),
  scale: imageUpscaleScaleSchema.default("2x"),
});

export type ParsedImageUpscaleRequest = z.infer<typeof imageUpscaleRequestSchema>;
export type ImageUpscaleRequest = z.input<typeof imageUpscaleRequestSchema>;
