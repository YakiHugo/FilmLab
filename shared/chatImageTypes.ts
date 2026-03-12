import type {
  ImageGenerationRequest,
  ReferenceImage,
} from "./imageGeneration";
import type {
  FrontendImageModelId,
  ImageDeploymentId,
  LogicalImageModelId,
} from "./imageModelCatalog";

export type GenerationJobStatus = "running" | "succeeded" | "failed";
export type PersistedGenerationTurnStatus = "loading" | "done" | "error";

export interface PersistedReferenceImageSnapshot extends Omit<ReferenceImage, "url"> {
  url?: string;
}

export interface PersistedImageGenerationRequestSnapshot
  extends Omit<ImageGenerationRequest, "referenceImages">,
    Record<string, unknown> {
  referenceImages?: PersistedReferenceImageSnapshot[];
}

export interface GenerationJobSnapshot {
  id: string;
  turnId: string;
  modelId: FrontendImageModelId;
  logicalModel: LogicalImageModelId;
  deploymentId: ImageDeploymentId;
  runtimeProvider: string;
  providerModel: string;
  compiledPrompt: string;
  requestSnapshot: PersistedImageGenerationRequestSnapshot;
  status: GenerationJobStatus;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PersistedResultItem {
  id: string;
  imageUrl: string;
  imageId: string | null;
  runtimeProvider: string;
  providerModel: string;
  mimeType?: string;
  revisedPrompt?: string | null;
  index: number;
  assetId: string | null;
  saved: boolean;
}

export interface PersistedGenerationTurn {
  id: string;
  prompt: string;
  createdAt: string;
  retryOfTurnId: string | null;
  modelId: FrontendImageModelId;
  logicalModel: LogicalImageModelId;
  deploymentId: ImageDeploymentId;
  runtimeProvider: string;
  providerModel: string;
  configSnapshot: Record<string, unknown>;
  status: PersistedGenerationTurnStatus;
  error: string | null;
  warnings: string[];
  jobId: string | null;
  results: PersistedResultItem[];
}

export interface PersistedImageSession {
  id: string;
  turns: PersistedGenerationTurn[];
  jobs: GenerationJobSnapshot[];
  createdAt: string;
  updatedAt: string;
}
