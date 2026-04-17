import type { PromptVersionRecord, PromptVersionStage } from "../../domain/prompt";

export const PROMPT_STAGE_PRIORITY: Record<PromptVersionStage, number> = {
  rewrite: 0,
  compile: 1,
  dispatch: 2,
};

export type PromptVersionAcceptKey = Pick<
  PromptVersionRecord,
  "stage" | "attempt" | "version" | "createdAt"
>;

export const comparePromptVersionsByAcceptPriorityDesc = (
  left: PromptVersionAcceptKey,
  right: PromptVersionAcceptKey
): number => {
  const stageDelta = PROMPT_STAGE_PRIORITY[right.stage] - PROMPT_STAGE_PRIORITY[left.stage];
  if (stageDelta !== 0) {
    return stageDelta;
  }
  const attemptDelta = (right.attempt ?? 0) - (left.attempt ?? 0);
  if (attemptDelta !== 0) {
    return attemptDelta;
  }
  const versionDelta = right.version - left.version;
  if (versionDelta !== 0) {
    return versionDelta;
  }
  return right.createdAt.localeCompare(left.createdAt);
};

export const comparePromptVersionsByArtifactOrderAsc = (
  left: Pick<PromptVersionRecord, "version" | "createdAt">,
  right: Pick<PromptVersionRecord, "version" | "createdAt">
): number => {
  const versionDelta = left.version - right.version;
  if (versionDelta !== 0) {
    return versionDelta;
  }
  return left.createdAt.localeCompare(right.createdAt);
};
