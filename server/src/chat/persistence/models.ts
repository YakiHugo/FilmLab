import type { ImageGenerationRequest } from "../../../../shared/imageGenerationSchema";
import type { FrontendImageModelId } from "../../../../shared/imageModelCatalog";
import type {
  CreativeState,
  ConversationCreativeState,
  SemanticLoss,
  TurnDelta,
  PromptIR,
  PromptSnapshot,
  PromptVersionStage,
  PromptVersionRecord,
  PromptVersionHashes,
} from "../../domain/prompt";

export type {
  CreativeState as PersistedCreativeState,
  ConversationCreativeState as PersistedConversationCreativeState,
  SemanticLoss as PersistedSemanticLoss,
  TurnDelta as PersistedPromptArtifactTurnDelta,
  PromptIR as PersistedPromptArtifactPromptIR,
  PromptSnapshot as PersistedPromptSnapshot,
  PromptVersionStage as PersistedPromptArtifactStage,
  PromptVersionRecord as PersistedPromptArtifactRecord,
  PromptVersionHashes as PersistedPromptArtifactHashes,
};

export type GenerationJobStatus = "running" | "succeeded" | "failed";
export type PersistedGenerationTurnStatus = "loading" | "done" | "error";
export type PersistedRunOperation =
  | "image.generate"
  | "image.edit"
  | "image.variation"
  | "text.rewrite"
  | "moderation";
export type PersistedRunStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";
export type PersistedAssetType = "image" | "prompt" | "reference" | "mask";
export type PersistedAssetLocatorType =
  | "generated_image_store"
  | "remote_url"
  | "provider_image_id"
  | "provider_file";
export type PersistedAssetEdgeType =
  | "generated_from_prompt"
  | "edited_from_asset"
  | "variant_of"
  | "referenced_in_turn"
  | "accepted_as_final";

export interface PersistedImageGenerationRequestSnapshot
  extends ImageGenerationRequest,
    Record<string, unknown> {}


export interface GenerationJobSnapshot {
  id: string;
  turnId: string;
  runId: string | null;
  modelId: FrontendImageModelId;
  logicalModel: string;
  deploymentId: string;
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
  logicalModel: string;
  deploymentId: string;
  runtimeProvider: string;
  providerModel: string;
  configSnapshot: Record<string, unknown>;
  status: PersistedGenerationTurnStatus;
  error: string | null;
  warnings: string[];
  jobId: string | null;
  runIds: string[];
  referencedAssetIds: string[];
  primaryAssetIds: string[];
  results: PersistedResultItem[];
}

export interface PersistedThreadCreativeBrief {
  latestPrompt: string | null;
  latestModelId: FrontendImageModelId | null;
  acceptedAssetId: string | null;
  selectedAssetIds: string[];
  recentAssetRefIds: string[];
}

export interface PersistedThreadRecord {
  id: string;
  creativeBrief: PersistedThreadCreativeBrief;
  promptState: ConversationCreativeState;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedRunTargetSnapshot {
  modelId: string | null;
  logicalModel: string | null;
  deploymentId: string | null;
  runtimeProvider: string;
  providerModel: string;
  pinned: boolean;
}

export interface PersistedRunTelemetry {
  traceId: string | null;
  providerRequestId: string | null;
  providerTaskId: string | null;
  latencyMs: number | null;
}

export interface PersistedRunRecord {
  id: string;
  turnId: string;
  jobId: string | null;
  operation: PersistedRunOperation;
  status: PersistedRunStatus;
  requestedTarget: PersistedRunTargetSnapshot | null;
  selectedTarget: PersistedRunTargetSnapshot | null;
  executedTarget: PersistedRunTargetSnapshot | null;
  prompt: PromptSnapshot | null;
  error: string | null;
  warnings: string[];
  assetIds: string[];
  referencedAssetIds: string[];
  createdAt: string;
  completedAt: string | null;
  telemetry: PersistedRunTelemetry;
}

export interface PersistedAssetLocatorRecord {
  id: string;
  assetId: string;
  locatorType: PersistedAssetLocatorType;
  locatorValue: string;
  mimeType?: string;
  expiresAt: string | null;
}

export interface PersistedAssetRecord {
  id: string;
  turnId: string | null;
  runId: string | null;
  assetType: PersistedAssetType;
  label: string | null;
  metadata: Record<string, unknown>;
  locators: PersistedAssetLocatorRecord[];
  createdAt: string;
}

export interface PersistedAssetEdgeRecord {
  id: string;
  sourceAssetId: string;
  targetAssetId: string;
  edgeType: PersistedAssetEdgeType;
  turnId: string | null;
  runId: string | null;
  createdAt: string;
}

export interface PersistedImageSession {
  id: string;
  thread: PersistedThreadRecord;
  turns: PersistedGenerationTurn[];
  runs: PersistedRunRecord[];
  assets: PersistedAssetRecord[];
  assetEdges: PersistedAssetEdgeRecord[];
  jobs: GenerationJobSnapshot[];
  createdAt: string;
  updatedAt: string;
}

export interface TurnPromptArtifactsResponse {
  turnId: string;
  versions: PromptVersionRecord[];
}

export interface PromptObservabilityOverview {
  totalTurns: number;
  turnsWithArtifacts: number;
  degradedTurns: number;
  fallbackTurns: number;
}

export interface PromptObservabilityLossSummary {
  code: SemanticLoss["code"];
  occurrenceCount: number;
  turnCount: number;
  latestCreatedAt: string;
}

export interface PromptObservabilityTargetSummary {
  targetKey: string;
  compileArtifactCount: number;
  dispatchArtifactCount: number;
  degradedDispatchCount: number;
  latestCreatedAt: string;
}

export interface PromptObservabilityTurnSummary {
  turnId: string;
  prompt: string;
  createdAt: string;
  artifactCount: number;
  semanticLossCodes: SemanticLoss["code"][];
  degraded: boolean;
  fallback: boolean;
  selectedTargetKey: string | null;
  executedTargetKey: string | null;
}

export interface PromptObservabilitySummaryResponse {
  conversationId: string;
  overview: PromptObservabilityOverview;
  semanticLosses: PromptObservabilityLossSummary[];
  targets: PromptObservabilityTargetSummary[];
  turns: PromptObservabilityTurnSummary[];
}
