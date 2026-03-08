import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  getDefaultImageModelParams,
  sanitizeImageModelParams,
  type ImageModelParamValue,
} from "@/lib/ai/imageModelParams";
import {
  DEFAULT_IMAGE_PROVIDER,
  getDefaultImageModelForProvider,
  getImageModelConfig,
  getImageProviderConfig,
} from "@/lib/ai/imageProviders";
import { IMAGE_GENERATION_LIMITS } from "@/lib/ai/imageGenerationSchema";
import type {
  ImageAspectRatio,
  ImageProviderId,
  ImageStyleId,
  ReferenceImage,
} from "@/types/imageGeneration";

export interface GenerationConfig {
  provider: ImageProviderId;
  model: string;
  aspectRatio: ImageAspectRatio;
  width: number | null;
  height: number | null;
  style: ImageStyleId;
  stylePreset: string;
  negativePrompt: string;
  referenceImages: ReferenceImage[];
  seed: number | null;
  guidanceScale: number | null;
  steps: number | null;
  sampler: string;
  batchSize: number;
  modelParams: Record<string, ImageModelParamValue>;
}

interface GenerationConfigState {
  config: GenerationConfig;
  setProvider: (provider: ImageProviderId) => void;
  setModel: (model: string) => void;
  updateConfig: (patch: Partial<GenerationConfig>) => void;
  addReferenceImages: (entries: ReferenceImage[]) => void;
  updateReferenceImage: (id: string, patch: Partial<ReferenceImage>) => void;
  removeReferenceImage: (id: string) => void;
  clearReferenceImages: () => void;
}

const DEFAULT_CONFIG: GenerationConfig = {
  provider: DEFAULT_IMAGE_PROVIDER,
  model: getDefaultImageModelForProvider(DEFAULT_IMAGE_PROVIDER),
  aspectRatio: "1:1",
  width: null,
  height: null,
  style: "none",
  stylePreset: "",
  negativePrompt: "",
  referenceImages: [],
  seed: null,
  guidanceScale: null,
  steps: null,
  sampler: "",
  batchSize: 1,
  modelParams: getDefaultImageModelParams(
    DEFAULT_IMAGE_PROVIDER,
    getDefaultImageModelForProvider(DEFAULT_IMAGE_PROVIDER)
  ),
};

const clampNullableInteger = (
  value: number | null | undefined,
  minimum: number,
  maximum: number
) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
};

const clampNullableNumber = (
  value: number | null | undefined,
  minimum: number,
  maximum: number
) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(maximum, Math.max(minimum, value));
};

const getDefaultStepsForModel = (
  providerId: ImageProviderId,
  modelId: string
) => getImageModelConfig(providerId, modelId)?.defaultSteps ?? null;

const sanitizeReferenceImages = (
  providerId: ImageProviderId,
  referenceImages: ReferenceImage[]
) => {
  const provider = getImageProviderConfig(providerId);
  const support = provider?.supportedFeatures.referenceImages;
  if (!support?.enabled) {
    return [];
  }

  const fallbackType = support.supportedTypes[0] ?? "content";
  return referenceImages.slice(0, support.maxImages).map((entry) => ({
    ...entry,
    type: support.supportedTypes.includes(entry.type) ? entry.type : fallbackType,
    weight: support.supportsWeight
      ? clampNullableNumber(entry.weight ?? 1, 0, 1) ?? 1
      : 1,
  }));
};

