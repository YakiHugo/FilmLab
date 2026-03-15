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

export const IMAGE_GENERATION_ASSET_REF_ROLES = [
  "reference",
  "edit",
  "variation",
] as const;
export type ImageGenerationAssetRefRole = (typeof IMAGE_GENERATION_ASSET_REF_ROLES)[number];

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

export interface ReferenceImage {
  id: string;
  url: string;
  fileName?: string;
  weight?: number;
  type: ReferenceImageType;
  sourceAssetId?: string;
}

export interface ImageGenerationAssetRef {
  assetId: string;
  role: ImageGenerationAssetRefRole;
}

export interface ImageAssetRefValidationIssue {
  path: Array<string | number>;
  message: string;
}

export const getImageAssetSourceRefs = (
  assetRefs: ImageGenerationAssetRef[] | undefined
) =>
  (assetRefs ?? []).filter(
    (assetRef) => assetRef.role === "edit" || assetRef.role === "variation"
  );

export const resolveImagePromptCompilerOperation = (
  assetRefs: ImageGenerationAssetRef[] | undefined
): ImagePromptCompilerOperationId => {
  const sourceRefs = getImageAssetSourceRefs(assetRefs);
  if (sourceRefs.some((assetRef) => assetRef.role === "edit")) {
    return "image.edit";
  }
  if (sourceRefs.some((assetRef) => assetRef.role === "variation")) {
    return "image.variation";
  }
  return "image.generate";
};

export const validateImageAssetRefs = (
  assetRefs: ImageGenerationAssetRef[] | undefined
): ImageAssetRefValidationIssue[] => {
  if (!Array.isArray(assetRefs) || assetRefs.length === 0) {
    return [];
  }

  const sourceRefs = getImageAssetSourceRefs(assetRefs);
  if (sourceRefs.length <= 1) {
    return [];
  }

  return [
    {
      path: ["assetRefs"],
      message:
        "Only one source asset is allowed. Use either one edit asset or one variation asset, and keep all other asset refs as reference.",
    },
  ];
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
  referenceImages?: ReferenceImage[];
  seed?: number;
  guidanceScale?: number;
  steps?: number;
  sampler?: string;
  batchSize?: number;
  modelParams?: Record<string, string | number | boolean | null>;
  assetRefs?: ImageGenerationAssetRef[];
  requestedTarget?: RequestedImageGenerationTarget;
}

export interface GeneratedImage {
  resultId?: string;
  imageUrl: string;
  imageId?: string;
  assetId?: string;
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
  modelId: import("./imageModelCatalog").FrontendImageModelId;
  logicalModel: import("./imageModelCatalog").LogicalImageModelId;
  deploymentId: import("./imageModelCatalog").ImageDeploymentId;
  runtimeProvider: ImageProviderId;
  providerModel: string;
  createdAt: string;
  imageId?: string;
  imageUrl?: string;
  images: GeneratedImage[];
  runs: import("./chatImageTypes").PersistedRunRecord[];
  assets: import("./chatImageTypes").PersistedAssetRecord[];
  primaryAssetIds: string[];
  warnings?: string[];
}
