import type { ImageAspectRatio, ImageProviderId } from "./imageGeneration";

export interface ModelCatalogEntry {
  id: string;
  name: string;
  description?: string;
  supportedAspectRatios: ImageAspectRatio[];
  maxBatchSize?: number;
}

export interface ModelCapabilityEntry {
  provider: ImageProviderId;
  model: string;
  fallbackModels: string[];
  tags: string[];
}

const SEEDREAM_MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: "doubao-seedream-5-0-260128",
    name: "Seedream 5.0",
    description: "Ark text-to-image generation",
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
    maxBatchSize: 1,
  },
  {
    id: "doubao-seedream-4-0-250828",
    name: "Seedream 4.0",
    description: "Ark text-to-image generation",
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
    maxBatchSize: 1,
  },
  {
    id: "qwen-image-2512",
    name: "Qwen Image 2512",
    description: "Ark Qwen text-to-image generation",
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
    maxBatchSize: 1,
  },
  {
    id: "z-image-v1",
    name: "Z Image",
    description: "Ark Z image generation",
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
    maxBatchSize: 1,
  },
  {
    id: "doubao-kling-o1-250424",
    name: "Kling O1",
    description: "Ark cinematic image generation",
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
    maxBatchSize: 1,
  },
];

const SEEDREAM_CAPABILITIES: Record<string, Omit<ModelCapabilityEntry, "provider" | "model">> = {
  "doubao-seedream-5-0-260128": {
    fallbackModels: ["doubao-seedream-4-0-250828", "qwen-image-2512", "z-image-v1"],
    tags: ["seedream", "quality"],
  },
  "doubao-seedream-4-0-250828": {
    fallbackModels: ["qwen-image-2512", "z-image-v1"],
    tags: ["seedream", "balanced"],
  },
  "qwen-image-2512": {
    fallbackModels: ["z-image-v1", "doubao-kling-o1-250424"],
    tags: ["qwen", "prompt-faithful"],
  },
  "z-image-v1": {
    fallbackModels: ["qwen-image-2512", "doubao-seedream-4-0-250828"],
    tags: ["z-image", "stylized"],
  },
  "doubao-kling-o1-250424": {
    fallbackModels: ["doubao-seedream-5-0-260128"],
    tags: ["kling", "cinematic"],
  },
};

export const getProviderModelCatalog = (provider: ImageProviderId): ModelCatalogEntry[] => {
  if (provider === "seedream") {
    return SEEDREAM_MODEL_CATALOG;
  }
  return [];
};

export const isProviderModelSupported = (provider: ImageProviderId, model: string): boolean =>
  getProviderModelCatalog(provider).some((entry) => entry.id === model);

export const getModelCapability = (
  provider: ImageProviderId,
  model: string
): ModelCapabilityEntry | null => {
  if (provider === "seedream") {
    const capability = SEEDREAM_CAPABILITIES[model];
    if (!capability) {
      return null;
    }

    return {
      provider,
      model,
      fallbackModels: capability.fallbackModels,
      tags: capability.tags,
    };
  }

  return {
    provider,
    model,
    fallbackModels: [],
    tags: [],
  };
};

export const resolveModelFallbackChain = (
  provider: ImageProviderId,
  model: string
): string[] => {
  const chain = [model];
  const capability = getModelCapability(provider, model);
  if (!capability) {
    return chain;
  }

  for (const fallbackModel of capability.fallbackModels) {
    if (!chain.includes(fallbackModel)) {
      chain.push(fallbackModel);
    }
  }

  return chain;
};
