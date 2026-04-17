import { createId } from "../../../../../shared/createId";
import type { PromptVersionRecord } from "../../../domain/prompt";
import type { PersistedImageGenerationRequestSnapshot } from "../../persistence/models";

export const buildPromptVersionRecord = (input: {
  runId: string;
  turnId: string;
  traceId: string;
  version: number;
  stage: PromptVersionRecord["stage"];
  compilerVersion: string;
  capabilityVersion: string;
  originalPrompt: string;
  promptIntent: PersistedImageGenerationRequestSnapshot["promptIntent"] | null;
  createdAt: string;
  targetKey?: string | null;
  attempt?: number | null;
  turnDelta?: PromptVersionRecord["turnDelta"];
  committedStateBefore?: PromptVersionRecord["committedStateBefore"];
  candidateStateAfter?: PromptVersionRecord["candidateStateAfter"];
  promptIR?: PromptVersionRecord["promptIR"];
  compiledPrompt?: string | null;
  dispatchedPrompt?: string | null;
  providerEffectivePrompt?: string | null;
  semanticLosses?: PromptVersionRecord["semanticLosses"];
  warnings?: string[];
  hashes: PromptVersionRecord["hashes"];
}): PromptVersionRecord => ({
  id: createId("prompt-version"),
  runId: input.runId,
  turnId: input.turnId,
  traceId: input.traceId,
  version: input.version,
  stage: input.stage,
  targetKey: input.targetKey ?? null,
  attempt: input.attempt ?? null,
  compilerVersion: input.compilerVersion,
  capabilityVersion: input.capabilityVersion,
  originalPrompt: input.originalPrompt,
  promptIntent: (input.promptIntent as PromptVersionRecord["promptIntent"]) ?? null,
  turnDelta: input.turnDelta ?? null,
  committedStateBefore: input.committedStateBefore ?? null,
  candidateStateAfter: input.candidateStateAfter ?? null,
  promptIR: input.promptIR ?? null,
  compiledPrompt: input.compiledPrompt ?? null,
  dispatchedPrompt: input.dispatchedPrompt ?? null,
  providerEffectivePrompt: input.providerEffectivePrompt ?? null,
  semanticLosses: [...(input.semanticLosses ?? [])],
  warnings: [...(input.warnings ?? [])],
  hashes: { ...input.hashes },
  createdAt: input.createdAt,
});
