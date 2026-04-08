import type {
  ImageModelFamilyId,
  ImageProviderId,
} from "../../../../shared/imageGeneration";
import type { RequestedImageGenerationTarget } from "../../../../shared/imageGenerationSchema";
import type {
  FrontendImageModelId,
  ImageCapabilityId,
  ImageGenerationConstraintSummary,
  ImageModelDefaults,
  ImageModelPromptCompilerCapabilities,
  LogicalImageModelId,
} from "../../../../shared/imageModelCatalog";
import type { ImageModelParamDefinition } from "../../../../shared/imageModelParamTypes";

export type RuntimeProviderId = ImageProviderId;
export type RuntimeCredentialSlotId = RuntimeProviderId;
export type ImageOperation = "image.generate" | "image.upscale";

export interface FrontendModelSpec {
  id: FrontendImageModelId;
  label: string;
  logicalModel: LogicalImageModelId;
  modelFamily: ImageModelFamilyId;
  capability: "image.generate";
  routingPolicy: "default";
  visible: boolean;
  description?: string;
  constraints: ImageGenerationConstraintSummary;
  parameterDefinitions: ImageModelParamDefinition[];
  defaults: ImageModelDefaults;
  promptCompiler: ImageModelPromptCompilerCapabilities;
  supportsUpscale: boolean;
}

export interface DeploymentSpec {
  id: string;
  logicalModel: LogicalImageModelId;
  provider: RuntimeProviderId;
  providerModel: string;
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
  family: "http";
}

export interface ResolvedRouteTarget {
  frontendModel: FrontendModelSpec;
  deployment: DeploymentSpec;
  provider: ProviderSpec;
}

export interface RouterSelectionInput {
  modelId: FrontendImageModelId;
  operation: ImageCapabilityId;
  requestedTarget?: RequestedImageGenerationTarget;
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
