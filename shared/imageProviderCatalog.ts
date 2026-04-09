import {
  IMAGE_REQUEST_PROVIDER_IDS,
  IMAGE_PROVIDER_IDS,
  IMAGE_MODEL_FAMILY_IDS,
  type ImageAspectRatio,
  type ImageModelFamilyId,
  type ImageProviderId,
  type ImageProviderRefId,
  type ReferenceImageType,
} from "./imageGeneration";

export type ImageProviderCredentialSlotId = "ark" | "dashscope" | "kling";

export interface ImageReferenceImageCapability {
  enabled: boolean;
  maxImages: number;
  supportedTypes: ReferenceImageType[];
  supportsWeight: boolean;
  maxFileSizeBytes?: number;
}

export interface ImageProviderFeatureSupport {
  negativePrompt: boolean;
  seed: boolean;
  guidanceScale: boolean;
  steps: boolean;
  styles: boolean;
  supportsUpscale?: boolean;
  referenceImages: ImageReferenceImageCapability;
}

export interface ImageModelConfig {
  id: string;
  name: string;
  description?: string;
  supportedAspectRatios: ImageAspectRatio[];
  supportedFeatures: ImageProviderFeatureSupport;
  supportsCustomSize?: boolean;
  defaultSteps?: number;
  costPerImage?: number;
  maxBatchSize?: number;
}

export interface ImageModelFamilyConfig {
  id: ImageModelFamilyId;
  name: string;
  credentialSlot: ImageProviderCredentialSlotId;
  models: ImageModelConfig[];
}

export type ImageProviderConfig = ImageModelFamilyConfig;

const COMMON_ASPECT_RATIOS: ImageAspectRatio[] = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
];

const WIDESCREEN_ASPECT_RATIOS: ImageAspectRatio[] = [...COMMON_ASPECT_RATIOS, "21:9"];
const CUSTOM_WIDESCREEN_ASPECT_RATIOS: ImageAspectRatio[] = [...WIDESCREEN_ASPECT_RATIOS, "custom"];

const NO_REFERENCE_SUPPORT: ImageReferenceImageCapability = {
  enabled: false,
  maxImages: 0,
  supportedTypes: [],
  supportsWeight: false,
};

const SEEDREAM_FEATURES: ImageProviderFeatureSupport = {
  negativePrompt: false,
  seed: false,
  guidanceScale: false,
  steps: false,
  styles: true,
  referenceImages: NO_REFERENCE_SUPPORT,
};

const QWEN_FEATURES: ImageProviderFeatureSupport = {
  negativePrompt: true,
  seed: true,
  guidanceScale: false,
  steps: false,
  styles: true,
  referenceImages: {
    enabled: true,
    maxImages: 3,
    supportedTypes: ["content"],
    supportsWeight: false,
    maxFileSizeBytes: 10 * 1024 * 1024,
  },
};

const Z_IMAGE_FEATURES: ImageProviderFeatureSupport = {
  negativePrompt: false,
  seed: true,
  guidanceScale: false,
  steps: false,
  styles: true,
  referenceImages: NO_REFERENCE_SUPPORT,
};

const KLING_FEATURES: ImageProviderFeatureSupport = {
  negativePrompt: true,
  seed: false,
  guidanceScale: false,
  steps: false,
  styles: true,
  referenceImages: NO_REFERENCE_SUPPORT,
};

const LEGACY_PROVIDER_NAMES: Record<string, string> = {
  ark: "Ark",
  dashscope: "DashScope",
  openai: "OpenAI",
  stability: "Stability AI",
  flux: "Flux",
  ideogram: "Ideogram",
};

const LEGACY_MODEL_NAMES: Record<string, string> = {
  "qwen-image-2512": "Qwen Image 2512",
  "z-image-v1": "Z Image v1",
  "doubao-kling-o1-250424": "Kling O1",
};

export const IMAGE_MODEL_FAMILIES: ImageModelFamilyConfig[] = [
  {
    id: "seedream",
    name: "Seedream",
    credentialSlot: "ark",
    models: [
      {
        id: "doubao-seedream-5-0-260128",
        name: "Seedream 5.0",
        description: "Ark text-to-image generation",
        supportedAspectRatios: COMMON_ASPECT_RATIOS,
        supportedFeatures: SEEDREAM_FEATURES,
        maxBatchSize: 1,
      },
      {
        id: "doubao-seedream-4-0-250828",
        name: "Seedream 4.0",
        description: "Ark text-to-image generation",
        supportedAspectRatios: COMMON_ASPECT_RATIOS,
        supportedFeatures: SEEDREAM_FEATURES,
        maxBatchSize: 1,
      },
    ],
  },
  {
    id: "qwen",
    name: "Qwen Image",
    credentialSlot: "dashscope",
    models: [
      {
        id: "qwen-image-2.0-pro",
        name: "Qwen Image 2.0 Pro",
        description: "DashScope synchronous text-to-image",
        supportedAspectRatios: CUSTOM_WIDESCREEN_ASPECT_RATIOS,
        supportedFeatures: QWEN_FEATURES,
        supportsCustomSize: true,
        maxBatchSize: 6,
      },
      {
        id: "qwen-image-2.0",
        name: "Qwen Image 2.0",
        description: "DashScope synchronous text-to-image",
        supportedAspectRatios: CUSTOM_WIDESCREEN_ASPECT_RATIOS,
        supportedFeatures: QWEN_FEATURES,
        supportsCustomSize: true,
        maxBatchSize: 6,
      },
    ],
  },
  {
    id: "zimage",
    name: "Z Image",
    credentialSlot: "dashscope",
    models: [
      {
        id: "z-image-turbo",
        name: "Z Image Turbo",
        description: "DashScope lightweight text-to-image",
        supportedAspectRatios: CUSTOM_WIDESCREEN_ASPECT_RATIOS,
        supportedFeatures: Z_IMAGE_FEATURES,
        supportsCustomSize: true,
        maxBatchSize: 1,
      },
    ],
  },
  {
    id: "kling",
    name: "Kling",
    credentialSlot: "kling",
    models: [
      {
        id: "kling-v2-1",
        name: "Kling v2.1",
        description: "Kling official image generation API",
        supportedAspectRatios: WIDESCREEN_ASPECT_RATIOS,
        supportedFeatures: KLING_FEATURES,
        maxBatchSize: 9,
      },
      {
        id: "kling-v3",
        name: "Kling v3",
        description: "Kling official image generation API",
        supportedAspectRatios: WIDESCREEN_ASPECT_RATIOS,
        supportedFeatures: KLING_FEATURES,
        maxBatchSize: 9,
      },
    ],
  },
];

