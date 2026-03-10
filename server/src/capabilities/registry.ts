import {
  IMAGE_PROVIDERS,
  type ImageModelConfig,
  type ImageProviderConfig,
} from "../../../shared/imageProviderCatalog";
import type { ImageProviderId } from "../shared/imageGenerationSchema";
import {
  providerHealthStore,
  type ProviderHealthSnapshot,
  type ProviderOperation,
  type ProviderHealthStore,
} from "./healthStore";

export interface CapabilityConstraintSummary {
  supportsCustomSize: boolean;
  supportedAspectRatios: string[];
  maxBatchSize: number;
  supportsUpscale: boolean;
  unsupportedFields: string[];
  referenceImages: {
    enabled: boolean;
    maxImages: number;
    supportedTypes: string[];
    supportsWeight: boolean;
  };
}

export interface ProviderModelCapability {
  providerId: ImageProviderId;
  providerName: string;
  credentialSlot: string;
  modelId: string;
  modelName: string;
  description?: string;
  operation: ProviderOperation;
  constraints: CapabilityConstraintSummary;
  health: ProviderHealthSnapshot;
}

const toConstraintSummary = (model: ImageModelConfig): CapabilityConstraintSummary => {
  const features = model.supportedFeatures;
  const unsupportedFields: string[] = [];
  if (!features.negativePrompt) unsupportedFields.push("negativePrompt");
  if (!features.seed) unsupportedFields.push("seed");
  if (!features.guidanceScale) unsupportedFields.push("guidanceScale");
  if (!features.steps) unsupportedFields.push("steps");
  if (!features.styles) unsupportedFields.push("style", "stylePreset");

  return {
    supportsCustomSize: Boolean(model.supportsCustomSize),
    supportedAspectRatios: model.supportedAspectRatios,
    maxBatchSize: model.maxBatchSize ?? 1,
    supportsUpscale: Boolean(features.supportsUpscale),
    unsupportedFields,
    referenceImages: {
      enabled: features.referenceImages.enabled,
      maxImages: features.referenceImages.maxImages,
      supportedTypes: features.referenceImages.supportedTypes,
      supportsWeight: features.referenceImages.supportsWeight,
    },
  };
};

const collectOperationCapabilities = (
  healthStore: ProviderHealthStore,
  provider: ImageProviderConfig,
  model: ImageModelConfig,
  operation: ProviderOperation,
  now: number
): ProviderModelCapability => ({
  providerId: provider.id,
  providerName: provider.name,
  credentialSlot: provider.credentialSlot,
  modelId: model.id,
  modelName: model.name,
  description: model.description,
  operation,
  constraints: toConstraintSummary(model),
  health: healthStore.getSnapshot(provider.id, model.id, operation, now),
});

export const createProviderCapabilitiesRegistry = (healthStore: ProviderHealthStore) => ({
  getProviderCapabilities(now = Date.now()) {
    const providers = IMAGE_PROVIDERS.map((provider) => ({
      providerId: provider.id,
      providerName: provider.name,
      credentialSlot: provider.credentialSlot,
      models: provider.models.map((model) => ({
        modelId: model.id,
        modelName: model.name,
        description: model.description,
        generation: collectOperationCapabilities(healthStore, provider, model, "generate", now),
        upscale: collectOperationCapabilities(healthStore, provider, model, "upscale", now),
      })),
    }));

    const compatibilitySummary = providers.flatMap((provider) =>
      provider.models.map((model) => ({
        providerId: provider.providerId,
        modelId: model.modelId,
        supportsCustomSize: model.generation.constraints.supportsCustomSize,
        supportsUpscale: model.generation.constraints.supportsUpscale,
        unsupportedFields: model.generation.constraints.unsupportedFields,
        supportedAspectRatios: model.generation.constraints.supportedAspectRatios,
        maxBatchSize: model.generation.constraints.maxBatchSize,
        referenceImages: model.generation.constraints.referenceImages,
      }))
    );

    return {
      generatedAt: new Date(now).toISOString(),
      providers,
      compatibilitySummary,
    };
  },
  recordProviderCallResult(input: {
    provider: ImageProviderId;
    model: string;
    operation: ProviderOperation;
    success: boolean;
    latencyMs: number;
    errorType?: string;
    occurredAt?: number;
  }) {
    healthStore.record(input);
  },
});

const defaultRegistry = createProviderCapabilitiesRegistry(providerHealthStore);

export const getProviderCapabilities = defaultRegistry.getProviderCapabilities;
export const recordProviderCallResult = defaultRegistry.recordProviderCallResult;
