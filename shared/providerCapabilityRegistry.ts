import type { ImageProviderId } from "./imageGeneration";

export interface ModelCapabilityEntry {
  provider: ImageProviderId;
  model: string;
  fallbackModels: string[];
  tags: string[];
}

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
