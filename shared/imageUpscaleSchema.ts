import { z } from "zod";
import { IMAGE_REQUEST_PROVIDER_IDS, IMAGE_UPSCALE_SCALES } from "./imageGeneration";
import { getImageProviderName, normalizeImageRequestProvider } from "./imageProviderCatalog";

export const imageUpscaleScaleSchema = z.enum(IMAGE_UPSCALE_SCALES);

export const imageUpscaleRequestSchema = z
  .object({
    provider: z.enum(IMAGE_REQUEST_PROVIDER_IDS),
    model: z.string().trim().min(1).default("doubao-seedream-5-0-260128"),
    imageId: z.string().trim().min(1),
    scale: imageUpscaleScaleSchema.default("2x"),
  })
  .superRefine((payload, ctx) => {
    const normalizedProviderId = normalizeImageRequestProvider(payload.provider, payload.model);
    if (!normalizedProviderId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported model for ${getImageProviderName(payload.provider)}: ${payload.model}.`,
        path: ["model"],
      });
    }
  });

export type ParsedImageUpscaleRequest = z.output<typeof imageUpscaleRequestSchema>;
export type ImageUpscaleRequest = z.input<typeof imageUpscaleRequestSchema>;
