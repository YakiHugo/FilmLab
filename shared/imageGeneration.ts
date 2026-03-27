import type { ImageModelPromptCompilerCapabilities } from "./imageModelCatalog";

export const IMAGE_PROVIDER_IDS = ["ark", "dashscope", "kling"] as const;
export type ImageProviderId = (typeof IMAGE_PROVIDER_IDS)[number];

export const IMAGE_RUNTIME_PROVIDER_IDS = IMAGE_PROVIDER_IDS;
export type RuntimeImageProviderId = ImageProviderId;

export const IMAGE_MODEL_FAMILY_IDS = ["seedream", "qwen", "zimage", "kling"] as const;
export type ImageModelFamilyId = (typeof IMAGE_MODEL_FAMILY_IDS)[number];

export const IMAGE_PROVIDER_REF_IDS = ["seedream", "qwen", "zimage", "kling", "ark", "dashscope"] as const;
export type ImageProviderRefId = (typeof IMAGE_PROVIDER_REF_IDS)[number];

export const IMAGE_REQUEST_PROVIDER_IDS = IMAGE_PROVIDER_REF_IDS;
export type ImageRequestProviderId = ImageProviderRefId;

export const IMAGE_ASPECT_RATIOS = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "21:9",
  "custom",
] as const;
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export const IMAGE_STYLE_IDS = [
  "photorealistic",
  "cinematic",
  "anime",
  "digital-art",
  "oil-painting",
  "watercolor",
  "sketch",
  "3d-render",
  "pixel-art",
  "none",
] as const;
export type ImageStyleId = (typeof IMAGE_STYLE_IDS)[number];

export const REFERENCE_IMAGE_TYPES = ["style", "content", "controlnet"] as const;
export type ReferenceImageType = (typeof REFERENCE_IMAGE_TYPES)[number];

export const IMAGE_UPSCALE_SCALES = ["2x", "4x"] as const;
export type ImageUpscaleScale = (typeof IMAGE_UPSCALE_SCALES)[number];

export const IMAGE_GENERATION_OPERATIONS = ["generate", "edit", "variation"] as const;
export type ImageGenerationOperation = (typeof IMAGE_GENERATION_OPERATIONS)[number];

export const IMAGE_INPUT_ASSET_BINDINGS = ["guide", "source"] as const;
export type ImageInputAssetBindingKind = (typeof IMAGE_INPUT_ASSET_BINDINGS)[number];

export const IMAGE_PROMPT_ASSET_ROLES = ["reference", "edit", "variation"] as const;
export type ImagePromptAssetRole = (typeof IMAGE_PROMPT_ASSET_ROLES)[number];

// Legacy alias retained for model capability contracts while request/input state migrates.
export type ImageGenerationAssetRefRole = ImagePromptAssetRole;

export const IMAGE_PROMPT_COMPILER_OPERATION_IDS = [
  "image.generate",
  "image.edit",
  "image.variation",
] as const;
export type ImagePromptCompilerOperationId =
  (typeof IMAGE_PROMPT_COMPILER_OPERATION_IDS)[number];

export const IMAGE_PROMPT_CONTINUITY_TARGETS = [
  "subject",
  "style",
  "composition",
  "text",
] as const;
export type ImagePromptContinuityTarget =
  (typeof IMAGE_PROMPT_CONTINUITY_TARGETS)[number];

export const IMAGE_PROMPT_EDIT_OPS = [
  "add",
  "remove",
  "replace",
  "emphasize",
  "deemphasize",
] as const;
export type ImagePromptEditOperation = (typeof IMAGE_PROMPT_EDIT_OPS)[number];

export const IMAGE_GENERATION_RETRY_MODES = ["exact", "recompile"] as const;
export type ImageGenerationRetryMode =
  (typeof IMAGE_GENERATION_RETRY_MODES)[number];

export interface ImagePromptIntentEditOp {
  op: ImagePromptEditOperation;
  target: string;
  value?: string;
}

export interface ImagePromptIntentInput {
  preserve: string[];
  avoid: string[];
  styleDirectives: string[];
  continuityTargets: ImagePromptContinuityTarget[];
  editOps: ImagePromptIntentEditOp[];
}

