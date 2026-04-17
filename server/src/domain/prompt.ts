import type {
  ImageInputAssetBinding,
  ImagePromptCompilerOperationId,
  ImagePromptContinuityTarget,
  ImagePromptIntentEditOp,
  ImagePromptIntentInput,
} from "../../../shared/imageGeneration";

export interface CreativeState {
  prompt: string | null;
  preserve: string[];
  avoid: string[];
  styleDirectives: string[];
  continuityTargets: ImagePromptContinuityTarget[];
  editOps: ImagePromptIntentEditOp[];
  referenceAssetIds: string[];
}

export interface ConversationCreativeState {
  committed: CreativeState;
  candidate: CreativeState | null;
  baseAssetId: string | null;
  candidateTurnId: string | null;
  revision: number;
}

export type PromptVersionStage = "rewrite" | "compile" | "dispatch";

export interface TurnDelta {
  prompt: string;
  preserve: string[];
  avoid: string[];
  styleDirectives: string[];
  continuityTargets: CreativeState["continuityTargets"];
  editOps: CreativeState["editOps"];
  referenceAssetIds: string[];
}

export interface PromptIR {
  operation: ImagePromptCompilerOperationId;
  goal: string;
  preserve: string[];
  negativeConstraints: string[];
  styleDirectives: string[];
  continuityTargets: CreativeState["continuityTargets"];
  editOps: CreativeState["editOps"];
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

export interface SemanticLoss {
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

export interface PromptVersionHashes {
  stateHash: string;
  irHash: string;
  prefixHash: string;
  payloadHash: string;
}

export interface PromptVersionRecord {
  id: string;
  runId: string;
  turnId: string;
  traceId: string | null;
  version: number;
  stage: PromptVersionStage;
  targetKey: string | null;
  attempt: number | null;
  compilerVersion: string;
  capabilityVersion: string;
  originalPrompt: string;
  promptIntent: ImagePromptIntentInput | null;
  turnDelta: TurnDelta | null;
  committedStateBefore: CreativeState | null;
  candidateStateAfter: CreativeState | null;
  promptIR: PromptIR | null;
  compiledPrompt: string | null;
  dispatchedPrompt: string | null;
  providerEffectivePrompt: string | null;
  semanticLosses: SemanticLoss[];
  warnings: string[];
  hashes: PromptVersionHashes;
  createdAt: string;
}

export interface PromptCompilationContext {
  compilerVersion: string;
  capabilityVersion: string;
  stateBaseRevision: number;
  rewriteModel: string;
  operation: PromptIR["operation"];
  retryMode: "exact" | "recompile";
}

export interface PromptSnapshot {
  originalPrompt: string;
  compiledPrompt: string;
  dispatchedPrompt: string | null;
  providerEffectivePrompt: string | null;
  semanticLosses: SemanticLoss[];
  warnings: string[];
}

export const createEmptyCreativeState = (): CreativeState => ({
  prompt: null,
  preserve: [],
  avoid: [],
  styleDirectives: [],
  continuityTargets: [],
  editOps: [],
  referenceAssetIds: [],
});

export const createInitialConversationCreativeState =
  (): ConversationCreativeState => ({
    committed: createEmptyCreativeState(),
    candidate: null,
    baseAssetId: null,
    candidateTurnId: null,
    revision: 0,
  });

export const cloneCreativeState = (state: CreativeState): CreativeState => ({
  prompt: state.prompt,
  preserve: [...state.preserve],
  avoid: [...state.avoid],
  styleDirectives: [...state.styleDirectives],
  continuityTargets: [...state.continuityTargets],
  editOps: state.editOps.map((entry) => ({ ...entry })),
  referenceAssetIds: [...state.referenceAssetIds],
});

export const cloneConversationCreativeState = (
  state: ConversationCreativeState
): ConversationCreativeState => ({
  committed: cloneCreativeState(state.committed),
  candidate: state.candidate ? cloneCreativeState(state.candidate) : null,
  baseAssetId: state.baseAssetId,
  candidateTurnId: state.candidateTurnId,
  revision: state.revision,
});
