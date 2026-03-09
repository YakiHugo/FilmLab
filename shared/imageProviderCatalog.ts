import type {
  ImageAspectRatio,
  ImageProviderId,
  ReferenceImageType,
} from "./imageGeneration";
import { getProviderModelCatalog } from "./providerCapabilityRegistry";

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
  supportsCustomSize?: boolean;
  defaultSteps?: number;
  costPerImage?: number;
  maxBatchSize?: number;
}

export interface ImageProviderConfig {
  id: ImageProviderId;
  name: string;
  models: ImageModelConfig[];
  supportedFeatures: ImageProviderFeatureSupport;
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

const LIMITED_ASPECT_RATIOS: ImageAspectRatio[] = ["1:1", "16:9", "9:16", "3:2", "2:3"];

const NO_REFERENCE_SUPPORT: ImageReferenceImageCapability = {
  enabled: false,
  maxImages: 0,
  supportedTypes: [],
  supportsWeight: false,
};

const FLUX_REFERENCE_SUPPORT: ImageReferenceImageCapability = {
  enabled: true,
  maxImages: 4,
  supportedTypes: ["style", "content", "controlnet"],
  supportsWeight: true,
  maxFileSizeBytes: 2_500_000,
};

const IDEOGRAM_REFERENCE_SUPPORT: ImageReferenceImageCapability = {
  enabled: true,
  maxImages: 4,
  supportedTypes: ["style", "content"],
  supportsWeight: false,
  maxFileSizeBytes: 2_500_000,
};

export const IMAGE_PROVIDERS: ImageProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    models: [
      {
        id: "gpt-image-1",
        name: "GPT Image 1",
        description: "General-purpose image generation",
        supportedAspectRatios: LIMITED_ASPECT_RATIOS,
        maxBatchSize: 4,
      },
      {
        id: "dall-e-3",
        name: "DALL-E 3",
        description: "Prompt-faithful high quality generation",
        supportedAspectRatios: LIMITED_ASPECT_RATIOS,
        maxBatchSize: 1,
      },
    ],
    supportedFeatures: {
      negativePrompt: false,
      seed: false,
      guidanceScale: false,
      steps: false,
      styles: true,
      referenceImages: NO_REFERENCE_SUPPORT,
    },
  },
  {
    id: "stability",
    name: "Stability AI",
    models: [
      {
        id: "stable-image-core",
        name: "Stable Image Core",
        supportedAspectRatios: LIMITED_ASPECT_RATIOS,
        defaultSteps: 30,
        maxBatchSize: 4,
      },
      {
        id: "stable-image-ultra",
        name: "Stable Image Ultra",
        supportedAspectRatios: LIMITED_ASPECT_RATIOS,
        defaultSteps: 40,
        maxBatchSize: 4,
      },
      {
        id: "sd3-large",
        name: "SD3 Large",
        supportedAspectRatios: LIMITED_ASPECT_RATIOS,
        defaultSteps: 35,
        maxBatchSize: 4,
      },
    ],
    supportedFeatures: {
      negativePrompt: true,
      seed: true,
      guidanceScale: true,
      steps: true,
      styles: true,
      supportsUpscale: true,
      referenceImages: NO_REFERENCE_SUPPORT,
    },
  },
  {
    id: "flux",
    name: "Flux",
    models: [
      {
        id: "flux-pro",
        name: "Flux Pro",
        supportedAspectRatios: [...COMMON_ASPECT_RATIOS, "custom"],
        supportsCustomSize: true,
        defaultSteps: 30,
        maxBatchSize: 4,
      },
      {
        id: "flux-dev",
        name: "Flux Dev",
        supportedAspectRatios: [...COMMON_ASPECT_RATIOS, "custom"],
        supportsCustomSize: true,
        defaultSteps: 28,
        maxBatchSize: 4,
      },
      {
        id: "flux-schnell",
        name: "Flux Schnell",
        supportedAspectRatios: [...COMMON_ASPECT_RATIOS, "custom"],
        supportsCustomSize: true,
        defaultSteps: 20,
        maxBatchSize: 4,
      },
    ],
    supportedFeatures: {
      negativePrompt: true,
      seed: true,
      guidanceScale: true,
      steps: true,
      styles: true,
      referenceImages: FLUX_REFERENCE_SUPPORT,
    },
  },
  {
    id: "ideogram",
    name: "Ideogram",
    models: [
      {
        id: "ideogram-3",
        name: "Ideogram 3",
        description: "Prompt-faithful image generation with native style controls",
        supportedAspectRatios: COMMON_ASPECT_RATIOS,
        maxBatchSize: 4,
      },
    ],
    supportedFeatures: {
      negativePrompt: true,
      seed: true,
      guidanceScale: false,
      steps: false,
      styles: true,
      referenceImages: IDEOGRAM_REFERENCE_SUPPORT,
    },
  },
  {
    id: "seedream",
    name: "Seedream",
    models: getProviderModelCatalog("seedream"),
    supportedFeatures: {
      negativePrompt: false,
      seed: false,
      guidanceScale: false,
      steps: false,
      styles: true,
      referenceImages: NO_REFERENCE_SUPPORT,
    },
  },
];

export const DEFAULT_IMAGE_PROVIDER: ImageProviderId = "openai";

export const getImageProviderConfig = (providerId: ImageProviderId): ImageProviderConfig | undefined =>
  IMAGE_PROVIDERS.find((provider) => provider.id === providerId);

export const getDefaultImageModelForProvider = (providerId: ImageProviderId): string => {
  const provider = getImageProviderConfig(providerId);
  return provider?.models[0]?.id ?? "gpt-image-1";
};

export const getImageModelConfig = (
  providerId: ImageProviderId,
  modelId: string
): ImageModelConfig | undefined =>
  getImageProviderConfig(providerId)?.models.find((model) => model.id === modelId);
