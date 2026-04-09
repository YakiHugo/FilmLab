import type {
  ImageAspectRatio,
  ImageInputAssetBinding,
  ImageProviderId,
  ImagePromptCompilerOperationId,
  ImagePromptContinuityTarget,
  ImagePromptIntentEditOp,
  ImagePromptIntentInput,
  ImageGenerationOperation,
  ImageStyleId,
} from "./imageGeneration";
import type { FrontendImageModelId } from "./imageModelCatalog";

export type ImageLabTurnStatus = "loading" | "done" | "error";

export interface ImageLabCreativeStateView {
  prompt: string | null;
  preserve: string[];
  avoid: string[];
  styleDirectives: string[];
  continuityTargets: ImagePromptContinuityTarget[];
  editOps: ImagePromptIntentEditOp[];
  referenceAssetIds: string[];
}

export interface ImageLabPromptStateView {
  committed: ImageLabCreativeStateView;
  candidate: ImageLabCreativeStateView | null;
  baseAssetId: string | null;
  candidateTurnId: string | null;
  revision: number;
}

export interface ImageLabTurnRequestView {
  modelId: FrontendImageModelId;
  aspectRatio: ImageAspectRatio;
  width: number | null;
  height: number | null;
  style: ImageStyleId;
  stylePreset: string;
  negativePrompt: string;
  promptIntent: ImagePromptIntentInput;
  operation: ImageGenerationOperation;
  inputAssets: ImageInputAssetBinding[];
  seed: number | null;
  guidanceScale: number | null;
  steps: number | null;
  sampler: string;
  batchSize: number;
  modelParams: Record<string, string | number | boolean | null>;
}

export interface ImageLabResultView {
  id: string;
  imageUrl: string;
  imageId: string | null;
  assetId: string | null;
  provider: ImageProviderId;
  model: string;
  mimeType?: string;
  revisedPrompt?: string | null;
  index: number;
  saved: boolean;
}

export interface ImageLabTurnView {
  id: string;
  prompt: string;
  createdAt: string;
  retryOfTurnId: string | null;
  status: ImageLabTurnStatus;
  error: string | null;
  warnings: string[];
  request: ImageLabTurnRequestView;
  runtimeProvider: ImageProviderId;
  providerModel: string;
  runCount: number;
  executedTargetLabel: string | null;
  referencedAssetIds: string[];
  primaryAssetIds: string[];
  results: ImageLabResultView[];
}

export interface ImageLabCreativeBriefView {
  latestPrompt: string | null;
  latestModelId: FrontendImageModelId | null;
  acceptedAssetId: string | null;
  selectedAssetIds: string[];
  recentAssetRefIds: string[];
}

export interface ImageLabConversationView {
  conversationId: string;
  createdAt: string;
  updatedAt: string;
  creativeBrief: ImageLabCreativeBriefView;
  promptState: ImageLabPromptStateView;
  turns: ImageLabTurnView[];
}

export interface ImageLabPromptArtifactTurnDeltaView {
  prompt: string;
  preserve: string[];
  avoid: string[];
  styleDirectives: string[];
  continuityTargets: ImageLabCreativeStateView["continuityTargets"];
  editOps: ImageLabCreativeStateView["editOps"];
  referenceAssetIds: string[];
}

export interface ImageLabPromptArtifactPromptIRView {
  operation: ImagePromptCompilerOperationId;
  goal: string;
  preserve: string[];
  negativeConstraints: string[];
  styleDirectives: string[];
  continuityTargets: ImageLabCreativeStateView["continuityTargets"];
  editOps: ImageLabCreativeStateView["editOps"];
  sourceAssets: ImageInputAssetBinding[];
  referenceAssets: ImageInputAssetBinding[];
  inputAssets: ImageInputAssetBinding[];
  output: {
    aspectRatio: string;
    width: number | null;
    height: number | null;
    batchSize: number;
    style: string;
    stylePreset: string | null;
  };
}

export interface ImageLabSemanticLossView {
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

export interface ImageLabPromptArtifactHashesView {
  stateHash: string;
  irHash: string;
  prefixHash: string;
  payloadHash: string;
}

export interface ImageLabPromptArtifactView {
  id: string;
  runId: string;
  turnId: string;
  traceId: string | null;
  version: number;
  stage: "rewrite" | "compile" | "dispatch";
  targetKey: string | null;
  attempt: number | null;
  compilerVersion: string;
  capabilityVersion: string;
  originalPrompt: string;
  promptIntent: ImagePromptIntentInput | null;
  turnDelta: ImageLabPromptArtifactTurnDeltaView | null;
  committedStateBefore: ImageLabCreativeStateView | null;
  candidateStateAfter: ImageLabCreativeStateView | null;
  promptIR: ImageLabPromptArtifactPromptIRView | null;
  compiledPrompt: string | null;
  dispatchedPrompt: string | null;
  providerEffectivePrompt: string | null;
  semanticLosses: ImageLabSemanticLossView[];
  warnings: string[];
  hashes: ImageLabPromptArtifactHashesView;
  createdAt: string;
}

export interface ImageLabPromptArtifactsView {
  turnId: string;
  versions: ImageLabPromptArtifactView[];
}

export interface ImageLabObservabilityOverviewView {
  totalTurns: number;
  turnsWithArtifacts: number;
  degradedTurns: number;
  fallbackTurns: number;
}

export interface ImageLabObservabilityLossSummaryView {
  code: ImageLabSemanticLossView["code"];
  occurrenceCount: number;
  turnCount: number;
  latestCreatedAt: string;
}

export interface ImageLabObservabilityTargetSummaryView {
  targetKey: string;
  compileArtifactCount: number;
  dispatchArtifactCount: number;
  degradedDispatchCount: number;
  latestCreatedAt: string;
}

export interface ImageLabObservabilityTurnSummaryView {
  turnId: string;
  prompt: string;
  createdAt: string;
  artifactCount: number;
  semanticLossCodes: ImageLabSemanticLossView["code"][];
  degraded: boolean;
  fallback: boolean;
  selectedTargetKey: string | null;
  executedTargetKey: string | null;
}

export interface ImageLabObservabilityView {
  conversationId: string;
  overview: ImageLabObservabilityOverviewView;
  semanticLosses: ImageLabObservabilityLossSummaryView[];
  targets: ImageLabObservabilityTargetSummaryView[];
  turns: ImageLabObservabilityTurnSummaryView[];
}