export const IMAGE_PROVIDERS = IMAGE_MODEL_FAMILIES;

export const DEFAULT_IMAGE_MODEL_FAMILY: ImageModelFamilyId = "seedream";
export const DEFAULT_IMAGE_PROVIDER = DEFAULT_IMAGE_MODEL_FAMILY;

const PROVIDER_CREDENTIAL_SLOTS: Record<ImageProviderId, ImageProviderCredentialSlotId> = {
  ark: "ark",
  dashscope: "dashscope",
  kling: "kling",
};

const findModelFamilyByModelId = (modelId: string): ImageModelFamilyConfig | undefined =>
  IMAGE_MODEL_FAMILIES.find((modelFamily) => modelFamily.models.some((model) => model.id === modelId));

export const getImageModelFamilyConfig = (
  modelFamilyId: string
): ImageModelFamilyConfig | undefined =>
  IMAGE_MODEL_FAMILIES.find((modelFamily) => modelFamily.id === modelFamilyId);

export const getImageProviderConfig = getImageModelFamilyConfig;

export const getDefaultImageModelForFamily = (modelFamilyId: ImageModelFamilyId): string => {
  const modelFamily = getImageModelFamilyConfig(modelFamilyId);
  return modelFamily?.models[0]?.id ?? "doubao-seedream-5-0-260128";
};

export const getDefaultImageModelForProvider = getDefaultImageModelForFamily;

export const getImageModelConfig = (
  providerId: string,
  modelId: string
): ImageModelConfig | undefined => {
  const normalizedProviderId = normalizeImageProviderRef(providerId, modelId) ?? providerId;
  return getImageModelFamilyConfig(normalizedProviderId)?.models.find((model) => model.id === modelId);
};

export const getImageModelFeatureSupport = (
  providerId: string,
  modelId: string
): ImageProviderFeatureSupport | undefined => getImageModelConfig(providerId, modelId)?.supportedFeatures;

export const getImageProviderCredentialSlot = (
  providerId: string
): ImageProviderCredentialSlotId | undefined =>
  getImageModelFamilyConfig(providerId)?.credentialSlot ??
  PROVIDER_CREDENTIAL_SLOTS[providerId as ImageProviderId];

export const isImageModelFamilyId = (value: string): value is ImageModelFamilyId =>
  (IMAGE_MODEL_FAMILY_IDS as readonly string[]).includes(value);

export const isImageProviderId = (value: string): value is ImageProviderId =>
  (IMAGE_PROVIDER_IDS as readonly string[]).includes(value);

export const isImageProviderRefId = (value: string): value is ImageProviderRefId =>
  (IMAGE_REQUEST_PROVIDER_IDS as readonly string[]).includes(value);

export const normalizeImageProviderRef = (
  providerId: string,
  modelId: string
): ImageModelFamilyId | null => {
  const directModelFamily = getImageModelFamilyConfig(providerId);
  if (directModelFamily) {
    return directModelFamily.models.some((model) => model.id === modelId)
      ? directModelFamily.id
      : null;
  }

  const credentialSlot = PROVIDER_CREDENTIAL_SLOTS[providerId as ImageProviderId];
  if (!credentialSlot) {
    return null;
  }

  const modelFamily = IMAGE_MODEL_FAMILIES.find(
    (candidate) =>
      candidate.credentialSlot === credentialSlot &&
      candidate.models.some((model) => model.id === modelId)
  );

  return modelFamily?.id ?? null;
};

export const normalizeImageRequestProvider = normalizeImageProviderRef;

export const getImageProviderName = (providerId: string) =>
  getImageModelFamilyConfig(providerId)?.name ?? LEGACY_PROVIDER_NAMES[providerId] ?? providerId;

export const getImageModelName = (providerId: string, modelId: string) =>
  getImageModelConfig(providerId, modelId)?.name ??
  findModelFamilyByModelId(modelId)?.models.find((model) => model.id === modelId)?.name ??
  LEGACY_MODEL_NAMES[modelId] ??
  modelId;
