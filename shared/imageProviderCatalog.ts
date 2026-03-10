import {
  IMAGE_REQUEST_PROVIDER_IDS,
  IMAGE_RUNTIME_PROVIDER_IDS,
  IMAGE_PROVIDER_IDS,
  type ImageAspectRatio,
  type ImageRequestProviderId,
  type ImageProviderId,
  type RuntimeImageProviderId,
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

export interface ImageProviderConfig {
  id: ImageProviderId;
  name: string;
  credentialSlot: ImageProviderCredentialSlotId;
  models: ImageModelConfig[];
}

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
  referenceImages: NO_REFERENCE_SUPPORT,
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

export const IMAGE_PROVIDERS: ImageProviderConfig[] = [
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

export const DEFAULT_IMAGE_PROVIDER: ImageProviderId = "seedream";

const RUNTIME_PROVIDER_CREDENTIAL_SLOTS: Record<
  RuntimeImageProviderId,
  ImageProviderCredentialSlotId
> = {
  ark: "ark",
  dashscope: "dashscope",
  kling: "kling",
};

const findProviderByModelId = (modelId: string): ImageProviderConfig | undefined =>
  IMAGE_PROVIDERS.find((provider) => provider.models.some((model) => model.id === modelId));

export const getImageProviderConfig = (providerId: string): ImageProviderConfig | undefined =>
  IMAGE_PROVIDERS.find((provider) => provider.id === providerId);

export const getDefaultImageModelForProvider = (providerId: ImageProviderId): string => {
  const provider = getImageProviderConfig(providerId);
  return provider?.models[0]?.id ?? "doubao-seedream-5-0-260128";
};

export const getImageModelConfig = (
  providerId: string,
  modelId: string
): ImageModelConfig | undefined => {
  const normalizedProviderId = normalizeImageRequestProvider(providerId, modelId) ?? providerId;
  return getImageProviderConfig(normalizedProviderId)?.models.find((model) => model.id === modelId);
};

export const getImageModelFeatureSupport = (
  providerId: string,
  modelId: string
): ImageProviderFeatureSupport | undefined => getImageModelConfig(providerId, modelId)?.supportedFeatures;

export const getImageProviderCredentialSlot = (
  providerId: string
): ImageProviderCredentialSlotId | undefined =>
  getImageProviderConfig(providerId)?.credentialSlot ??
  RUNTIME_PROVIDER_CREDENTIAL_SLOTS[providerId as RuntimeImageProviderId];

export const isImageProviderId = (value: string): value is ImageProviderId =>
  (IMAGE_PROVIDER_IDS as readonly string[]).includes(value);

export const isImageRuntimeProviderId = (value: string): value is RuntimeImageProviderId =>
  (IMAGE_RUNTIME_PROVIDER_IDS as readonly string[]).includes(value);

export const isImageRequestProviderId = (value: string): value is ImageRequestProviderId =>
  (IMAGE_REQUEST_PROVIDER_IDS as readonly string[]).includes(value);

export const normalizeImageRequestProvider = (
  providerId: string,
  modelId: string
): ImageProviderId | null => {
  const directProvider = getImageProviderConfig(providerId);
  if (directProvider) {
    return directProvider.models.some((model) => model.id === modelId) ? directProvider.id : null;
  }

  const credentialSlot = RUNTIME_PROVIDER_CREDENTIAL_SLOTS[providerId as RuntimeImageProviderId];
  if (!credentialSlot) {
    return null;
  }

  const provider = IMAGE_PROVIDERS.find(
    (candidate) =>
      candidate.credentialSlot === credentialSlot &&
      candidate.models.some((model) => model.id === modelId)
  );

  return provider?.id ?? null;
};

export const getImageProviderName = (providerId: string) =>
  getImageProviderConfig(providerId)?.name ?? LEGACY_PROVIDER_NAMES[providerId] ?? providerId;

export const getImageModelName = (providerId: string, modelId: string) =>
  getImageModelConfig(providerId, modelId)?.name ??
  findProviderByModelId(modelId)?.models.find((model) => model.id === modelId)?.name ??
  LEGACY_MODEL_NAMES[modelId] ??
  modelId;
