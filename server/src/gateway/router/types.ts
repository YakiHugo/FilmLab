import type { ImageModelParamDefinition } from "../../../../shared/imageModelParams";

export type RuntimeProviderId = "ark" | "dashscope" | "kling";
export type RuntimeCredentialSlotId = RuntimeProviderId;
export type ModelFamilyId = "seedream" | "qwen" | "zimage" | "kling";
export type LegacyProviderAlias = ModelFamilyId;
export type ImageOperation = "generate" | "upscale";

export interface ReferenceImageCapabilitySummary {
  enabled: boolean;
  maxImages: number;
  supportedTypes: string[];
  supportsWeight: boolean;
  maxFileSizeBytes?: number;
}

export interface OperationCapability {
  operation: ImageOperation;
  enabled: boolean;
  supportsCustomSize: boolean;
  supportedAspectRatios: string[];
  maxBatchSize: number;
  referenceImages: ReferenceImageCapabilitySummary;
  unsupportedFields: string[];
  parameterDefinitions: ImageModelParamDefinition[];
  fallbackModelIds?: string[];
}

export interface ProviderSpec {
  id: RuntimeProviderId;
  name: string;
  credentialSlot: RuntimeCredentialSlotId;
  operations: ImageOperation[];
  healthScope: "model_operation";
}

export interface ModelFamilySpec {
  id: ModelFamilyId;
  provider: RuntimeProviderId;
  displayName: string;
  legacyProviderAliases: LegacyProviderAlias[];
}

export interface ModelSpec {
  id: string;
  family: ModelFamilyId;
  displayName: string;
  description?: string;
  operations: Partial<Record<ImageOperation, OperationCapability>>;
}

export interface ProviderRouteTarget {
  provider: ProviderSpec;
  family: ModelFamilySpec;
  model: ModelSpec;
  operation: ImageOperation;
  capability: OperationCapability;
  legacyProviderAlias: LegacyProviderAlias;
}

export interface RouterSelectionInput {
  providerId: string;
  model: string;
  operation: ImageOperation;
}

export interface HealthRecordInput {
  provider: RuntimeProviderId;
  model: string;
  operation: ImageOperation;
  success: boolean;
  latencyMs: number;
  errorType?: string;
  occurredAt?: number;
}
