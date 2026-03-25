import type {
  PersistedGenerationTurn,
  PersistedPromptArtifactRecord,
  PersistedRunRecord,
  PromptObservabilityLossSummary,
  PromptObservabilitySummaryResponse,
  PromptObservabilityTargetSummary,
  PromptObservabilityTurnSummary,
} from "./models";

type PromptObservabilityTurnSource = Pick<
  PersistedGenerationTurn,
  "id" | "prompt" | "createdAt"
>;

type PromptObservabilityRunSource = Pick<
  PersistedRunRecord,
  "turnId" | "operation" | "selectedTarget" | "executedTarget" | "createdAt"
>;

type PromptObservabilityArtifactSource = Pick<
  PersistedPromptArtifactRecord,
  "turnId" | "stage" | "targetKey" | "semanticLosses" | "createdAt" | "version"
>;

const IMAGE_RUN_OPERATIONS = new Set<PersistedRunRecord["operation"]>([
  "image.generate",
  "image.edit",
  "image.variation",
]);

const toTargetKey = (
  target: PersistedRunRecord["selectedTarget"] | PersistedRunRecord["executedTarget"]
) =>
  target?.runtimeProvider && target.providerModel
    ? `${target.runtimeProvider}:${target.providerModel}`
    : null;

const compareIsoDesc = (left: string, right: string) => right.localeCompare(left);

const compareArtifacts = (
  left: PromptObservabilityArtifactSource,
  right: PromptObservabilityArtifactSource
) => {
  const versionDelta = left.version - right.version;
  if (versionDelta !== 0) {
    return versionDelta;
  }
  return left.createdAt.localeCompare(right.createdAt);
};

