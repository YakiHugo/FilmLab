import type { RuntimeImageProviderId } from "../../../../shared/imageGeneration";
import type {
  FrontendImageModelId,
  ImageCapabilityId,
  ImageDeploymentId,
  ImageGenerationConstraintSummary,
  ImageModelDefaults,
  LogicalImageModelId,
  ProviderModelId,
} from "../../../../shared/imageModelCatalog";
import type { ImageModelParamDefinition } from "../../../../shared/imageModelParams";

export type RuntimeProviderId = RuntimeImageProviderId;
export type RuntimeCredentialSlotId = RuntimeProviderId;
export type ImageOperation = "generate" | "upscale";

export interface FrontendModelSpec {
  id: FrontendImageModelId;
  label: string;
  logicalModel: LogicalImageModelId;
  capability: "image.generate";
  routingPolicy: "primary";
  visible: boolean;
  description?: string;
  constraints: ImageGenerationConstraintSummary;
  parameterDefinitions: ImageModelParamDefinition[];
  defaults: ImageModelDefaults;
}

export interface DeploymentSpec {
  id: ImageDeploymentId;
  logicalModel: LogicalImageModelId;
  provider: RuntimeProviderId;
  providerModel: ProviderModelId;
  capability: ImageCapabilityId;
  enabled: boolean;
  priority: number;
}

export interface ProviderSpec {
  id: RuntimeProviderId;
  name: string;
  credentialSlot: RuntimeCredentialSlotId;
  operations: ImageOperation[];
  healthScope: "model_operation";
}

export interface ResolvedRouteTarget {
  frontendModel: FrontendModelSpec;
  deployment: DeploymentSpec;
  provider: ProviderSpec;
}

export interface RouterSelectionInput {
  modelId: FrontendImageModelId;
  capability: ImageCapabilityId;
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
