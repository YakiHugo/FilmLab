import { describe, expect, it } from "vitest";
import { MemoryChatStateRepository } from "./memory";

const createGenerationInput = (overrides?: {
  conversationId?: string;
  turnId?: string;
  jobId?: string;
  runId?: string;
  attemptId?: string;
  retryOfTurnId?: string | null;
}) => ({
  conversationId: overrides?.conversationId ?? "conversation-1",
  turn: {
    id: overrides?.turnId ?? "turn-1",
    prompt: "Studio portrait",
    createdAt: "2026-03-12T00:00:00.000Z",
    retryOfTurnId: overrides?.retryOfTurnId ?? null,
    modelId: "seedream-v5" as const,
    logicalModel: "image.seedream.v5" as const,
    deploymentId: "ark-seedream-v5-primary",
    runtimeProvider: "ark",
    providerModel: "doubao-seedream-5-0-260128",
    configSnapshot: {
      prompt: "Studio portrait",
      modelId: "seedream-v5",
      aspectRatio: "1:1",
      style: "none",
      batchSize: 1,
      modelParams: {},
    },
    status: "loading" as const,
    error: null,
    warnings: [],
    jobId: overrides?.jobId ?? "job-1",
    runIds: [overrides?.runId ?? "run-1"],
    referencedAssetIds: [],
    primaryAssetIds: [],
    results: [],
  },
  job: {
    id: overrides?.jobId ?? "job-1",
    turnId: overrides?.turnId ?? "turn-1",
    runId: overrides?.runId ?? "run-1",
    modelId: "seedream-v5" as const,
    logicalModel: "image.seedream.v5" as const,
    deploymentId: "ark-seedream-v5-primary",
    runtimeProvider: "ark",
    providerModel: "doubao-seedream-5-0-260128",
    compiledPrompt: "Studio portrait",
    requestSnapshot: {
      prompt: "Studio portrait",
      modelId: "seedream-v5" as const,
      aspectRatio: "1:1" as const,
      style: "none" as const,
      batchSize: 1,
      modelParams: {},
    },
    status: "running" as const,
    error: null,
    createdAt: "2026-03-12T00:00:00.000Z",
    completedAt: null,
  },
  run: {
    id: overrides?.runId ?? "run-1",
    turnId: overrides?.turnId ?? "turn-1",
    jobId: overrides?.jobId ?? "job-1",
    operation: "image.generate" as const,
    status: "processing" as const,
    requestedTarget: {
      modelId: "seedream-v5" as const,
      logicalModel: "image.seedream.v5" as const,
      deploymentId: "ark-seedream-v5-primary",
      runtimeProvider: "ark",
      providerModel: "doubao-seedream-5-0-260128",
      pinned: false,
    },
    selectedTarget: {
      modelId: "seedream-v5" as const,
      logicalModel: "image.seedream.v5" as const,
      deploymentId: "ark-seedream-v5-primary",
      runtimeProvider: "ark",
      providerModel: "doubao-seedream-5-0-260128",
      pinned: false,
    },
    executedTarget: null,
    prompt: {
      originalPrompt: "Studio portrait",
      compiledPrompt: "Studio portrait",
      dispatchedPrompt: "Studio portrait",
      providerEffectivePrompt: null,
      semanticLosses: [],
      warnings: [],
    },
    error: null,
    warnings: [],
    assetIds: [],
    referencedAssetIds: [],
    createdAt: "2026-03-12T00:00:00.000Z",
    completedAt: null,
    telemetry: {
      traceId: overrides?.runId ? `trace-${overrides.runId}` : "trace-run-1",
      providerRequestId: null,
      providerTaskId: null,
      latencyMs: null,
    },
  },
  attempt: {
    id: overrides?.attemptId ?? "attempt-1",
    jobId: overrides?.jobId ?? "job-1",
    runId: overrides?.runId ?? "run-1",
    attemptNo: 1,
    status: "running" as const,
    error: null,
    providerRequestId: null,
    providerTaskId: null,
    createdAt: "2026-03-12T00:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-03-12T00:00:00.000Z",
  },
});

