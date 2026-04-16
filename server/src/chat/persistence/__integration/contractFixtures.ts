import type { CreateChatGenerationInput } from "../types";

export interface GenerationInputOverrides {
  conversationId?: string;
  turnId?: string;
  jobId?: string;
  runId?: string;
  attemptId?: string;
  retryOfTurnId?: string | null;
  prompt?: string;
  createdAt?: string;
}

const deriveId = (prefix: string, seed: string | undefined, fallback: string): string => {
  if (seed === undefined) {
    return fallback;
  }
  const suffix = seed.startsWith("turn-")
    ? seed.slice(5)
    : seed.startsWith("run-")
      ? seed.slice(4)
      : seed;
  return suffix ? `${prefix}-${suffix}` : fallback;
};

export const createGenerationInput = (
  overrides?: GenerationInputOverrides
): CreateChatGenerationInput => {
  const turnId = overrides?.turnId ?? "turn-1";
  const runId = overrides?.runId ?? deriveId("run", overrides?.turnId, "run-1");
  const jobId = overrides?.jobId ?? deriveId("job", overrides?.turnId, "job-1");
  const attemptId = overrides?.attemptId ?? deriveId("attempt", overrides?.turnId, "attempt-1");
  const createdAt = overrides?.createdAt ?? "2026-03-12T00:00:00.000Z";
  const prompt = overrides?.prompt ?? "Studio portrait";

  return {
    conversationId: overrides?.conversationId ?? "conversation-1",
    turn: {
      id: turnId,
      prompt,
      createdAt,
      retryOfTurnId: overrides?.retryOfTurnId ?? null,
      modelId: "seedream-v5",
      logicalModel: "image.seedream.v5",
      deploymentId: "ark-seedream-v5-primary",
      runtimeProvider: "ark",
      providerModel: "doubao-seedream-5-0-260128",
      configSnapshot: {
        prompt,
        modelId: "seedream-v5",
        aspectRatio: "1:1",
        style: "none",
        batchSize: 1,
        modelParams: {},
      },
      status: "loading",
      error: null,
      warnings: [],
      jobId,
      runIds: [runId],
      referencedAssetIds: [],
      primaryAssetIds: [],
      results: [],
    },
    job: {
      id: jobId,
      turnId,
      runId,
      modelId: "seedream-v5",
      logicalModel: "image.seedream.v5",
      deploymentId: "ark-seedream-v5-primary",
      runtimeProvider: "ark",
      providerModel: "doubao-seedream-5-0-260128",
      compiledPrompt: prompt,
      requestSnapshot: {
        prompt,
        negativePrompt: undefined,
        modelId: "seedream-v5",
        aspectRatio: "1:1",
        style: "none",
        batchSize: 1,
        modelParams: {},
      },
      status: "running",
      error: null,
      createdAt,
      completedAt: null,
    },
    run: {
      id: runId,
      turnId,
      jobId,
      operation: "image.generate",
      status: "processing",
      requestedTarget: {
        modelId: "seedream-v5",
        logicalModel: "image.seedream.v5",
        deploymentId: "ark-seedream-v5-primary",
        runtimeProvider: "ark",
        providerModel: "doubao-seedream-5-0-260128",
        pinned: false,
      },
      selectedTarget: {
        modelId: "seedream-v5",
        logicalModel: "image.seedream.v5",
        deploymentId: "ark-seedream-v5-primary",
        runtimeProvider: "ark",
        providerModel: "doubao-seedream-5-0-260128",
        pinned: false,
      },
      executedTarget: null,
      prompt: {
        originalPrompt: prompt,
        compiledPrompt: prompt,
        dispatchedPrompt: prompt,
        providerEffectivePrompt: null,
        semanticLosses: [],
        warnings: [],
      },
      error: null,
      warnings: [],
      assetIds: [],
      referencedAssetIds: [],
      createdAt,
      completedAt: null,
      telemetry: {
        traceId: `trace-${runId}`,
        providerRequestId: null,
        providerTaskId: null,
        latencyMs: null,
      },
    },
    attempt: {
      id: attemptId,
      jobId,
      runId,
      attemptNo: 1,
      status: "running",
      error: null,
      providerRequestId: null,
      providerTaskId: null,
      createdAt,
      completedAt: null,
      updatedAt: createdAt,
    },
  };
};
