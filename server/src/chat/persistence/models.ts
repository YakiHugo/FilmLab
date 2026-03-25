import type {
  ImageGenerationAssetRef,
  ImageGenerationRequest,
  ImagePromptCompilerOperationId,
  ImagePromptContinuityTarget,
  ImagePromptIntentInput,
  ImagePromptIntentEditOp,
  ReferenceImage,
} from "../../../../shared/imageGeneration";
import type { FrontendImageModelId } from "../../../../shared/imageModelCatalog";

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

export interface PersistedReferenceImageSnapshot extends Omit<ReferenceImage, "url"> {
  url?: string;
}

export interface PersistedImageGenerationRequestSnapshot
  extends Omit<ImageGenerationRequest, "referenceImages">,
    Record<string, unknown> {
  referenceImages?: PersistedReferenceImageSnapshot[];
}

export interface PersistedCreativeState {
  prompt: string | null;
  preserve: string[];
  avoid: string[];
  styleDirectives: string[];
  continuityTargets: ImagePromptContinuityTarget[];
  editOps: ImagePromptIntentEditOp[];
  referenceAssetIds: string[];
}

export interface PersistedConversationCreativeState {
  committed: PersistedCreativeState;
  candidate: PersistedCreativeState | null;
  baseAssetId: string | null;
  candidateTurnId: string | null;
  revision: number;
}

export type PersistedPromptArtifactStage = "rewrite" | "compile" | "dispatch";

export interface PersistedPromptArtifactTurnDelta {
  prompt: string;
  preserve: string[];
  avoid: string[];
  styleDirectives: string[];
  continuityTargets: PersistedCreativeState["continuityTargets"];
  editOps: PersistedCreativeState["editOps"];
  referenceAssetIds: string[];
}

export interface PersistedPromptArtifactPromptIR {
  operation: ImagePromptCompilerOperationId;
  goal: string;
  preserve: string[];
  negativeConstraints: string[];
  styleDirectives: string[];
  continuityTargets: PersistedCreativeState["continuityTargets"];
  editOps: PersistedCreativeState["editOps"];
  sourceAssets: ImageGenerationAssetRef[];
  referenceAssets: ImageGenerationAssetRef[];
  assetRefs: ImageGenerationAssetRef[];
  referenceImages: Array<Pick<ReferenceImage, "id" | "type" | "sourceAssetId">>;
  output: {
    aspectRatio: string;
    width: number | null;
    height: number | null;
    batchSize: number;
    style: string;
    stylePreset: string | null;
  };
}

export interface PersistedSemanticLoss {
  code:
    | "APPROXIMATED_AS_REGENERATION"
    | "OPERATION_DEGRADED_TO_IMAGE_GENERATE"
    | "ASSET_ROLE_DEGRADED_TO_REFERENCE_GUIDANCE"
    | "SOURCE_IMAGE_NOT_EXECUTABLE"
    | "EXACT_TEXT_CONTINUITY_AT_RISK"
    | "NEGATIVE_PROMPT_DEGRADED_TO_TEXT"
    | "STYLE_REFERENCE_ROLE_COLLAPSED";
  severity: "info" | "warn" | "error";
  fieldPath: string;
  degradeMode: "dropped" | "approximated" | "merged" | "softened";
  userMessage: string;
  internalDetail?: string;
}

export interface PersistedPromptArtifactHashes {
  stateHash: string;
  irHash: string;
  prefixHash: string;
  payloadHash: string;
}

export interface PersistedPromptArtifactRecord {
  id: string;
  runId: string;
  turnId: string;
  traceId: string | null;
  version: number;
  stage: PersistedPromptArtifactStage;
  targetKey: string | null;
  attempt: number | null;
  compilerVersion: string;
  capabilityVersion: string;
  originalPrompt: string;
  promptIntent: ImagePromptIntentInput | null;
  turnDelta: PersistedPromptArtifactTurnDelta | null;
  committedStateBefore: PersistedCreativeState | null;
  candidateStateAfter: PersistedCreativeState | null;
  promptIR: PersistedPromptArtifactPromptIR | null;
  compiledPrompt: string | null;
  dispatchedPrompt: string | null;
  providerEffectivePrompt: string | null;
  semanticLosses: PersistedSemanticLoss[];
  warnings: string[];
  hashes: PersistedPromptArtifactHashes;
  createdAt: string;
}

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
  threadAssetId: string | null;
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
  promptState: PersistedConversationCreativeState;
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

export interface PersistedPromptSnapshot {
  originalPrompt: string;
  compiledPrompt: string;
  dispatchedPrompt: string | null;
  providerEffectivePrompt: string | null;
  semanticLosses: PersistedSemanticLoss[];
  warnings: string[];
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
  prompt: PersistedPromptSnapshot | null;
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
  versions: PersistedPromptArtifactRecord[];
}

export interface PromptObservabilityOverview {
  totalTurns: number;
  turnsWithArtifacts: number;
  degradedTurns: number;
  fallbackTurns: number;
}

export interface PromptObservabilityLossSummary {
  code: PersistedSemanticLoss["code"];
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
  semanticLossCodes: PersistedSemanticLoss["code"][];
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
