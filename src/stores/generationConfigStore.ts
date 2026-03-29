import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { FrontendImageModelId } from "../../shared/imageModelCatalog";
import type { ImageModelParamValue } from "@/lib/ai/imageModelParams";
import {
  createDefaultGenerationConfig,
  sanitizeGenerationConfigWithCatalog,
  type CatalogDrivenGenerationConfig,
  type ImageModelCatalogEntry,
} from "@/lib/ai/imageModelCatalog";
import type {
  ImageAspectRatio,
  ImageGenerationOperation,
  ImageInputAssetBinding,
  ImagePromptIntentInput,
  ImageStyleId,
} from "@/types/imageGeneration";

export interface GenerationConfig {
  modelId: FrontendImageModelId;
  aspectRatio: ImageAspectRatio;
  width: number | null;
  height: number | null;
  style: ImageStyleId;
  stylePreset: string;
  negativePrompt: string;
  promptIntent: ImagePromptIntentInput;
  operation: ImageGenerationOperation;
  inputAssets: ImageInputAssetBinding[];
  seed: number | null;
  guidanceScale: number | null;
  steps: number | null;
  sampler: string;
  batchSize: number;
  modelParams: Record<string, ImageModelParamValue>;
}

interface GenerationConfigState {
  config: GenerationConfig | null;
  setConfig: (config: GenerationConfig, model?: ImageModelCatalogEntry | null) => void;
  initializeFromModel: (model: ImageModelCatalogEntry) => void;
  setModel: (model: ImageModelCatalogEntry) => void;
  updateConfig: (patch: Partial<GenerationConfig>, model?: ImageModelCatalogEntry | null) => void;
  setInputAssets: (
    inputAssets: ImageInputAssetBinding[],
    model?: ImageModelCatalogEntry | null
  ) => void;
}

const toGenerationConfig = (
  config: CatalogDrivenGenerationConfig
): GenerationConfig => ({
  ...config,
  style: config.style,
});

export const sanitizeGenerationConfig = (
  config: GenerationConfig,
  model?: ImageModelCatalogEntry | null
): GenerationConfig => toGenerationConfig(sanitizeGenerationConfigWithCatalog(config, model));

export const useGenerationConfigStore = create<GenerationConfigState>()(
  devtools(
    (set) => ({
      config: null,
      setConfig: (config, model) =>
        set({
          config: sanitizeGenerationConfig(config, model),
        }),
      initializeFromModel: (model) =>
        set((state) => {
          if (state.config?.modelId === model.id) {
            return state;
          }
          return {
            config: toGenerationConfig(createDefaultGenerationConfig(model)),
          };
        }),
      setModel: (model) =>
        set((state) => {
          const currentConfig = state.config;
          if (!currentConfig) {
            return {
              config: toGenerationConfig(createDefaultGenerationConfig(model)),
            };
          }

          return {
            config: sanitizeGenerationConfig(
              {
                ...currentConfig,
                modelId: model.id,
                modelParams: { ...model.defaults.modelParams },
              },
              model
            ),
          };
        }),
      updateConfig: (patch, model) =>
        set((state) => {
          if (!state.config) {
            return state;
          }
          return {
            config: sanitizeGenerationConfig(
              {
                ...state.config,
                ...patch,
              },
              model
            ),
          };
        }),
      setInputAssets: (inputAssets, model) =>
        set((state) => {
          if (!state.config) {
            return state;
          }
          return {
            config: sanitizeGenerationConfig(
              {
                ...state.config,
                inputAssets: [...inputAssets],
              },
              model
            ),
          };
        }),
    }),
    { name: "GenerationConfigStore", enabled: process.env.NODE_ENV === "development" }
  )
);
