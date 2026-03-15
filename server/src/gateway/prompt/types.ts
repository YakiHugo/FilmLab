import type {
  PersistedConversationCreativeState,
  PersistedCreativeState,
  PersistedSemanticLoss,
} from "../../../../shared/chatImageTypes";
import type {
  ImageGenerationAssetRef,
  ImagePromptIntentInput,
  ReferenceImage,
} from "../../../../shared/imageGeneration";

export type SemanticLoss = PersistedSemanticLoss;

export interface TurnDelta {
  prompt: string;
  preserve: string[];
  avoid: string[];
  styleDirectives: string[];
  continuityTargets: PersistedCreativeState["continuityTargets"];
  editOps: PersistedCreativeState["editOps"];
  referenceAssetIds: string[];
}

export type CreativeState = PersistedCreativeState;
export type ConversationCreativeState = PersistedConversationCreativeState;

export interface PromptIR {
  operation: "image.generate";
  goal: string;
  preserve: string[];
  negativeConstraints: string[];
  styleDirectives: string[];
  continuityTargets: PersistedCreativeState["continuityTargets"];
  editOps: PersistedCreativeState["editOps"];
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

export interface PromptCompilationContext {
  compilerVersion: string;
  capabilityVersion: string;
  stateBaseRevision: number;
  rewriteModel: string;
  operation: "image.generate";
  retryMode: "exact" | "recompile";
}

export type PromptVersionStage = "rewrite" | "compile" | "dispatch";

export interface PromptVersionRecord {
  id: string;
  runId: string;
  turnId: string;
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
  hashes: {
    stateHash: string;
    irHash: string;
    prefixHash: string;
    payloadHash: string;
  };
  createdAt: string;
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
