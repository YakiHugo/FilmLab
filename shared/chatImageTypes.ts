import type {
  ImageGenerationRequest,
  ReferenceImage,
} from "./imageGeneration";

export type GenerationJobStatus = "running" | "succeeded" | "failed";
export type PersistedGenerationTurnStatus = "loading" | "done" | "error";

export interface PersistedReferenceImageSnapshot extends Omit<ReferenceImage, "url"> {
  url?: string;
}

export interface PersistedImageGenerationRequestSnapshot
  extends Omit<ImageGenerationRequest, "provider" | "referenceImages">,
    Record<string, unknown> {
  provider?: string;
  referenceImages?: PersistedReferenceImageSnapshot[];
}

export interface GenerationJobSnapshot {
  id: string;
  turnId: string;
  provider: string;
  model: string;
  compiledPrompt: string;
  requestSnapshot: PersistedImageGenerationRequestSnapshot;
  status: GenerationJobStatus;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PersistedResultItem {
  imageUrl: string;
  imageId: string | null;
  provider: string;
  model: string;
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