export const sanitizeGenerationConfig = (config: GenerationConfig): GenerationConfig => {
  const provider = getImageProviderConfig(config.provider);
  if (!provider) {
    return DEFAULT_CONFIG;
  }

  const model = provider.models.some((entry) => entry.id === config.model)
    ? config.model
    : provider.models[0]?.id ?? getDefaultImageModelForProvider(config.provider);
  const modelConfig = getImageModelConfig(config.provider, model);

  const supportedAspectRatios = modelConfig?.supportedAspectRatios ?? ["1:1"];
  const aspectRatio = supportedAspectRatios.includes(config.aspectRatio)
    ? config.aspectRatio
    : supportedAspectRatios[0] ?? "1:1";

  const next: GenerationConfig = {
    ...config,
    model,
    aspectRatio,
    width: clampNullableInteger(
      config.width,
      IMAGE_GENERATION_LIMITS.width.min,
      IMAGE_GENERATION_LIMITS.width.max
    ),
    height: clampNullableInteger(
      config.height,
      IMAGE_GENERATION_LIMITS.height.min,
      IMAGE_GENERATION_LIMITS.height.max
    ),
    batchSize: Math.min(
      modelConfig?.maxBatchSize ?? IMAGE_GENERATION_LIMITS.batchSize.max,
      Math.max(
        IMAGE_GENERATION_LIMITS.batchSize.min,
        Math.round(config.batchSize || IMAGE_GENERATION_LIMITS.batchSize.min)
      )
    ),
    seed: clampNullableInteger(
      config.seed,
      IMAGE_GENERATION_LIMITS.seed.min,
      IMAGE_GENERATION_LIMITS.seed.max
    ),
    guidanceScale: clampNullableNumber(
      config.guidanceScale,
      IMAGE_GENERATION_LIMITS.guidanceScale.min,
      IMAGE_GENERATION_LIMITS.guidanceScale.max
    ),
    steps: clampNullableInteger(
      config.steps,
      IMAGE_GENERATION_LIMITS.steps.min,
      IMAGE_GENERATION_LIMITS.steps.max
    ),
    modelParams: sanitizeImageModelParams(
      config.provider,
      model,
      config.modelParams ?? {}
    ),
    referenceImages: sanitizeReferenceImages(config.provider, config.referenceImages ?? []),
  };

  if (!provider.supportedFeatures.styles) {
    next.style = "none";
    next.stylePreset = "";
  }
  if (!provider.supportedFeatures.negativePrompt) {
    next.negativePrompt = "";
  }
  if (!provider.supportedFeatures.referenceImages.enabled) {
    next.referenceImages = [];
  }
  if (!provider.supportedFeatures.seed) {
    next.seed = null;
  }
  if (!provider.supportedFeatures.guidanceScale) {
    next.guidanceScale = null;
  }
  if (!provider.supportedFeatures.steps) {
    next.steps = null;
  } else if (next.steps === null) {
    next.steps = getDefaultStepsForModel(config.provider, model);
  }

  if (!modelConfig?.supportsCustomSize) {
    if (next.aspectRatio === "custom") {
      next.aspectRatio = supportedAspectRatios[0] ?? "1:1";
    }
    if (next.width !== null || next.height !== null) {
      next.width = null;
      next.height = null;
    }
  } else if (
    next.width !== null &&
    next.height !== null &&
    next.aspectRatio !== "custom"
  ) {
    const [rawWidth, rawHeight] = next.aspectRatio.split(":");
    const aspectWidth = Number(rawWidth);
    const aspectHeight = Number(rawHeight);
    if (
      Number.isFinite(aspectWidth) &&
      Number.isFinite(aspectHeight) &&
      aspectWidth > 0 &&
      aspectHeight > 0
    ) {
      const requestedRatio = next.width / next.height;
      const targetRatio = aspectWidth / aspectHeight;
      if (Math.abs(requestedRatio - targetRatio) > 0.02) {
        next.height = Math.max(
          IMAGE_GENERATION_LIMITS.height.min,
          Math.round(next.width / targetRatio)
        );
      }
    }
  }

  return next;
};

export const useGenerationConfigStore = create<GenerationConfigState>()(
  devtools(
    (set) => ({
      config: sanitizeGenerationConfig(DEFAULT_CONFIG),
      setProvider: (provider) =>
        set((state) => ({
          config: sanitizeGenerationConfig({
            ...state.config,
            provider,
            model: getDefaultImageModelForProvider(provider),
            modelParams: getDefaultImageModelParams(
              provider,
              getDefaultImageModelForProvider(provider)
            ),
          }),
        })),
      setModel: (model) =>
        set((state) => ({
          config: sanitizeGenerationConfig({
            ...state.config,
            model,
            modelParams: getDefaultImageModelParams(state.config.provider, model),
          }),
        })),
      updateConfig: (patch) =>
        set((state) => ({
          config: sanitizeGenerationConfig({
            ...state.config,
            ...patch,
          }),
        })),
      addReferenceImages: (entries) =>
        set((state) => ({
          config: sanitizeGenerationConfig({
            ...state.config,
            referenceImages: [...state.config.referenceImages, ...entries],
          }),
        })),
      updateReferenceImage: (id, patch) =>
        set((state) => ({
          config: sanitizeGenerationConfig({
            ...state.config,
            referenceImages: state.config.referenceImages.map((entry) =>
              entry.id === id
                ? {
                    ...entry,
                    ...patch,
                  }
                : entry
            ),
          }),
        })),
      removeReferenceImage: (id) =>
        set((state) => ({
          config: sanitizeGenerationConfig({
            ...state.config,
            referenceImages: state.config.referenceImages.filter((entry) => entry.id !== id),
          }),
        })),
      clearReferenceImages: () =>
        set((state) => ({
          config: sanitizeGenerationConfig({
            ...state.config,
            referenceImages: [],
          }),
        })),
    }),
    { name: "GenerationConfigStore", enabled: process.env.NODE_ENV === "development" }
  )
);
