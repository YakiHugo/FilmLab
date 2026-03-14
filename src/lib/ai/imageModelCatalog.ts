import { resolveApiUrl } from "@/lib/api/resolveApiUrl";
import type {
  FrontendImageModelCatalogEntry,
  FrontendImageProviderCatalogEntry,
  ImageModelCatalogResponse,
} from "../../../shared/imageModelCatalog";
import type {
  ImageAspectRatio,
  ImageGenerationAssetRef,
  ImageStyleId,
  ReferenceImage,
} from "@/types/imageGeneration";
import type { ImageModelParamValue } from "@/lib/ai/imageModelParams";
import { IMAGE_GENERATION_LIMITS } from "@/lib/ai/imageGenerationSchema";

export type ImageModelCatalog = ImageModelCatalogResponse;
export type ImageModelCatalogEntry = FrontendImageModelCatalogEntry;
export type ImageRuntimeProviderEntry = FrontendImageProviderCatalogEntry;

export interface CatalogDrivenFeatureSupport {
  negativePrompt: boolean;
  seed: boolean;
  guidanceScale: boolean;
  steps: boolean;
  styles: boolean;
  supportsUpscale: boolean;
  referenceImages: ImageModelCatalogEntry["constraints"]["referenceImages"];
}

export interface CatalogDrivenGenerationConfig {
  modelId: ImageModelCatalogEntry["id"];
  aspectRatio: ImageAspectRatio;
  width: number | null;
  height: number | null;
  style: ImageStyleId;
  stylePreset: string;
  negativePrompt: string;
  referenceImages: ReferenceImage[];
  assetRefs: ImageGenerationAssetRef[];
  seed: number | null;
  guidanceScale: number | null;
  steps: number | null;
  sampler: string;
  batchSize: number;
  modelParams: Record<string, ImageModelParamValue>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeCatalogModel = (value: unknown): ImageModelCatalogEntry | null => {
  if (!isRecord(value)) {
    return null;
  }

  return value as unknown as ImageModelCatalogEntry;
};

const normalizeCatalogProvider = (value: unknown): ImageRuntimeProviderEntry | null => {
  if (!isRecord(value)) {
    return null;
  }

  return value as unknown as ImageRuntimeProviderEntry;
};

export const fetchImageModelCatalog = async (): Promise<ImageModelCatalog> => {
  const response = await fetch(resolveApiUrl("/api/models/catalog?capability=image.generate"));
  if (!response.ok) {
    throw new Error("Image model catalog could not be loaded.");
  }

  const json = (await response.json()) as unknown;
  if (!isRecord(json)) {
    throw new Error("Invalid image model catalog response.");
  }

  return {
    generatedAt:
      typeof json.generatedAt === "string" ? json.generatedAt : new Date().toISOString(),
    providers: Array.isArray(json.providers)
      ? json.providers
          .map((entry) => normalizeCatalogProvider(entry))
          .filter((entry): entry is ImageRuntimeProviderEntry => Boolean(entry))
      : [],
    models: Array.isArray(json.models)
      ? json.models
          .map((entry) => normalizeCatalogModel(entry))
          .filter((entry): entry is ImageModelCatalogEntry => Boolean(entry))
      : [],
  };
};

export const getImageModelCatalogEntry = (
  catalog: ImageModelCatalog | null | undefined,
  modelId: string | null | undefined
) => catalog?.models.find((model) => model.id === modelId) ?? null;

export const getRuntimeProviderEntry = (
  catalog: ImageModelCatalog | null | undefined,
  providerId: string | null | undefined
) => catalog?.providers.find((provider) => provider.id === providerId) ?? null;

export const toCatalogFeatureSupport = (
  model: ImageModelCatalogEntry | null | undefined
): CatalogDrivenFeatureSupport => {
  const unsupported = new Set(model?.constraints.unsupportedFields ?? []);
  return {
    negativePrompt: !unsupported.has("negativePrompt"),
    seed: !unsupported.has("seed"),
    guidanceScale: !unsupported.has("guidanceScale"),
    steps: !unsupported.has("steps"),
    styles: !unsupported.has("style") && !unsupported.has("stylePreset"),
    supportsUpscale: model?.supportsUpscale ?? false,
    referenceImages: model?.constraints.referenceImages ?? {
      enabled: false,
      maxImages: 0,
      supportedTypes: [],
      supportsWeight: false,
    },
  };
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

export const createDefaultGenerationConfig = (
  model: ImageModelCatalogEntry
): CatalogDrivenGenerationConfig => ({
  modelId: model.id,
  aspectRatio: model.defaults.aspectRatio,
  width: model.defaults.width,
  height: model.defaults.height,
  style: (model.defaults.style as ImageStyleId) ?? "none",
  stylePreset: model.defaults.stylePreset,
  negativePrompt: model.defaults.negativePrompt,
  referenceImages: [],
  assetRefs: [],
  seed: model.defaults.seed,
  guidanceScale: model.defaults.guidanceScale,
  steps: model.defaults.steps,
  sampler: model.defaults.sampler,
  batchSize: model.defaults.batchSize,
  modelParams: { ...model.defaults.modelParams },
});

export const sanitizeGenerationConfigWithCatalog = (
  config: CatalogDrivenGenerationConfig,
  model: ImageModelCatalogEntry | null | undefined
): CatalogDrivenGenerationConfig => {
  if (!model) {
    return config;
  }

  const supportedAspectRatios = model.constraints.supportedAspectRatios;
  const aspectRatio = supportedAspectRatios.includes(config.aspectRatio)
    ? config.aspectRatio
    : model.defaults.aspectRatio;
  const featureSupport = toCatalogFeatureSupport(model);
  const next: CatalogDrivenGenerationConfig = {
    ...config,
    modelId: model.id,
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
      model.constraints.maxBatchSize,
      Math.max(
        IMAGE_GENERATION_LIMITS.batchSize.min,
        Math.round(config.batchSize || IMAGE_GENERATION_LIMITS.batchSize.min)
      )
    ),
    seed: featureSupport.seed
      ? clampNullableInteger(
          config.seed,
          IMAGE_GENERATION_LIMITS.seed.min,
          IMAGE_GENERATION_LIMITS.seed.max
        )
      : null,
    guidanceScale: featureSupport.guidanceScale
      ? clampNullableNumber(
          config.guidanceScale,
          IMAGE_GENERATION_LIMITS.guidanceScale.min,
          IMAGE_GENERATION_LIMITS.guidanceScale.max
        )
      : null,
    steps: featureSupport.steps
      ? clampNullableInteger(
          config.steps,
          IMAGE_GENERATION_LIMITS.steps.min,
          IMAGE_GENERATION_LIMITS.steps.max
        )
      : null,
    negativePrompt: featureSupport.negativePrompt ? config.negativePrompt : "",
    style: featureSupport.styles ? config.style : "none",
    stylePreset: featureSupport.styles ? config.stylePreset : "",
    assetRefs: [...config.assetRefs],
    modelParams: Object.fromEntries(
      model.parameterDefinitions.map((definition) => [
        definition.key,
        config.modelParams[definition.key] ?? model.defaults.modelParams[definition.key],
      ])
    ),
    referenceImages: featureSupport.referenceImages.enabled
      ? config.referenceImages
          .slice(0, featureSupport.referenceImages.maxImages)
          .map((entry) => ({
            ...entry,
            type: featureSupport.referenceImages.supportedTypes.includes(entry.type)
              ? entry.type
              : featureSupport.referenceImages.supportedTypes[0] ?? "content",
            weight: featureSupport.referenceImages.supportsWeight
              ? clampNullableNumber(entry.weight ?? 1, 0, 1) ?? 1
              : 1,
          }))
      : [],
  };

  if (!model.constraints.supportsCustomSize) {
    next.width = null;
    next.height = null;
    if (next.aspectRatio === "custom") {
      next.aspectRatio = model.defaults.aspectRatio;
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
      const targetRatio = aspectWidth / aspectHeight;
      const requestedRatio = next.width / next.height;
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
