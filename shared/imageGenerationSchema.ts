import { z } from "zod";
import {
  IMAGE_PROVIDER_IDS,
  IMAGE_ASPECT_RATIOS,
  IMAGE_GENERATION_ASSET_REF_ROLES,
  IMAGE_GENERATION_RETRY_MODES,
  IMAGE_PROMPT_CONTINUITY_TARGETS,
  IMAGE_PROMPT_EDIT_OPS,
  IMAGE_STYLE_IDS,
  REFERENCE_IMAGE_TYPES,
  validateImageAssetRefs,
} from "./imageGeneration";
import { FRONTEND_IMAGE_MODEL_IDS, LOGICAL_IMAGE_MODEL_IDS } from "./imageModelCatalog";
import { appendImageModelParamIssues } from "./imageModelParams";

export const frontendImageModelSchema = z.enum(FRONTEND_IMAGE_MODEL_IDS);
export const logicalImageModelSchema = z.enum(LOGICAL_IMAGE_MODEL_IDS);
export const imageProviderSchema = z.enum(IMAGE_PROVIDER_IDS);
export const imageAspectRatioSchema = z.enum(IMAGE_ASPECT_RATIOS);
export const imageStyleSchema = z.enum(IMAGE_STYLE_IDS);
export const referenceImageTypeSchema = z.enum(REFERENCE_IMAGE_TYPES);
export const imageGenerationAssetRefRoleSchema = z.enum(IMAGE_GENERATION_ASSET_REF_ROLES);
export const imageGenerationRetryModeSchema = z.enum(IMAGE_GENERATION_RETRY_MODES);
export const imagePromptContinuityTargetSchema = z.enum(IMAGE_PROMPT_CONTINUITY_TARGETS);
export const imagePromptEditOperationSchema = z.enum(IMAGE_PROMPT_EDIT_OPS);

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
  sourceAssetId: z.string().trim().min(1).optional(),
});

export const requestedImageGenerationTargetSchema = z.object({
  modelId: frontendImageModelSchema.optional(),
  logicalModel: logicalImageModelSchema.optional(),
  deploymentId: z.string().trim().min(1).optional(),
  provider: imageProviderSchema.optional(),
});

export const imageGenerationAssetRefSchema = z.object({
  assetId: z.string().trim().min(1),
  role: imageGenerationAssetRefRoleSchema.default("reference"),
  referenceType: referenceImageTypeSchema.default("content"),
  weight: z.number().min(0).max(1).optional(),
});

export const imagePromptIntentEditOpSchema = z.object({
  op: imagePromptEditOperationSchema,
  target: z.string().trim().min(1),
  value: z.string().trim().optional(),
});

export const imagePromptIntentSchema = z.object({
  preserve: z.array(z.string().trim().min(1)).max(16).default([]),
  avoid: z.array(z.string().trim().min(1)).max(16).default([]),
  styleDirectives: z.array(z.string().trim().min(1)).max(16).default([]),
  continuityTargets: z.array(imagePromptContinuityTargetSchema).max(8).default([]),
  editOps: z.array(imagePromptIntentEditOpSchema).max(16).default([]),
});

export const imageGenerationRequestSchema = z
  .object({
    prompt: z.string().trim().min(1),
    promptIntent: imagePromptIntentSchema.optional(),
    negativePrompt: z.string().trim().optional(),
    conversationId: z.string().trim().min(1).optional(),
    threadId: z.string().trim().min(1).optional(),
    retryOfTurnId: z.string().trim().min(1).optional(),
    retryMode: imageGenerationRetryModeSchema.default("exact"),
    clientTurnId: z.string().trim().min(1).optional(),
    clientJobId: z.string().trim().min(1).optional(),
    modelId: frontendImageModelSchema.default("seedream-v5"),
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
    assetRefs: z.array(imageGenerationAssetRefSchema).max(8).default([]),
    requestedTarget: requestedImageGenerationTargetSchema.optional(),
  })
  .superRefine((payload, ctx) => {
    const hasExplicitSize =
      typeof payload.width === "number" || typeof payload.height === "number";
    if (hasExplicitSize && (!payload.width || !payload.height)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Width and height must be provided together.",
        path: ["width"],
      });
    }

    if (payload.aspectRatio === "custom") {
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

    appendImageModelParamIssues(payload.modelId, payload.modelParams, ctx);

    for (const issue of validateImageAssetRefs(payload.assetRefs)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: issue.path,
      });
    }
  });

export type ParsedImageGenerationRequest = z.infer<typeof imageGenerationRequestSchema>;
export type ImageGenerationRequest = z.input<typeof imageGenerationRequestSchema>;
