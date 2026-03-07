import type {
  ImageAspectRatio,
  ImageProviderId,
} from "@/types/imageGeneration";

export interface ImageProviderFeatureSupport {
  negativePrompt: boolean;
  referenceImages: boolean;
  seed: boolean;
  guidanceScale: boolean;
  steps: boolean;
  styles: boolean;
}

export interface ImageModelConfig {
  id: string;
  name: string;
  description?: string;
  supportedAspectRatios: ImageAspectRatio[];
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

export const IMAGE_PROVIDERS: ImageProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    models: [
      {
        id: "gpt-image-1",
        name: "GPT Image 1",
        description: "General-purpose image generation",
        supportedAspectRatios: COMMON_ASPECT_RATIOS,
      },
      {
        id: "dall-e-3",
        name: "DALL-E 3",
        description: "Prompt-faithful high quality generation",
        supportedAspectRatios: ["1:1", "16:9", "9:16", "3:2", "2:3"],
        maxBatchSize: 1,
      },
    ],
    supportedFeatures: {
      negativePrompt: false,
      referenceImages: false,
      seed: false,
      guidanceScale: false,
      steps: false,
      styles: true,
    },
  },
  {
    id: "stability",
    name: "Stability AI",
    models: [
      {
        id: "stable-image-core",
        name: "Stable Image Core",
        supportedAspectRatios: COMMON_ASPECT_RATIOS,
        defaultSteps: 30,
      },
      {
        id: "stable-image-ultra",
        name: "Stable Image Ultra",
        supportedAspectRatios: COMMON_ASPECT_RATIOS,
        defaultSteps: 40,
      },
      {
        id: "sd3-large",
        name: "SD3 Large",
        supportedAspectRatios: COMMON_ASPECT_RATIOS,
        defaultSteps: 35,
      },
    ],
    supportedFeatures: {
      negativePrompt: true,
      referenceImages: false,
      seed: true,
      guidanceScale: true,
      steps: true,
      styles: true,
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
        defaultSteps: 30,
      },
      {
        id: "flux-dev",
        name: "Flux Dev",
        supportedAspectRatios: [...COMMON_ASPECT_RATIOS, "custom"],
        defaultSteps: 28,
      },
      {
        id: "flux-schnell",
        name: "Flux Schnell",
        supportedAspectRatios: [...COMMON_ASPECT_RATIOS, "custom"],
        defaultSteps: 20,
      },
    ],
    supportedFeatures: {
      negativePrompt: true,
      referenceImages: true,
      seed: true,
      guidanceScale: true,
      steps: true,
      styles: true,
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
      },
    ],
    supportedFeatures: {
      negativePrompt: true,
      referenceImages: true,
      seed: true,
      guidanceScale: false,
      steps: false,
      styles: true,
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
): ImageModelConfig | undefined => getImageProviderConfig(providerId)?.models.find((model) => model.id === modelId);
