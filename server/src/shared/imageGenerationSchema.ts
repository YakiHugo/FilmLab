import { z } from "zod";
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_REQUEST_PROVIDER_IDS,
  IMAGE_STYLE_IDS,
  REFERENCE_IMAGE_TYPES,
} from "../../../shared/imageGeneration";
import type {
  ImageAspectRatio,
  ImageProviderId,
  ImageRequestProviderId,
  ImageStyleId,
  ImageUpscaleScale,
  ReferenceImageType,
} from "../../../shared/imageGeneration";
import type {
  ImageModelParamDefinition,
  ImageModelParamValue,
} from "../../../shared/imageModelParams";
import { resolveRouteTarget } from "../gateway/router/registry";

export const imageProviderSchema = z.enum(IMAGE_REQUEST_PROVIDER_IDS);
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

const appendModelParamIssues = (
  definitions: ImageModelParamDefinition[],
  modelParams: Record<string, ImageModelParamValue>,
  ctx: z.RefinementCtx
) => {
  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));

  for (const key of Object.keys(modelParams)) {
    if (!definitionsByKey.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported model param: ${key}.`,
        path: ["modelParams", key],
      });
    }
  }

  for (const definition of definitions) {
    const value = modelParams[definition.key];
    if (value === undefined) {
      continue;
    }

    if (definition.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${definition.label} must be a number.`,
          path: ["modelParams", definition.key],
        });
        continue;
      }

      if (typeof definition.min === "number" && value < definition.min) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${definition.label} must be at least ${definition.min}.`,
          path: ["modelParams", definition.key],
        });
      }

      if (typeof definition.max === "number" && value > definition.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${definition.label} must be at most ${definition.max}.`,
          path: ["modelParams", definition.key],
        });
      }
      continue;
    }

    if (definition.type === "boolean") {
      if (typeof value !== "boolean") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${definition.label} must be a boolean.`,
          path: ["modelParams", definition.key],
        });
      }
      continue;
    }

    if (typeof value !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${definition.label} must be a string.`,
        path: ["modelParams", definition.key],
      });
      continue;
    }

    const optionValues = new Set((definition.options ?? []).map((option) => option.value));
    if (optionValues.size > 0 && !optionValues.has(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${definition.label} must be one of: ${Array.from(optionValues).join(", ")}.`,
        path: ["modelParams", definition.key],
      });
    }
  }
};

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
    const target = resolveRouteTarget({
      providerId: payload.provider,
      model: payload.model,
      operation: "generate",
    });

    if (!target) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported model/provider combination: ${payload.provider} / ${payload.model}.`,
        path: ["model"],
      });
      return;
    }

    const capability = target.capability;
    const unsupportedFields = new Set(capability.unsupportedFields);
    const targetLabel = `${target.family.displayName} ${target.model.displayName}`;

    if (!capability.supportedAspectRatios.includes(payload.aspectRatio)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${targetLabel} does not support aspect ratio ${payload.aspectRatio}.`,
        path: ["aspectRatio"],
      });
    }

    const hasExplicitSize =
      typeof payload.width === "number" || typeof payload.height === "number";
    if (hasExplicitSize) {
      if (!capability.supportsCustomSize) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${targetLabel} does not support custom width or height.`,
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
      if (!capability.supportsCustomSize) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${targetLabel} does not support custom aspect ratios.`,
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

    if (unsupportedFields.has("negativePrompt") && payload.negativePrompt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${targetLabel} does not support negative prompts.`,
        path: ["negativePrompt"],
      });
    }

    if (unsupportedFields.has("seed") && typeof payload.seed === "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${targetLabel} does not support seeds.`,
        path: ["seed"],
      });
    }

    if (unsupportedFields.has("guidanceScale") && typeof payload.guidanceScale === "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${targetLabel} does not support guidance scale.`,
        path: ["guidanceScale"],
      });
    }

    if (unsupportedFields.has("steps") && typeof payload.steps === "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${targetLabel} does not support custom step counts.`,
        path: ["steps"],
      });
    }

    if (unsupportedFields.has("style") || unsupportedFields.has("stylePreset")) {
      if (payload.style !== "none") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${targetLabel} does not support style hints.`,
          path: ["style"],
        });
      }
      if (payload.stylePreset) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${targetLabel} does not support style presets.`,
          path: ["stylePreset"],
        });
      }
    }

    if (capability.referenceImages.enabled) {
      if (payload.referenceImages.length > capability.referenceImages.maxImages) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${targetLabel} supports at most ${capability.referenceImages.maxImages} reference images.`,
          path: ["referenceImages"],
        });
      }

      payload.referenceImages.forEach((referenceImage, index) => {
        if (!capability.referenceImages.supportedTypes.includes(referenceImage.type)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${targetLabel} does not support reference image type ${referenceImage.type}.`,
            path: ["referenceImages", index, "type"],
          });
        }

        if (
          !capability.referenceImages.supportsWeight &&
          typeof referenceImage.weight === "number" &&
          referenceImage.weight !== 1
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${targetLabel} does not support reference image weights.`,
            path: ["referenceImages", index, "weight"],
          });
        }
      });
    }

    if (payload.batchSize > capability.maxBatchSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${targetLabel} supports batch size ${capability.maxBatchSize} at most.`,
        path: ["batchSize"],
      });
    }

    appendModelParamIssues(capability.parameterDefinitions, payload.modelParams, ctx);
  });

export type ParsedImageGenerationRequest = z.infer<typeof imageGenerationRequestSchema>;
export type ImageGenerationRequest = z.input<typeof imageGenerationRequestSchema>;

export type {
  ImageAspectRatio,
  ImageProviderId,
  ImageRequestProviderId,
  ImageStyleId,
  ImageUpscaleScale,
  ReferenceImageType,
};
