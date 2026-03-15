import { z } from "zod";
import type { FrontendModelSpec } from "../gateway/router/types";
import {
  IMAGE_GENERATION_LIMITS,
  imageGenerationRequestSchema,
  imageAspectRatioSchema,
  imageStyleSchema,
  referenceImageSchema,
  referenceImageTypeSchema,
  frontendImageModelSchema,
} from "../../../shared/imageGenerationSchema";
import type {
  ImageGenerationRequest,
  ParsedImageGenerationRequest,
} from "../../../shared/imageGenerationSchema";
import {
  resolveImagePromptCompilerOperation,
  type ImageAspectRatio,
  type ReferenceImageType,
} from "../../../shared/imageGeneration";

const appendIssue = (
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  message: string
) => {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message,
  });
};

const estimateDataUrlBytes = (value: string): number | null => {
  const trimmedValue = value.trim();
  const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=]+)$/i.exec(trimmedValue);
  if (!match?.[1]) {
    return null;
  }

  const encoded = match[1];
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((encoded.length * 3) / 4) - padding);
};

export const validateImageGenerationRequestAgainstModel = (
  payload: ParsedImageGenerationRequest,
  frontendModel: FrontendModelSpec,
  ctx: z.RefinementCtx
) => {
  const capability = frontendModel.constraints;
  const label = frontendModel.label;
  const unsupportedFields = new Set(capability.unsupportedFields);
  const operation = resolveImagePromptCompilerOperation(payload.assetRefs);

  if (!capability.supportedAspectRatios.includes(payload.aspectRatio)) {
    appendIssue(
      ctx,
      ["aspectRatio"],
      `${label} does not support aspect ratio ${payload.aspectRatio}.`
    );
  }

  const hasExplicitSize =
    typeof payload.width === "number" || typeof payload.height === "number";
  if (hasExplicitSize) {
    if (!capability.supportsCustomSize) {
      appendIssue(ctx, ["width"], `${label} does not support custom width or height.`);
    }

    if (!payload.width || !payload.height) {
      appendIssue(ctx, ["width"], "Width and height must be provided together.");
    }
  }

  if (payload.aspectRatio === "custom") {
    if (!capability.supportsCustomSize) {
      appendIssue(ctx, ["aspectRatio"], `${label} does not support custom aspect ratios.`);
    }
    if (!payload.width || !payload.height) {
      appendIssue(ctx, ["width"], "Width and height are required when aspectRatio is custom.");
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
        appendIssue(
          ctx,
          ["width"],
          `Width and height do not match aspect ratio ${payload.aspectRatio}.`
        );
      }
    }
  }

  if (unsupportedFields.has("negativePrompt") && payload.negativePrompt) {
    appendIssue(ctx, ["negativePrompt"], `${label} does not support negative prompts.`);
  }

  if (unsupportedFields.has("seed") && typeof payload.seed === "number") {
    appendIssue(ctx, ["seed"], `${label} does not support seeds.`);
  }

  if (unsupportedFields.has("guidanceScale") && typeof payload.guidanceScale === "number") {
    appendIssue(ctx, ["guidanceScale"], `${label} does not support guidance scale.`);
  }

  if (unsupportedFields.has("steps") && typeof payload.steps === "number") {
    appendIssue(ctx, ["steps"], `${label} does not support custom step counts.`);
  }

  if (unsupportedFields.has("style") || unsupportedFields.has("stylePreset")) {
    if (payload.style !== "none") {
      appendIssue(ctx, ["style"], `${label} does not support style hints.`);
    }
    if (payload.stylePreset) {
      appendIssue(ctx, ["stylePreset"], `${label} does not support style presets.`);
    }
  }

  if (capability.referenceImages.enabled) {
    if (payload.referenceImages.length > capability.referenceImages.maxImages) {
      appendIssue(
        ctx,
        ["referenceImages"],
        `${label} supports at most ${capability.referenceImages.maxImages} reference images.`
      );
    }

    payload.referenceImages.forEach((referenceImage, index) => {
      if (!capability.referenceImages.supportedTypes.includes(referenceImage.type)) {
        appendIssue(
          ctx,
          ["referenceImages", index, "type"],
          `${label} does not support reference image type ${referenceImage.type}.`
        );
      }

      if (
        !capability.referenceImages.supportsWeight &&
        typeof referenceImage.weight === "number" &&
        referenceImage.weight !== 1
      ) {
        appendIssue(
          ctx,
          ["referenceImages", index, "weight"],
          `${label} does not support reference image weights.`
        );
      }

      if (typeof capability.referenceImages.maxFileSizeBytes === "number") {
        const estimatedBytes = estimateDataUrlBytes(referenceImage.url);
        if (
          typeof estimatedBytes === "number" &&
          estimatedBytes > capability.referenceImages.maxFileSizeBytes
        ) {
          appendIssue(
            ctx,
            ["referenceImages", index, "url"],
            `${label} reference images must be ${Math.round(
              capability.referenceImages.maxFileSizeBytes / 1024 / 1024
            )} MB or smaller.`
          );
        }
      }
    });
  } else if (payload.referenceImages.length > 0) {
    appendIssue(
      ctx,
      ["referenceImages"],
      `${label} does not support reference images.`
    );
  }

  if (payload.batchSize > capability.maxBatchSize) {
    appendIssue(
      ctx,
      ["batchSize"],
      `${label} supports batch size ${capability.maxBatchSize} at most.`
    );
  }

  if (!frontendModel.promptCompiler.acceptedOperations.includes(operation)) {
    appendIssue(ctx, ["assetRefs"], `${label} does not accept ${operation} requests.`);
  }
};

export {
  IMAGE_GENERATION_LIMITS,
  frontendImageModelSchema,
  imageAspectRatioSchema,
  imageGenerationRequestSchema,
  imageStyleSchema,
  referenceImageSchema,
  referenceImageTypeSchema,
};

export type {
  ImageAspectRatio,
  ImageGenerationRequest,
  ParsedImageGenerationRequest,
  ReferenceImageType,
};
