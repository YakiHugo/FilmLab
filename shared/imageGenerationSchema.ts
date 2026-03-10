import { z } from "zod";
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_PROVIDER_IDS,
  IMAGE_STYLE_IDS,
  REFERENCE_IMAGE_TYPES,
} from "./imageGeneration";
import {
  getImageModelConfig,
  getImageModelFeatureSupport,
  getImageProviderName,
  getImageProviderConfig,
} from "./imageProviderCatalog";
import { appendImageModelParamIssues } from "./imageModelParams";

export const imageProviderSchema = z.enum(IMAGE_PROVIDER_IDS);
export const imageAspectRatioSchema = z.enum(IMAGE_ASPECT_RATIOS);
export const imageStyleSchema = z.enum(IMAGE_STYLE_IDS);
export const referenceImageTypeSchema = z.enum(REFERENCE_IMAGE_TYPES);

export const IMAGE_GENERATION_LIMITS = {
  width: { min: 256, max: 4096 },
  height: { min: 256, max: 4096 },
  seed: { min: 0, max: 2_147_483_647 },
  guidanceScale: { min: 1, max: 20 },
  steps: { min: 1, max: 80 },
  batchSize: { min: 1, max: 9 },
} as const;

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
    provider: imageProviderSchema.default("seedream"),
    model: z.string().trim().min(1).default("doubao-seedream-5-0-260128"),
    aspectRatio: imageAspectRatioSchema.default("1:1"),
    width: z
      .number()
      .int()
      .min(IMAGE_GENERATION_LIMITS.width.min)
      .max(IMAGE_GENERATION_LIMITS.width.max)
      .optional(),
    height: z
      .number()
      .int()
      .min(IMAGE_GENERATION_LIMITS.height.min)
      .max(IMAGE_GENERATION_LIMITS.height.max)
      .optional(),
    style: imageStyleSchema.default("none"),
    stylePreset: z.string().trim().optional(),
    referenceImages: z.array(referenceImageSchema).max(4).default([]),
    seed: z
      .number()
      .int()
      .min(IMAGE_GENERATION_LIMITS.seed.min)
      .max(IMAGE_GENERATION_LIMITS.seed.max)
      .optional(),
    guidanceScale: z
      .number()
      .min(IMAGE_GENERATION_LIMITS.guidanceScale.min)
      .max(IMAGE_GENERATION_LIMITS.guidanceScale.max)
      .optional(),
    steps: z
      .number()
      .int()
      .min(IMAGE_GENERATION_LIMITS.steps.min)
      .max(IMAGE_GENERATION_LIMITS.steps.max)
      .optional(),
    sampler: z.string().trim().optional(),
    batchSize: z
      .number()
      .int()
      .min(IMAGE_GENERATION_LIMITS.batchSize.min)
      .max(IMAGE_GENERATION_LIMITS.batchSize.max)
      .default(1),
    modelParams: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .default({}),
  })
  .superRefine((payload, ctx) => {
    const provider = getImageProviderConfig(payload.provider);
    if (!provider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported provider: ${payload.provider}.`,
        path: ["provider"],
      });
      return;
    }

    const model = getImageModelConfig(payload.provider, payload.model);
    if (!model) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported model for ${getImageProviderName(payload.provider)}: ${payload.model}.`,
        path: ["model"],
      });
      return;
    }

    const supportedFeatures = getImageModelFeatureSupport(payload.provider, payload.model);
    if (!supportedFeatures) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Model feature metadata is missing for ${provider.name} ${model.name}.`,
        path: ["model"],
      });
      return;
    }

    if (!model.supportedAspectRatios.includes(payload.aspectRatio)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${provider.name} ${model.name} does not support aspect ratio ${payload.aspectRatio}.`,
        path: ["aspectRatio"],
      });
    }

    const hasExplicitSize =
      typeof payload.width === "number" || typeof payload.height === "number";
    if (hasExplicitSize) {
      if (!model.supportsCustomSize) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${provider.name} ${model.name} does not support custom width or height.`,
          path: ["width"],
        });
      }

      if (!payload.width || !payload.height) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Width and height must be provided together.",
          path: ["width"],
        });
      }
    }

    if (payload.aspectRatio === "custom") {
      if (!model.supportsCustomSize) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${provider.name} ${model.name} does not support custom aspect ratios.`,
          path: ["aspectRatio"],
        });
      }
      if (!payload.width || !payload.height) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Width and height are required when aspectRatio is custom.",
          path: ["width"],
        });
      }
    } else if (payload.width && payload.height) {
      const [rawWidth, rawHeight] = payload.aspectRatio.split(":");
      const aspectWidth = Number(rawWidth);
      const aspectHeight = Number(rawHeight);
      if (
        Number.isFinite(aspectWidth) &&
        Number.isFinite(aspectHeight) &&
        aspectWidth > 0 &&
        aspectHeight > 0
      ) {
        const requestedRatio = payload.width / payload.height;
        const targetRatio = aspectWidth / aspectHeight;
        if (Math.abs(requestedRatio - targetRatio) > 0.02) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Width and height do not match aspect ratio ${payload.aspectRatio}.`,
            path: ["width"],
          });
        }
      }
    }

    if (!supportedFeatures.negativePrompt && payload.negativePrompt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${provider.name} ${model.name} does not support negative prompts.`,
        path: ["negativePrompt"],
      });
    }

    if (!supportedFeatures.seed && typeof payload.seed === "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${provider.name} ${model.name} does not support seeds.`,
        path: ["seed"],
      });
    }

    if (
      !supportedFeatures.guidanceScale &&
      typeof payload.guidanceScale === "number"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${provider.name} ${model.name} does not support guidance scale.`,
        path: ["guidanceScale"],
      });
    }

    if (!supportedFeatures.steps && typeof payload.steps === "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${provider.name} ${model.name} does not support custom step counts.`,
        path: ["steps"],
      });
    }

    if (!supportedFeatures.styles) {
      if (payload.style !== "none") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${provider.name} ${model.name} does not support style hints.`,
          path: ["style"],
        });
      }
      if (payload.stylePreset) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${provider.name} ${model.name} does not support style presets.`,
          path: ["stylePreset"],
        });
      }
    }

    const referenceSupport = supportedFeatures.referenceImages;
    if (!referenceSupport.enabled && payload.referenceImages.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${provider.name} ${model.name} does not support reference images.`,
        path: ["referenceImages"],
      });
    }

    if (payload.referenceImages.length > referenceSupport.maxImages) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${provider.name} ${model.name} supports at most ${referenceSupport.maxImages} reference images.`,
        path: ["referenceImages"],
      });
    }

    payload.referenceImages.forEach((referenceImage, index) => {
      if (!referenceSupport.supportedTypes.includes(referenceImage.type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${provider.name} ${model.name} does not support reference image type ${referenceImage.type}.`,
          path: ["referenceImages", index, "type"],
        });
      }

      if (
        !referenceSupport.supportsWeight &&
        typeof referenceImage.weight === "number" &&
        referenceImage.weight !== 1
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${provider.name} ${model.name} does not support reference image weights.`,
          path: ["referenceImages", index, "weight"],
        });
      }
    });

    if (payload.batchSize > (model.maxBatchSize ?? IMAGE_GENERATION_LIMITS.batchSize.max)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${provider.name} ${model.name} supports batch size ${model.maxBatchSize ?? 1} at most.`,
        path: ["batchSize"],
      });
    }

    appendImageModelParamIssues(payload.provider, payload.model, payload.modelParams, ctx);
  });

export type ParsedImageGenerationRequest = z.infer<typeof imageGenerationRequestSchema>;
export type ImageGenerationRequest = z.input<typeof imageGenerationRequestSchema>;