export interface ImageInputAssetBinding {
  assetId: string;
  binding: ImageInputAssetBindingKind;
  guideType?: ReferenceImageType;
  weight?: number;
}

export interface LegacyReferenceImage {
  id?: string;
  url?: string;
  fileName?: string;
  weight?: number;
  type?: ReferenceImageType;
  sourceAssetId?: string;
}

export interface LegacyImageGenerationAssetRef {
  assetId: string;
  role: ImageGenerationAssetRefRole;
  referenceType?: ReferenceImageType;
  weight?: number;
}

export const LEGACY_INPUT_IMAGES_UNAVAILABLE_WARNING =
  "Some legacy input images could not be restored because this historical request was stored without reusable asset handles.";

export interface ImageInputAssetValidationIssue {
  path: Array<string | number>;
  message: string;
}

const normalizeGuideMetadataByAssetId = (
  referenceImages: LegacyReferenceImage[] | undefined
) => {
  const byAssetId = new Map<
    string,
    { guideType?: ReferenceImageType; weight?: number }
  >();
  for (const entry of referenceImages ?? []) {
    if (!entry.sourceAssetId) {
      continue;
    }
    byAssetId.set(entry.sourceAssetId, {
      ...(entry.type ? { guideType: entry.type } : {}),
      ...(typeof entry.weight === "number" ? { weight: entry.weight } : {}),
    });
  }
  return byAssetId;
};

export const hasLegacyUnrestorableInputImages = (
  referenceImages: LegacyReferenceImage[] | null | undefined
) =>
  (referenceImages ?? []).some(
    (entry) =>
      typeof entry.url === "string" &&
      entry.url.trim().length > 0 &&
      typeof entry.sourceAssetId !== "string"
  );

export const dedupeImageInputAssets = (
  inputAssets: ImageInputAssetBinding[] | undefined
) => {
  const dedupedByAssetId = new Map<string, ImageInputAssetBinding>();

  for (const inputAsset of inputAssets ?? []) {
    const existing = dedupedByAssetId.get(inputAsset.assetId);
    if (!existing) {
      dedupedByAssetId.set(inputAsset.assetId, {
        ...inputAsset,
      });
      continue;
    }

    if (existing.binding === "source") {
      continue;
    }

    if (inputAsset.binding === "source") {
      dedupedByAssetId.set(inputAsset.assetId, {
        assetId: inputAsset.assetId,
        binding: "source",
      });
      continue;
    }

    dedupedByAssetId.set(inputAsset.assetId, {
      assetId: inputAsset.assetId,
      binding: "guide",
      guideType: existing.guideType ?? inputAsset.guideType,
      weight: existing.weight ?? inputAsset.weight,
    });
  }

  return Array.from(dedupedByAssetId.values());
};

