import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  getDefaultImageModelParams,
  getImageModelParamDefinitions,
  type ImageModelParamValue,
} from "@/lib/ai/imageModelParams";
import {
  DEFAULT_IMAGE_PROVIDER,
  getDefaultImageModelForProvider,
  getImageModelConfig,
  getImageProviderConfig,
} from "@/lib/ai/imageProviders";
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
  width: 1024,
  height: 1024,
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

const normalizeModelParamValue = (
  expectedType: "select" | "number" | "boolean",
  value: unknown,
  defaultValue: ImageModelParamValue
): ImageModelParamValue => {
  if (expectedType === "number") {
    return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
  }
  if (expectedType === "boolean") {
    return typeof value === "boolean" ? value : defaultValue;
  }
  return typeof value === "string" ? value : defaultValue;
};

const sanitizeModelParams = (
  providerId: ImageProviderId,
  modelId: string,
  modelParams: Record<string, ImageModelParamValue>
) => {
  const fields = getImageModelParamDefinitions(providerId, modelId);
  if (fields.length === 0) {
    return {};
  }
  return fields.reduce<Record<string, ImageModelParamValue>>((accumulator, field) => {
    accumulator[field.key] = normalizeModelParamValue(
      field.type,
      modelParams[field.key],
      field.defaultValue
    );
    return accumulator;
  }, {});
};

const sanitizeConfig = (config: GenerationConfig): GenerationConfig => {
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
    width:
      typeof config.width === "number" && Number.isFinite(config.width)
        ? Math.max(256, Math.round(config.width))
        : null,
    height:
      typeof config.height === "number" && Number.isFinite(config.height)
        ? Math.max(256, Math.round(config.height))
        : null,
    batchSize: Math.min(
      modelConfig?.maxBatchSize ?? 4,
      Math.max(1, Math.round(config.batchSize || 1))
    ),
    modelParams: sanitizeModelParams(
      config.provider,
      model,
      config.modelParams ?? {}
    ),
  };

  if (!provider.supportedFeatures.styles) {
    next.style = "none";
    next.stylePreset = "";
  }
  if (!provider.supportedFeatures.negativePrompt) {
    next.negativePrompt = "";
  }
  if (!provider.supportedFeatures.referenceImages) {
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
  }

  return next;
};

export const useGenerationConfigStore = create<GenerationConfigState>()(
  devtools(
    (set) => ({
      config: DEFAULT_CONFIG,
      setProvider: (provider) =>
        set((state) => ({
          config: sanitizeConfig({
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
          config: sanitizeConfig({
            ...state.config,
            model,
            modelParams: getDefaultImageModelParams(state.config.provider, model),
          }),
        })),
      updateConfig: (patch) =>
        set((state) => ({
          config: sanitizeConfig({
            ...state.config,
            ...patch,
          }),
        })),
      addReferenceImages: (entries) =>
        set((state) => ({
          config: sanitizeConfig({
            ...state.config,
            referenceImages: [...state.config.referenceImages, ...entries].slice(0, 4),
          }),
        })),
      updateReferenceImage: (id, patch) =>
        set((state) => ({
          config: sanitizeConfig({
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
          config: sanitizeConfig({
            ...state.config,
            referenceImages: state.config.referenceImages.filter((entry) => entry.id !== id),
          }),
        })),
      clearReferenceImages: () =>
        set((state) => ({
          config: sanitizeConfig({
            ...state.config,
            referenceImages: [],
          }),
        })),
    }),
    { name: "GenerationConfigStore", enabled: process.env.NODE_ENV === "development" }
  )
);
