import { z } from "zod";
import type { FrontendModelSpec } from "../gateway/router/types";
import {
  IMAGE_GENERATION_LIMITS,
  imageGenerationRequestSchema,
  imageAspectRatioSchema,
  imageStyleSchema,
  referenceImageTypeSchema,
  frontendImageModelSchema,
} from "../../../shared/imageGenerationSchema";
import type {
  ImageGenerationRequest,
  ParsedImageGenerationRequest,
  RequestedImageGenerationTarget,
} from "../../../shared/imageGenerationSchema";
import {
  resolveImagePromptCompilerOperation,
  validateImageInputAssets,
  type ImageAspectRatio,
  type ReferenceImageType,
} from "../../../shared/imageGeneration";
import { countModelExecutableInputAssets } from "./imageInputAssetExecution";

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

export const validateImageGenerationRequestAgainstModel = (
  payload: ParsedImageGenerationRequest,
  frontendModel: FrontendModelSpec,
  ctx: z.RefinementCtx
) => {
  const capability = frontendModel.constraints;
  const label = frontendModel.label;
  const unsupportedFields = new Set(capability.unsupportedFields);
  const operation = resolveImagePromptCompilerOperation(payload.operation);

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

  for (const issue of validateImageInputAssets({
    operation: payload.operation,
    inputAssets: payload.inputAssets,
  })) {
    appendIssue(ctx, issue.path, issue.message);
  }

  if (capability.referenceImages.enabled) {
    const executableInputAssetCount = countModelExecutableInputAssets({
      inputAssets: payload.inputAssets,
      operation: payload.operation,
      promptCompiler: frontendModel.promptCompiler,
    });
    if (executableInputAssetCount > capability.referenceImages.maxImages) {
      appendIssue(
        ctx,
        ["inputAssets"],
        `${label} supports at most ${capability.referenceImages.maxImages} executable input images.`
      );
    }

    payload.inputAssets.forEach((referenceImage, index) => {
      if (referenceImage.binding !== "guide") {
        return;
      }

      if (
        referenceImage.guideType &&
        !capability.referenceImages.supportedTypes.includes(referenceImage.guideType)
      ) {
        appendIssue(
          ctx,
          ["inputAssets", index, "guideType"],
          `${label} does not support reference image type ${referenceImage.guideType}.`
        );
      }

      if (
        !capability.referenceImages.supportsWeight &&
        typeof referenceImage.weight === "number" &&
        referenceImage.weight !== 1
      ) {
        appendIssue(
          ctx,
          ["inputAssets", index, "weight"],
          `${label} does not support reference image weights.`
        );
      }
    });
  }

  if (payload.batchSize > capability.maxBatchSize) {
    appendIssue(
      ctx,
      ["batchSize"],
      `${label} supports batch size ${capability.maxBatchSize} at most.`
    );
  }

  if (!frontendModel.promptCompiler.acceptedOperations.includes(operation)) {
    appendIssue(ctx, ["operation"], `${label} does not accept ${operation} requests.`);
  }
};

export {
  IMAGE_GENERATION_LIMITS,
  frontendImageModelSchema,
  imageAspectRatioSchema,
  imageGenerationRequestSchema,
  imageStyleSchema,
  referenceImageTypeSchema,
};

export type {
  ImageAspectRatio,
  ImageGenerationRequest,
  ParsedImageGenerationRequest,
  RequestedImageGenerationTarget,
  ReferenceImageType,
};