export const resolveLegacyImageGenerationInputs = (input: {
  operation?: ImageGenerationOperation | null;
  inputAssets?: ImageInputAssetBinding[] | null;
  referenceImages?: LegacyReferenceImage[] | null;
  assetRefs?: LegacyImageGenerationAssetRef[] | null;
}): {
  operation: ImageGenerationOperation;
  inputAssets: ImageInputAssetBinding[];
} => {
  const guideMetadataByAssetId = normalizeGuideMetadataByAssetId(input.referenceImages ?? undefined);
  const mappedLegacyAssetRefs = (input.assetRefs ?? []).map<ImageInputAssetBinding>((assetRef) => {
    if (assetRef.role === "reference") {
      const guideMetadata = guideMetadataByAssetId.get(assetRef.assetId);
      return {
        assetId: assetRef.assetId,
        binding: "guide",
        guideType:
          assetRef.referenceType ?? guideMetadata?.guideType ?? "content",
        ...(typeof assetRef.weight === "number"
          ? { weight: assetRef.weight }
          : typeof guideMetadata?.weight === "number"
            ? { weight: guideMetadata.weight }
            : {}),
      };
    }

    return {
      assetId: assetRef.assetId,
      binding: "source",
    };
  });

  for (const referenceImage of input.referenceImages ?? []) {
    if (!referenceImage.sourceAssetId) {
      continue;
    }

    mappedLegacyAssetRefs.push({
      assetId: referenceImage.sourceAssetId,
      binding: "guide",
      guideType: referenceImage.type ?? "content",
      ...(typeof referenceImage.weight === "number"
        ? { weight: referenceImage.weight }
        : {}),
    });
  }

  const hasEditSource = (input.assetRefs ?? []).some((assetRef) => assetRef.role === "edit");
  const hasVariationSource = (input.assetRefs ?? []).some(
    (assetRef) => assetRef.role === "variation"
  );
  const inferredOperation = hasEditSource
    ? "edit"
    : hasVariationSource
      ? "variation"
      : "generate";
  const explicitInputAssets = Array.isArray(input.inputAssets)
    ? dedupeImageInputAssets(input.inputAssets)
    : [];
  const normalizedInputAssets = dedupeImageInputAssets([
    ...explicitInputAssets,
    ...mappedLegacyAssetRefs,
  ]);

  if (input.operation && (input.operation !== "generate" || inferredOperation === "generate")) {
    return {
      operation: input.operation,
      inputAssets: normalizedInputAssets,
    };
  }

  return {
    operation: inferredOperation,
    inputAssets: normalizedInputAssets,
  };
};

export const getImageInputSourceAssets = (
  inputAssets: ImageInputAssetBinding[] | undefined
) => (inputAssets ?? []).filter((inputAsset) => inputAsset.binding === "source");

export const getImageInputGuideAssets = (
  inputAssets: ImageInputAssetBinding[] | undefined
) => (inputAssets ?? []).filter((inputAsset) => inputAsset.binding === "guide");

export const resolveImagePromptCompilerOperation = (
  operation: ImageGenerationOperation | undefined
): ImagePromptCompilerOperationId => {
  switch (operation ?? "generate") {
    case "edit":
      return "image.edit";
    case "variation":
      return "image.variation";
    default:
      return "image.generate";
  }
};

const resolveSourceRoleForPromptCompiler = (
  operation: ImageGenerationOperation | undefined | null
): "edit" | "variation" =>
  resolveImagePromptCompilerOperation(operation ?? "generate") === "image.variation"
    ? "variation"
    : "edit";

export const projectInputAssetsForPromptCompiler = (input: {
  inputAssets: ImageInputAssetBinding[];
  operation?: ImageGenerationOperation | null;
  promptCompiler: ImageModelPromptCompilerCapabilities;
}): ImageInputAssetBinding[] => {
  const sourceRole = resolveSourceRoleForPromptCompiler(input.operation);

  return input.inputAssets.flatMap<ImageInputAssetBinding>((entry) => {
    if (entry.binding === "guide") {
      return input.promptCompiler.referenceRoleHandling.reference === "compiled_to_text"
        ? []
        : [{ ...entry }];
    }

    const sourceHandling = input.promptCompiler.referenceRoleHandling[sourceRole];
    if (
      input.promptCompiler.sourceImageExecution === "unsupported" ||
      sourceHandling === "compiled_to_text"
    ) {
      return [];
    }

    if (sourceHandling === "compiled_to_reference") {
      return [
        {
          assetId: entry.assetId,
          binding: "guide",
          guideType: "content",
        },
      ];
    }

    return [{ ...entry }];
  });
};

export const countExecutableInputAssetsForPromptCompiler = (input: {
  inputAssets: ImageInputAssetBinding[];
  operation?: ImageGenerationOperation | null;
  promptCompiler: ImageModelPromptCompilerCapabilities;
}) => projectInputAssetsForPromptCompiler(input).length;

export const resolveExactRetryNegativePrompt = (input: {
  negativePrompt?: string | null;
  semanticLosses?: Array<{ code?: string | null } | null> | null;
}) => {
  const normalizedNegativePrompt = input.negativePrompt?.trim();
  if (!normalizedNegativePrompt) {
    return undefined;
  }

  const wasMergedIntoMainPrompt = (input.semanticLosses ?? []).some(
    (loss) => loss?.code === "NEGATIVE_PROMPT_DEGRADED_TO_TEXT"
  );
  return wasMergedIntoMainPrompt ? undefined : normalizedNegativePrompt;
};