export const buildPromptObservabilitySummary = (input: {
  conversationId: string;
  turns: PromptObservabilityTurnSource[];
  runs: PromptObservabilityRunSource[];
  artifacts: PromptObservabilityArtifactSource[];
}): PromptObservabilitySummaryResponse => {
  const turns = [...input.turns].sort((left, right) =>
    compareIsoDesc(left.createdAt, right.createdAt)
  );
  const artifactsByTurnId = input.artifacts.reduce<
    Map<string, PromptObservabilityArtifactSource[]>
  >((map, artifact) => {
    const current = map.get(artifact.turnId) ?? [];
    current.push(artifact);
    current.sort(compareArtifacts);
    map.set(artifact.turnId, current);
    return map;
  }, new Map());
  const imageRunByTurnId = [...input.runs]
    .filter((run) => IMAGE_RUN_OPERATIONS.has(run.operation))
    .sort((left, right) => compareIsoDesc(left.createdAt, right.createdAt))
    .reduce<Map<string, PromptObservabilityRunSource>>((map, run) => {
      if (!map.has(run.turnId)) {
        map.set(run.turnId, run);
      }
      return map;
    }, new Map());
  const semanticLossMap = new Map<
    PromptObservabilityLossSummary["code"],
    PromptObservabilityLossSummary & { turnIds: Set<string> }
  >();
  const targetMap = new Map<string, PromptObservabilityTargetSummary>();

  for (const artifact of input.artifacts) {
    for (const loss of artifact.semanticLosses) {
      const current = semanticLossMap.get(loss.code) ?? {
        code: loss.code,
        occurrenceCount: 0,
        turnCount: 0,
        latestCreatedAt: artifact.createdAt,
        turnIds: new Set<string>(),
      };
      current.occurrenceCount += 1;
      current.turnIds.add(artifact.turnId);
      if (artifact.createdAt.localeCompare(current.latestCreatedAt) > 0) {
        current.latestCreatedAt = artifact.createdAt;
      }
      semanticLossMap.set(loss.code, current);
    }

    if (
      (artifact.stage === "compile" || artifact.stage === "dispatch") &&
      artifact.targetKey
    ) {
      const current = targetMap.get(artifact.targetKey) ?? {
        targetKey: artifact.targetKey,
        compileArtifactCount: 0,
        dispatchArtifactCount: 0,
        degradedDispatchCount: 0,
        latestCreatedAt: artifact.createdAt,
      };
      if (artifact.stage === "compile") {
        current.compileArtifactCount += 1;
      }
      if (artifact.stage === "dispatch") {
        current.dispatchArtifactCount += 1;
        if (artifact.semanticLosses.length > 0) {
          current.degradedDispatchCount += 1;
        }
      }
      if (artifact.createdAt.localeCompare(current.latestCreatedAt) > 0) {
        current.latestCreatedAt = artifact.createdAt;
      }
      targetMap.set(artifact.targetKey, current);
    }
  }

  const turnSummaries: PromptObservabilityTurnSummary[] = turns.map((turn) => {
    const artifacts = artifactsByTurnId.get(turn.id) ?? [];
    const semanticLossCodes = Array.from(
      artifacts.reduce<Set<PromptObservabilityLossSummary["code"]>>((codes, artifact) => {
        for (const loss of artifact.semanticLosses) {
          codes.add(loss.code);
        }
        return codes;
      }, new Set())
    );
    const dispatchTargetKeys = Array.from(
      artifacts.reduce<Set<string>>((targets, artifact) => {
        if (artifact.stage === "dispatch" && artifact.targetKey) {
          targets.add(artifact.targetKey);
        }
        return targets;
      }, new Set())
    );
    const imageRun = imageRunByTurnId.get(turn.id) ?? null;
    const selectedTargetKey = toTargetKey(imageRun?.selectedTarget ?? null);
    const executedTargetKey = toTargetKey(imageRun?.executedTarget ?? null);

    return {
      turnId: turn.id,
      prompt: turn.prompt,
      createdAt: turn.createdAt,
      artifactCount: artifacts.length,
      semanticLossCodes,
      degraded: semanticLossCodes.length > 0,
      fallback:
        (selectedTargetKey !== null &&
          executedTargetKey !== null &&
          selectedTargetKey !== executedTargetKey) ||
        dispatchTargetKeys.length > 1,
      selectedTargetKey,
      executedTargetKey,
    };
  });

  const semanticLosses = [...semanticLossMap.values()]
    .map(({ turnIds, ...summary }) => ({
      ...summary,
      turnCount: turnIds.size,
    }))
    .sort((left, right) => {
      if (left.occurrenceCount !== right.occurrenceCount) {
        return right.occurrenceCount - left.occurrenceCount;
      }
      if (left.turnCount !== right.turnCount) {
        return right.turnCount - left.turnCount;
      }
      const latestDelta = right.latestCreatedAt.localeCompare(left.latestCreatedAt);
      if (latestDelta !== 0) {
        return latestDelta;
      }
      return left.code.localeCompare(right.code);
    });
  const targets = [...targetMap.values()].sort((left, right) => {
    if (left.dispatchArtifactCount !== right.dispatchArtifactCount) {
      return right.dispatchArtifactCount - left.dispatchArtifactCount;
    }
    if (left.compileArtifactCount !== right.compileArtifactCount) {
      return right.compileArtifactCount - left.compileArtifactCount;
    }
    const latestDelta = right.latestCreatedAt.localeCompare(left.latestCreatedAt);
    if (latestDelta !== 0) {
      return latestDelta;
    }
    return left.targetKey.localeCompare(right.targetKey);
  });

  return {
    conversationId: input.conversationId,
    overview: {
      totalTurns: turnSummaries.length,
      turnsWithArtifacts: turnSummaries.filter((turn) => turn.artifactCount > 0).length,
      degradedTurns: turnSummaries.filter((turn) => turn.degraded).length,
      fallbackTurns: turnSummaries.filter((turn) => turn.fallback).length,
    },
    semanticLosses,
    targets,
    turns: turnSummaries,
  };
};