describe("MemoryChatStateRepository", () => {
  it("reuses the same active conversation for subsequent generations by the same user", async () => {
    const repository = new MemoryChatStateRepository();

    const first = await repository.getOrCreateActiveConversation("user-1");
    const second = await repository.getOrCreateActiveConversation("user-1");
    const otherUser = await repository.getOrCreateActiveConversation("user-2");

    expect(second.id).toBe(first.id);
    expect(otherUser.id).not.toBe(first.id);
  });

  it("persists successful generations and retry lineage in the conversation snapshot", async () => {
    const repository = new MemoryChatStateRepository();
    const conversation = await repository.getOrCreateActiveConversation("user-1");

    await repository.createGeneration(
      createGenerationInput({
        conversationId: conversation.id,
        turnId: "turn-1",
        jobId: "job-1",
        runId: "run-1",
        attemptId: "attempt-1",
      })
    );
    await repository.completeGenerationSuccess({
      conversationId: conversation.id,
      turnId: "turn-1",
      jobId: "job-1",
      runId: "run-1",
      attemptId: "attempt-1",
      logicalModel: "image.seedream.v5",
      deploymentId: "ark-seedream-v5-primary",
      runtimeProvider: "ark",
      providerModel: "doubao-seedream-5-0-260128",
      providerRequestId: "req-1",
      warnings: ["provider warning"],
      completedAt: "2026-03-12T00:00:05.000Z",
      assets: [
        {
          id: "thread-asset-1",
          turnId: "turn-1",
          runId: "run-1",
          assetType: "image",
          label: "Generated image 1",
          metadata: {},
          locators: [],
          createdAt: "2026-03-12T00:00:05.000Z",
        },
      ],
      assetEdges: [],
      run: {
        status: "completed",
        prompt: {
          originalPrompt: "Studio portrait",
          compiledPrompt: "Studio portrait",
          dispatchedPrompt: "Studio portrait",
          providerEffectivePrompt: "Studio portrait",
          semanticLosses: [],
          warnings: [],
        },
        assetIds: ["thread-asset-1"],
        referencedAssetIds: [],
        telemetry: {
          traceId: "trace-run-1",
          providerRequestId: "req-1",
          providerTaskId: null,
          latencyMs: 5000,
        },
        executedTarget: {
          modelId: "seedream-v5",
          logicalModel: "image.seedream.v5",
          deploymentId: "ark-seedream-v5-primary",
          runtimeProvider: "ark",
          providerModel: "doubao-seedream-5-0-260128",
          pinned: false,
        },
      },
      results: [
        {
          id: "result-1",
          imageUrl: "/api/assets/thread-asset-1/original?token=secret-token",
          imageId: null,
          runtimeProvider: "ark",
          providerModel: "doubao-seedream-5-0-260128",
          mimeType: "image/png",
          revisedPrompt: null,
          index: 0,
          assetId: "thread-asset-1",
          saved: true,
        },
      ],
    });

    await repository.createGeneration(
      createGenerationInput({
        conversationId: conversation.id,
        turnId: "turn-2",
        jobId: "job-2",
        runId: "run-2",
        attemptId: "attempt-2",
        retryOfTurnId: "turn-1",
      })
    );
    await repository.completeGenerationFailure({
      conversationId: conversation.id,
      turnId: "turn-2",
      jobId: "job-2",
      runId: "run-2",
      attemptId: "attempt-2",
      error: "provider blocked",
      completedAt: "2026-03-12T00:01:00.000Z",
    });

    const snapshot = await repository.getConversationSnapshot("user-1", conversation.id);
    const failedRetryTurn = snapshot.turns.find((turn) => turn.id === "turn-2");
    const completedTurn = snapshot.turns.find((turn) => turn.id === "turn-1");

    expect(snapshot.id).toBe(conversation.id);
    expect(snapshot.turns).toHaveLength(2);
    expect(failedRetryTurn).toMatchObject({
      id: "turn-2",
      retryOfTurnId: "turn-1",
      status: "error",
      error: "provider blocked",
    });
    expect(completedTurn).toMatchObject({
      id: "turn-1",
      status: "done",
      warnings: ["provider warning"],
      results: [
        expect.objectContaining({
          id: "result-1",
          imageId: null,
          assetId: "thread-asset-1",
          saved: true,
        }),
      ],
    });
  });

  it("accepts an older turn by restoring its compiler state as the committed base", async () => {
    const repository = new MemoryChatStateRepository();
    const conversation = await repository.getOrCreateActiveConversation("user-1");

    await repository.createGeneration(
      createGenerationInput({
        conversationId: conversation.id,
        turnId: "turn-1",
        jobId: "job-1",
        runId: "run-1",
        attemptId: "attempt-1",
      })
    );
    await repository.completeGenerationSuccess({
      conversationId: conversation.id,
      turnId: "turn-1",
      jobId: "job-1",
      runId: "run-1",
      attemptId: "attempt-1",
      logicalModel: "image.seedream.v5",
      deploymentId: "ark-seedream-v5-primary",
      runtimeProvider: "ark",
      providerModel: "doubao-seedream-5-0-260128",
      warnings: [],
      completedAt: "2026-03-12T00:00:05.000Z",
      assets: [
        {
          id: "thread-asset-1",
          turnId: "turn-1",
          runId: "run-1",
          assetType: "image",
          label: "Generated image 1",
          metadata: {},
          locators: [],
          createdAt: "2026-03-12T00:00:05.000Z",
        },
      ],
      assetEdges: [],
      run: {
        status: "completed",
        prompt: {
          originalPrompt: "Prompt one",
          compiledPrompt: "Prompt one",
          dispatchedPrompt: "Prompt one",
          providerEffectivePrompt: "Prompt one",
          semanticLosses: [],
          warnings: [],
        },
        assetIds: ["thread-asset-1"],
        referencedAssetIds: [],
        telemetry: {
          traceId: "trace-run-1",
          providerRequestId: null,
          providerTaskId: null,
          latencyMs: 5000,
        },
        executedTarget: {
          modelId: "seedream-v5",
          logicalModel: "image.seedream.v5",
          deploymentId: "ark-seedream-v5-primary",
          runtimeProvider: "ark",
          providerModel: "doubao-seedream-5-0-260128",
          pinned: false,
        },
      },
      results: [
        {
          id: "result-1",
          imageUrl: "/api/assets/thread-asset-1/original?token=secret-token",
          imageId: null,
          runtimeProvider: "ark",
          providerModel: "doubao-seedream-5-0-260128",
          mimeType: "image/png",
          revisedPrompt: null,
          index: 0,
          assetId: "thread-asset-1",
          saved: true,
        },
      ],
    });
    await repository.createPromptVersions({
      conversationId: conversation.id,
      versions: [
        {
          id: "prompt-version-1",
          runId: "run-1",
          turnId: "turn-1",
          traceId: "trace-run-1",
          version: 1,
          stage: "dispatch",
          targetKey: "ark:doubao-seedream-5-0-260128",
          attempt: 1,
          compilerVersion: "prompt-compiler.v1.1",
          capabilityVersion: "prompt-capabilities.v1",
          originalPrompt: "Prompt one",
          promptIntent: null,
          turnDelta: null,
          committedStateBefore: null,
          candidateStateAfter: {
            prompt: "Prompt one",
            preserve: ["keep face"],
            avoid: ["extra text"],
            styleDirectives: ["watercolor"],
            continuityTargets: ["subject"],
            editOps: [],
            referenceAssetIds: ["thread-asset-1"],
          },
          promptIR: null,
          compiledPrompt: "Prompt one",
          dispatchedPrompt: "Prompt one",
          providerEffectivePrompt: null,
          semanticLosses: [],
          warnings: [],
          hashes: {
            stateHash: "state-1",
            irHash: "ir-1",
            prefixHash: "prefix-1",
            payloadHash: "payload-1",
          },
          createdAt: "2026-03-12T00:00:05.000Z",
        },
      ],
    });
    await repository.updateConversationPromptState({
      conversationId: conversation.id,
      promptState: {
        committed: {
          prompt: "Later prompt",
          preserve: ["later preserve"],
          avoid: [],
          styleDirectives: [],
          continuityTargets: ["style"],
          editOps: [],
          referenceAssetIds: [],
        },
        candidate: {
          prompt: "Unaccepted candidate",
          preserve: ["candidate preserve"],
          avoid: [],
          styleDirectives: [],
          continuityTargets: ["composition"],
          editOps: [],
          referenceAssetIds: [],
        },
        baseAssetId: "later-asset",
        candidateTurnId: "turn-2",
        revision: 1,
      },
      expectedRevision: 0,
      updatedAt: "2026-03-12T00:01:00.000Z",
    });

    const accepted = await repository.acceptConversationTurn({
      userId: "user-1",
      turnId: "turn-1",
      assetId: "thread-asset-1",
      acceptedAt: "2026-03-12T00:02:00.000Z",
    });

    expect(accepted.thread.promptState).toMatchObject({
      committed: {
        prompt: "Prompt one",
        preserve: ["keep face"],
        avoid: ["extra text"],
        styleDirectives: ["watercolor"],
        continuityTargets: ["subject"],
        editOps: [],
        referenceAssetIds: ["thread-asset-1"],
      },
      candidate: null,
      candidateTurnId: null,
      baseAssetId: "thread-asset-1",
    });
  });

  it("returns ordered prompt artifacts only for visible turns owned by the caller", async () => {
    const repository = new MemoryChatStateRepository();
    const conversation = await repository.getOrCreateActiveConversation("user-1");
    const otherConversation = await repository.getOrCreateActiveConversation("user-2");

    await repository.createGeneration(
      createGenerationInput({
        conversationId: conversation.id,
        turnId: "turn-1",
        runId: "run-1",
      })
    );
    await repository.createPromptVersions({
      conversationId: conversation.id,
      versions: [
        {
          id: "artifact-2",
          runId: "run-1",
          turnId: "turn-1",
          traceId: "trace-run-1",
          version: 2,
          stage: "dispatch",
          targetKey: "dashscope:qwen-image-2.0-pro",
          attempt: 1,
          compilerVersion: "prompt-compiler.v1.2",
          capabilityVersion: "prompt-capabilities.v1.2",
          originalPrompt: "Studio portrait",
          promptIntent: null,
          turnDelta: null,
          committedStateBefore: null,
          candidateStateAfter: null,
          promptIR: null,
          compiledPrompt: "dispatch prompt",
          dispatchedPrompt: "dispatch prompt",
          providerEffectivePrompt: null,
          semanticLosses: [],
          warnings: [],
          hashes: {
            stateHash: "state-2",
            irHash: "ir-2",
            prefixHash: "prefix-2",
            payloadHash: "payload-2",
          },
          createdAt: "2026-03-12T00:00:02.000Z",
        },
        {
          id: "artifact-1",
          runId: "run-1",
          turnId: "turn-1",
          traceId: "trace-run-1",
          version: 1,
          stage: "rewrite",
          targetKey: null,
          attempt: null,
          compilerVersion: "prompt-compiler.v1.2",
          capabilityVersion: "prompt-capabilities.v1.2",
          originalPrompt: "Studio portrait",
          promptIntent: null,
          turnDelta: null,
          committedStateBefore: null,
          candidateStateAfter: null,
          promptIR: null,
          compiledPrompt: null,
          dispatchedPrompt: null,
          providerEffectivePrompt: null,
          semanticLosses: [],
          warnings: [],
          hashes: {
            stateHash: "state-1",
            irHash: "ir-1",
            prefixHash: "prefix-1",
            payloadHash: "payload-1",
          },
          createdAt: "2026-03-12T00:00:01.000Z",
        },
      ],
    });

    await repository.createGeneration(
      createGenerationInput({
        conversationId: otherConversation.id,
        turnId: "turn-2",
        runId: "run-2",
      })
    );
    await repository.createPromptVersions({
      conversationId: otherConversation.id,
      versions: [
        {
          id: "artifact-other",
          runId: "run-2",
          turnId: "turn-2",
          traceId: "trace-run-2",
          version: 1,
          stage: "rewrite",
          targetKey: null,
          attempt: null,
          compilerVersion: "prompt-compiler.v1.2",
          capabilityVersion: "prompt-capabilities.v1.2",
          originalPrompt: "Other prompt",
          promptIntent: null,
          turnDelta: null,
          committedStateBefore: null,
          candidateStateAfter: null,
          promptIR: null,
          compiledPrompt: null,
          dispatchedPrompt: null,
          providerEffectivePrompt: null,
          semanticLosses: [],
          warnings: [],
          hashes: {
            stateHash: "state-other",
            irHash: "ir-other",
            prefixHash: "prefix-other",
            payloadHash: "payload-other",
          },
          createdAt: "2026-03-12T00:00:03.000Z",
        },
      ],
    });

    const artifacts = await repository.getPromptArtifactsForTurn("user-1", "turn-1");
    expect(artifacts).toEqual({
      turnId: "turn-1",
      versions: [
        expect.objectContaining({ id: "artifact-1", version: 1, stage: "rewrite" }),
        expect.objectContaining({ id: "artifact-2", version: 2, stage: "dispatch" }),
      ],
    });

    expect(await repository.getPromptArtifactsForTurn("user-1", "turn-2")).toBeNull();

    await repository.deleteTurn("user-1", "turn-1");
    expect(await repository.getPromptArtifactsForTurn("user-1", "turn-1")).toBeNull();
  });

  it("returns zeroed observability for an empty visible conversation", async () => {
    const repository = new MemoryChatStateRepository();
    const conversation = await repository.getOrCreateActiveConversation("user-1");

    await repository.createGeneration(
      createGenerationInput({
        conversationId: conversation.id,
        turnId: "turn-hidden",
        jobId: "job-hidden",
        runId: "run-hidden",
        attemptId: "attempt-hidden",
      })
    );
    await repository.deleteTurn("user-1", "turn-hidden");

    const summary = await repository.getPromptObservabilityForConversation(
      "user-1",
      conversation.id
    );

    expect(summary).toEqual({
      conversationId: conversation.id,
      overview: {
        totalTurns: 0,
        turnsWithArtifacts: 0,
        degradedTurns: 0,
        fallbackTurns: 0,
      },
      semanticLosses: [],
      targets: [],
      turns: [],
    });
  });

  it("does not create an active conversation when observability is requested without a conversation id", async () => {
    const repository = new MemoryChatStateRepository();

    await expect(repository.getPromptObservabilityForConversation("user-1")).resolves.toBeNull();
    await expect(repository.getPromptObservabilityForConversation("user-1")).resolves.toBeNull();
  });

  it("aggregates artifact-level semantic loss occurrences separately from turn counts", async () => {
    const repository = new MemoryChatStateRepository();
    const conversation = await repository.getOrCreateActiveConversation("user-1");

    await repository.createGeneration(
      createGenerationInput({
        conversationId: conversation.id,
        turnId: "turn-1",
        jobId: "job-1",
        runId: "run-1",
        attemptId: "attempt-1",
      })
    );
    await repository.createPromptVersions({
      conversationId: conversation.id,
      versions: [
        {
          id: "artifact-compile",
          runId: "run-1",
          turnId: "turn-1",
          traceId: "trace-run-1",
          version: 1,
          stage: "compile",
          targetKey: "dashscope:qwen-image-2.0-pro",
          attempt: null,
          compilerVersion: "prompt-compiler.v1.3",
          capabilityVersion: "prompt-compiler-facts.v1",
          originalPrompt: "Studio portrait",
          promptIntent: null,
          turnDelta: null,
          committedStateBefore: null,
          candidateStateAfter: null,
          promptIR: null,
          compiledPrompt: null,
          dispatchedPrompt: null,
          providerEffectivePrompt: null,
          semanticLosses: [
            {
              code: "NEGATIVE_PROMPT_DEGRADED_TO_TEXT",
              severity: "warn",
              fieldPath: "promptIR.negativeConstraints",
              degradeMode: "merged",
              userMessage: "Negative constraints were merged.",
            },
          ],
          warnings: [],
          hashes: {
            stateHash: "state-1",
            irHash: "ir-1",
            prefixHash: "prefix-1",
            payloadHash: "payload-1",
          },
          createdAt: "2026-03-12T00:00:01.000Z",
        },
        {
          id: "artifact-dispatch",
          runId: "run-1",
          turnId: "turn-1",
          traceId: "trace-run-1",
          version: 2,
          stage: "dispatch",
          targetKey: "dashscope:qwen-image-2.0-pro",
          attempt: 1,
          compilerVersion: "prompt-compiler.v1.3",
          capabilityVersion: "prompt-compiler-facts.v1",
          originalPrompt: "Studio portrait",
          promptIntent: null,
          turnDelta: null,
          committedStateBefore: null,
          candidateStateAfter: null,
          promptIR: null,
          compiledPrompt: null,
          dispatchedPrompt: null,
          providerEffectivePrompt: null,
          semanticLosses: [
            {
              code: "NEGATIVE_PROMPT_DEGRADED_TO_TEXT",
              severity: "warn",
              fieldPath: "promptIR.negativeConstraints",
              degradeMode: "merged",
              userMessage: "Negative constraints were merged.",
            },
          ],
          warnings: [],
          hashes: {
            stateHash: "state-2",
            irHash: "ir-2",
            prefixHash: "prefix-2",
            payloadHash: "payload-2",
          },
          createdAt: "2026-03-12T00:00:02.000Z",
        },
      ],
    });

    const summary = await repository.getPromptObservabilityForConversation(
      "user-1",
      conversation.id
    );

    expect(summary?.overview).toEqual({
      totalTurns: 1,
      turnsWithArtifacts: 1,
      degradedTurns: 1,
      fallbackTurns: 0,
    });
    expect(summary?.semanticLosses).toEqual([
      {
        code: "NEGATIVE_PROMPT_DEGRADED_TO_TEXT",
        occurrenceCount: 2,
        turnCount: 1,
        latestCreatedAt: "2026-03-12T00:00:02.000Z",
      },
    ]);
    expect(summary?.targets).toEqual([
      {
        targetKey: "dashscope:qwen-image-2.0-pro",
        compileArtifactCount: 1,
        dispatchArtifactCount: 1,
        degradedDispatchCount: 1,
        latestCreatedAt: "2026-03-12T00:00:02.000Z",
      },
    ]);
    expect(summary?.turns).toEqual([
      {
        turnId: "turn-1",
        prompt: "Studio portrait",
        createdAt: "2026-03-12T00:00:00.000Z",
        artifactCount: 2,
        semanticLossCodes: ["NEGATIVE_PROMPT_DEGRADED_TO_TEXT"],
        degraded: true,
        fallback: false,
        selectedTargetKey: "ark:doubao-seedream-5-0-260128",
        executedTargetKey: null,
      },
    ]);
  });

  it("clears the active conversation and creates a fresh one", async () => {
    const repository = new MemoryChatStateRepository();
    const current = await repository.getOrCreateActiveConversation("user-1");

    await repository.createGeneration(
      createGenerationInput({
        conversationId: current.id,
        runId: "run-1",
      })
    );

    const cleared = await repository.clearActiveConversation("user-1");
    const archived = await repository.getConversationSnapshot("user-1", current.id);

    expect(cleared.id).not.toBe(current.id);
    expect(cleared.turns).toEqual([]);
    expect(cleared.jobs).toEqual([]);
    expect(archived.id).toBe(current.id);
    expect(archived.turns).toHaveLength(1);
  });

  it("hides deleted turns without breaking completion of an in-flight generation", async () => {
    const repository = new MemoryChatStateRepository();
    const conversation = await repository.getOrCreateActiveConversation("user-1");

    await repository.createGeneration(
      createGenerationInput({
        conversationId: conversation.id,
        runId: "run-1",
      })
    );

    const deletedSnapshot = await repository.deleteTurn("user-1", "turn-1");
    expect(deletedSnapshot?.turns).toEqual([]);

    await repository.completeGenerationFailure({
      conversationId: conversation.id,
      turnId: "turn-1",
      jobId: "job-1",
      runId: "run-1",
      attemptId: "attempt-1",
      error: "provider blocked",
      completedAt: "2026-03-12T00:00:30.000Z",
    });

    const refreshed = await repository.getConversationSnapshot("user-1", conversation.id);

    expect(refreshed.turns).toEqual([]);
    expect(refreshed.jobs).toEqual([]);
  });
});
