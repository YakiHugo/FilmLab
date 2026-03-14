import { z } from "zod";
import {
  IMAGE_REQUEST_PROVIDER_IDS,
  IMAGE_UPSCALE_SCALES,
  type ImageUpscaleScale,
} from "../../../shared/imageGeneration";
import type { ImageRequestProviderId } from "../../../shared/imageGeneration";

export const imageUpscaleScaleSchema = z.enum(IMAGE_UPSCALE_SCALES);

export const imageUpscaleRequestSchema = z
  .object({
    provider: z.enum(IMAGE_REQUEST_PROVIDER_IDS),
    model: z.string().trim().min(1).default("doubao-seedream-5-0-260128"),
    imageId: z.string().trim().min(1),
    scale: imageUpscaleScaleSchema.default("2x"),
  });

export type ParsedImageUpscaleRequest = z.infer<typeof imageUpscaleRequestSchema>;
export type ImageUpscaleRequest = z.input<typeof imageUpscaleRequestSchema>;

export type { ImageRequestProviderId, ImageUpscaleScale };
