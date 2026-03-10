import type { ImageModelParamDefinition } from "../../../shared/imageModelParams";
import {
  getRuntimeModelFamilies,
  getRuntimeModels,
  getRuntimeProviderConfiguration,
  getRuntimeProviders,
} from "../gateway/router/registry";
import { routerHealth } from "../gateway/router/health";
import type { HealthRecordInput, RuntimeProviderId } from "../gateway/router/types";
import type { ProviderHealthSnapshot } from "./healthStore";

export interface CapabilityConstraintSummary {
  supportsCustomSize: boolean;
  supportedAspectRatios: string[];
  maxBatchSize: number;
  referenceImages: {
    enabled: boolean;
    maxImages: number;
    supportedTypes: string[];
    supportsWeight: boolean;
    maxFileSizeBytes?: number;
  };
  unsupportedFields: string[];
}

export interface ProviderOperationCapability {
  operation: "generate" | "upscale";
  enabled: boolean;
  configured: boolean;
  constraints: CapabilityConstraintSummary;
  parameterDefinitions: ImageModelParamDefinition[];
  health: ProviderHealthSnapshot;
}

export interface ProviderModelCapability {
  providerId: RuntimeProviderId;
  providerName: string;
  credentialSlot: string;
  configured: boolean;
  missingCredential: boolean;
  familyId: string;
  familyName: string;
  legacyProviderAliases: string[];
  modelId: string;
  modelName: string;
  description?: string;
  operations: ProviderOperationCapability[];
  generation: ProviderOperationCapability;
  upscale: ProviderOperationCapability;
}

const toConstraintSummary = (operation: ProviderOperationCapability): CapabilityConstraintSummary => ({
  supportsCustomSize: operation.constraints.supportsCustomSize,
  supportedAspectRatios: operation.constraints.supportedAspectRatios,
  maxBatchSize: operation.constraints.maxBatchSize,
  referenceImages: operation.constraints.referenceImages,
  unsupportedFields: operation.constraints.unsupportedFields,
});

export const createProviderCapabilitiesRegistry = (health = routerHealth) => ({
  getProviderCapabilities(now = Date.now()) {
    const providers = getRuntimeProviders().map((provider) => {
      const providerConfiguration = getRuntimeProviderConfiguration(provider.id);
      const families = getRuntimeModelFamilies().filter((family) => family.provider === provider.id);
      const models = getRuntimeModels()
        .filter((model) => families.some((family) => family.id === model.family))
        .map((model) => {
          const family = families.find((entry) => entry.id === model.family);
          if (!family) {
            throw new Error(`Missing runtime family for model ${model.id}.`);
          }

          const operations = (["generate", "upscale"] as const).map((operation) => {
            const capability = model.operations[operation] ?? {
              operation,
              enabled: false,
              supportsCustomSize: false,
              supportedAspectRatios: [],
              maxBatchSize: 1,
              referenceImages: {
                enabled: false,
                maxImages: 0,
                supportedTypes: [],
                supportsWeight: false,
              },
              unsupportedFields: [],
              parameterDefinitions: [],
            };

            return {
              operation,
              enabled: capability.enabled,
              configured: providerConfiguration.configured,
              constraints: {
                supportsCustomSize: capability.supportsCustomSize,
                supportedAspectRatios: capability.supportedAspectRatios,
                maxBatchSize: capability.maxBatchSize,
                referenceImages: capability.referenceImages,
                unsupportedFields: capability.unsupportedFields,
              },
              parameterDefinitions: capability.parameterDefinitions,
              health: health.getSnapshot(provider.id, model.id, operation, now),
            } satisfies ProviderOperationCapability;
          });

          const generation =
            operations.find((operation) => operation.operation === "generate") ?? operations[0]!;
          const upscale =
            operations.find((operation) => operation.operation === "upscale") ?? operations[1]!;

          return {
            providerId: provider.id,
            providerName: provider.name,
            credentialSlot: provider.credentialSlot,
            configured: providerConfiguration.configured,
            missingCredential: providerConfiguration.missingCredential,
            familyId: family.id,
            familyName: family.displayName,
            legacyProviderAliases: [...family.legacyProviderAliases],
            modelId: model.id,
            modelName: model.displayName,
            description: model.description,
            operations,
            generation,
            upscale,
          } satisfies ProviderModelCapability;
        });

      return {
        providerId: provider.id,
        providerName: provider.name,
        credentialSlot: provider.credentialSlot,
        configured: providerConfiguration.configured,
        missingCredential: providerConfiguration.missingCredential,
        families: families.map((family) => ({
          familyId: family.id,
          familyName: family.displayName,
          legacyProviderAliases: [...family.legacyProviderAliases],
        })),
        models,
      };
    });

    const compatibilitySummary = providers.flatMap((provider) =>
      provider.models.map((model) => ({
        providerId: provider.providerId,
        familyId: model.familyId,
        legacyProviderAliases: [...model.legacyProviderAliases],
        modelId: model.modelId,
        generate: {
          enabled: model.generation.enabled,
          configured: model.generation.configured,
          ...toConstraintSummary(model.generation),
        },
        upscale: {
          enabled: model.upscale.enabled,
          configured: model.upscale.configured,
          ...toConstraintSummary(model.upscale),
        },
      }))
    );

    return {
      generatedAt: new Date(now).toISOString(),
      providers,
      compatibilitySummary,
    };
  },
  recordProviderCallResult(input: HealthRecordInput) {
    health.record(input);
  },
});

const defaultRegistry = createProviderCapabilitiesRegistry();

export const getProviderCapabilities = defaultRegistry.getProviderCapabilities;
export const recordProviderCallResult = defaultRegistry.recordProviderCallResult;