export const resolveOperationSourceRole = (
  operation: ImageGenerationOperation | undefined
): ImagePromptAssetRole =>
  operation === "edit" ? "edit" : operation === "variation" ? "variation" : "reference";

export const validateImageInputAssets = (input: {
  operation: ImageGenerationOperation | undefined;
  inputAssets: ImageInputAssetBinding[] | undefined;
}): ImageInputAssetValidationIssue[] => {
  const operation = input.operation ?? "generate";
  const inputAssets = input.inputAssets ?? [];
  const sourceAssets = getImageInputSourceAssets(inputAssets);
  const issues: ImageInputAssetValidationIssue[] = [];

  if (operation === "generate" && sourceAssets.length > 0) {
    issues.push({
      path: ["inputAssets"],
      message: "Generate requests do not accept source assets.",
    });
  }

  if ((operation === "edit" || operation === "variation") && sourceAssets.length !== 1) {
    issues.push({
      path: ["inputAssets"],
      message: `${operation} requests require exactly one source asset.`,
    });
  }

  if (sourceAssets.length > 1) {
    issues.push({
      path: ["inputAssets"],
      message: "Only one source asset is allowed in a single request.",
    });
  }

  inputAssets.forEach((inputAsset, index) => {
    if (inputAsset.binding === "source") {
      if (inputAsset.guideType) {
        issues.push({
          path: ["inputAssets", index, "guideType"],
          message: "guideType is only valid for guide bindings.",
        });
      }
      if (typeof inputAsset.weight === "number") {
        issues.push({
          path: ["inputAssets", index, "weight"],
          message: "weight is only valid for guide bindings.",
        });
      }
    }
  });

  return issues;
};

export interface RequestedImageGenerationTarget {
  modelId?: import("./imageModelCatalog").FrontendImageModelId;
  logicalModel?: import("./imageModelCatalog").LogicalImageModelId;
  deploymentId?: import("./imageModelCatalog").ImageDeploymentId;
  provider?: ImageProviderId;
}

export interface ImageGenerationRequest {
  prompt: string;
  promptIntent?: ImagePromptIntentInput;
  negativePrompt?: string;
  conversationId?: string;
  threadId?: string;
  retryOfTurnId?: string;
  retryMode?: ImageGenerationRetryMode;
  clientTurnId?: string;
  clientJobId?: string;
  modelId: import("./imageModelCatalog").FrontendImageModelId;
  aspectRatio: ImageAspectRatio;
  width?: number;
  height?: number;
  style?: ImageStyleId;
  stylePreset?: string;
  operation?: ImageGenerationOperation;
  inputAssets?: ImageInputAssetBinding[];
  seed?: number;
  guidanceScale?: number;
  steps?: number;
  sampler?: string;
  batchSize?: number;
  modelParams?: Record<string, string | number | boolean | null>;
  requestedTarget?: RequestedImageGenerationTarget;
}

export interface GeneratedImage {
  resultId?: string;
  imageUrl: string;
  imageId?: string;
  assetId: string;
  provider: ImageProviderId;
  model: string;
  mimeType?: string;
  revisedPrompt?: string | null;
}

export interface ImageUpscaleRequest {
  provider: ImageProviderRefId;
  model: string;
  imageId: string;
  scale?: ImageUpscaleScale;
}

export interface ImageGenerationResponse {
  conversationId: string;
  threadId: string;
  turnId: string;
  jobId: string;
  runId: string;
  traceId: string;
  modelId: import("./imageModelCatalog").FrontendImageModelId;
  logicalModel: import("./imageModelCatalog").LogicalImageModelId;
  deploymentId: import("./imageModelCatalog").ImageDeploymentId;
  runtimeProvider: ImageProviderId;
  providerModel: string;
  createdAt: string;
  imageId?: string;
  imageUrl?: string;
  images: GeneratedImage[];
  primaryAssetIds: string[];
  warnings?: string[];
}
