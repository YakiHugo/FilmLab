import {
  cloneConversationCreativeState,
  cloneCreativeState,
  type ConversationCreativeState,
  type CreativeState,
} from "../../domain/prompt";

export interface AcceptedStateTraversal {
  findLatestCandidateStateForTurn(turnId: string): Promise<CreativeState | null>;
  getRetryOfTurnId(turnId: string): Promise<string | null>;
}

export const resolveAcceptedCreativeState = async (
  traversal: AcceptedStateTraversal,
  startingTurnId: string
): Promise<CreativeState | null> => {
  const visited = new Set<string>();
  let semanticTurnId: string | null = startingTurnId;

  while (semanticTurnId && !visited.has(semanticTurnId)) {
    visited.add(semanticTurnId);

    const candidate = await traversal.findLatestCandidateStateForTurn(semanticTurnId);
    if (candidate) {
      return candidate;
    }

    semanticTurnId = await traversal.getRetryOfTurnId(semanticTurnId);
  }

  return null;
};

export interface ApplyAcceptedCreativeStateInput {
  currentPromptState: ConversationCreativeState;
  turnId: string;
  assetId: string;
  acceptedState: CreativeState;
}

export interface ApplyAcceptedCreativeStateOutcome {
  nextPromptState: ConversationCreativeState;
  previousBaseAssetId: string | null;
}

export const applyAcceptedCreativeState = (
  input: ApplyAcceptedCreativeStateInput
): ApplyAcceptedCreativeStateOutcome => {
  const nextPromptState = cloneConversationCreativeState(input.currentPromptState);
  const previousBaseAssetId = nextPromptState.baseAssetId;
  nextPromptState.committed = cloneCreativeState(input.acceptedState);
  nextPromptState.candidate = null;
  nextPromptState.candidateTurnId = null;
  nextPromptState.baseAssetId = input.assetId;
  nextPromptState.revision += 1;
  return { nextPromptState, previousBaseAssetId };
};
