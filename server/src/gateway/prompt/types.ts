import type {
  PersistedConversationCreativeState,
  PersistedCreativeState,
  PersistedPromptArtifactPromptIR,
  PersistedPromptArtifactRecord,
  PersistedPromptArtifactStage,
  PersistedPromptArtifactTurnDelta,
  PersistedSemanticLoss,
} from "../../../../shared/chatImageTypes";

export type SemanticLoss = PersistedSemanticLoss;
export type TurnDelta = PersistedPromptArtifactTurnDelta;

export type CreativeState = PersistedCreativeState;
export type ConversationCreativeState = PersistedConversationCreativeState;
export type PromptIR = PersistedPromptArtifactPromptIR;

export interface PromptCompilationContext {
  compilerVersion: string;
  capabilityVersion: string;
  stateBaseRevision: number;
  rewriteModel: string;
  operation: PromptIR["operation"];
  retryMode: "exact" | "recompile";
}

export type PromptVersionStage = PersistedPromptArtifactStage;
export type PromptVersionRecord = PersistedPromptArtifactRecord;

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
