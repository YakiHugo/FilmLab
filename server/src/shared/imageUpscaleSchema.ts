import { z } from "zod";
import {
  IMAGE_REQUEST_PROVIDER_IDS,
  IMAGE_UPSCALE_SCALES,
  type ImageUpscaleScale,
} from "../../../shared/imageGeneration";
import type { ImageRequestProviderId } from "../../../shared/imageGeneration";
import { resolveRouteTarget } from "../gateway/router/registry";

export const imageUpscaleScaleSchema = z.enum(IMAGE_UPSCALE_SCALES);

export const imageUpscaleRequestSchema = z
  .object({
    provider: z.enum(IMAGE_REQUEST_PROVIDER_IDS),
    model: z.string().trim().min(1).default("doubao-seedream-5-0-260128"),
    imageId: z.string().trim().min(1),
    scale: imageUpscaleScaleSchema.default("2x"),
  })
  .superRefine((payload, ctx) => {
    const target = resolveRouteTarget({
      providerId: payload.provider,
      model: payload.model,
      operation: "upscale",
    });

    if (!target) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported model/provider combination: ${payload.provider} / ${payload.model}.`,
        path: ["model"],
      });
    }
  });

export type ParsedImageUpscaleRequest = z.infer<typeof imageUpscaleRequestSchema>;
export type ImageUpscaleRequest = z.input<typeof imageUpscaleRequestSchema>;

export type { ImageRequestProviderId, ImageUpscaleScale };
