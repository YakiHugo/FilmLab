import type { ImageAspectRatio, RuntimeImageProviderId, ReferenceImageType } from "./imageGeneration";
import type { ImageModelParamDefinition, ImageModelParamValue } from "./imageModelParams";

export const FRONTEND_IMAGE_MODEL_IDS = [
  "seedream-v5",
  "seedream-v4",
  "qwen-image-2-pro",
  "qwen-image-2",
  "zimage-turbo",
  "kling-v2-1",
  "kling-v3",
] as const;

export type FrontendImageModelId = (typeof FRONTEND_IMAGE_MODEL_IDS)[number];

export const LOGICAL_IMAGE_MODEL_IDS = [
  "image.seedream.v5",
  "image.seedream.v4",
  "image.qwen.v2.pro",
  "image.qwen.v2",
  "image.zimage.turbo",
  "image.kling.v2_1",
  "image.kling.v3",
] as const;

export type LogicalImageModelId = (typeof LOGICAL_IMAGE_MODEL_IDS)[number];

export const IMAGE_CAPABILITY_IDS = ["image.generate", "image.upscale"] as const;
export type ImageCapabilityId = (typeof IMAGE_CAPABILITY_IDS)[number];

export type ImageDeploymentId = string;
export type ProviderModelId = string;

export interface ImageReferenceImageConstraint {
  enabled: boolean;
  maxImages: number;
  supportedTypes: ReferenceImageType[];
  supportsWeight: boolean;
  maxFileSizeBytes?: number;
}

export interface ImageGenerationConstraintSummary {
  supportsCustomSize: boolean;
  supportedAspectRatios: ImageAspectRatio[];
  maxBatchSize: number;
  referenceImages: ImageReferenceImageConstraint;
  unsupportedFields: string[];
}

export interface ImageModelDefaults {
  aspectRatio: ImageAspectRatio;
  width: number | null;
  height: number | null;
  batchSize: number;
  negativePrompt: string;
  style: string;
  stylePreset: string;
  seed: number | null;
  guidanceScale: number | null;
  steps: number | null;
  sampler: string;
  modelParams: Record<string, ImageModelParamValue>;
}

export interface ImageModelHealthSnapshot {
  state: "healthy" | "degraded" | "down" | "unknown";
  score: number;
  successRate: number;
  latencyP95Ms: number;
  sampleSize: number;
  circuitOpen: boolean;
  lastErrorType: string | null;
  updatedAt: string | null;
}

export interface FrontendImageProviderCatalogEntry {
  id: RuntimeImageProviderId;
  name: string;
  configured: boolean;
  missingCredential: boolean;
}

export interface FrontendImageModelCatalogEntry {
  id: FrontendImageModelId;
  label: string;
  logicalModel: LogicalImageModelId;
  capability: "image.generate";
  description?: string;
  visible: boolean;
  constraints: ImageGenerationConstraintSummary;
  parameterDefinitions: ImageModelParamDefinition[];
  defaults: ImageModelDefaults;
  primaryProvider: RuntimeImageProviderId;
  deploymentId: ImageDeploymentId;
  providerModel: ProviderModelId;
  configured: boolean;
  health: ImageModelHealthSnapshot;
}

export interface ImageModelCatalogResponse {
  generatedAt: string;
  providers: FrontendImageProviderCatalogEntry[];
  models: FrontendImageModelCatalogEntry[];
}
