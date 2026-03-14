import { describe, expect, it } from "vitest";
import { MemoryChatStateRepository } from "./memory";
import { hashGeneratedImageToken } from "../../shared/generatedImageCapability";

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
      providerTransformedPrompt: null,
      actualPrompt: null,
    },
    error: null,
    warnings: [],
    assetIds: [],
    referencedAssetIds: [],
    createdAt: "2026-03-12T00:00:00.000Z",
    completedAt: null,
    telemetry: {
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
      generatedImages: [
        {
          id: "result-1",
          ownerUserId: "user-1",
          conversationId: conversation.id,
          turnId: "turn-1",
          mimeType: "image/png",
          sizeBytes: 3,
          blobData: Buffer.from([1, 2, 3]),
          visibility: "private",
          privateTokenHash: hashGeneratedImageToken("secret-token"),
          createdAt: "2026-03-12T00:00:05.000Z",
        },
      ],
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
          providerTransformedPrompt: null,
          actualPrompt: "Studio portrait",
        },
        assetIds: ["thread-asset-1"],
        referencedAssetIds: [],
        telemetry: {
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
          imageUrl: "/api/generated-images/result-1?token=secret-token",
          imageId: "result-1",
          threadAssetId: "thread-asset-1",
          runtimeProvider: "ark",
          providerModel: "doubao-seedream-5-0-260128",
          mimeType: "image/png",
          revisedPrompt: null,
          index: 0,
          assetId: null,
          saved: false,
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
          imageId: "result-1",
        }),
      ],
    });
  });

  it("revokes generated image capabilities when a turn is deleted", async () => {
    const repository = new MemoryChatStateRepository();
    const conversation = await repository.getOrCreateActiveConversation("user-1");

    await repository.createGeneration(
      createGenerationInput({
        conversationId: conversation.id,
        runId: "run-1",
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
      generatedImages: [
        {
          id: "result-1",
          ownerUserId: "user-1",
          conversationId: conversation.id,
          turnId: "turn-1",
          mimeType: "image/png",
          sizeBytes: 3,
          blobData: Buffer.from([1, 2, 3]),
          visibility: "private",
          privateTokenHash: hashGeneratedImageToken("secret-token"),
          createdAt: "2026-03-12T00:00:05.000Z",
        },
      ],
      assets: [],
      assetEdges: [],
      run: {
        status: "completed",
        prompt: {
          originalPrompt: "Studio portrait",
          compiledPrompt: "Studio portrait",
          providerTransformedPrompt: null,
          actualPrompt: "Studio portrait",
        },
        assetIds: [],
        referencedAssetIds: [],
        telemetry: {
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
          imageUrl: "/api/generated-images/result-1?token=secret-token",
          imageId: "result-1",
          threadAssetId: null,
          runtimeProvider: "ark",
          providerModel: "doubao-seedream-5-0-260128",
          mimeType: "image/png",
          revisedPrompt: null,
          index: 0,
          assetId: null,
          saved: false,
        },
      ],
    });

    expect(await repository.getGeneratedImageByCapability("result-1", "wrong-token")).toBeNull();
    expect(await repository.getGeneratedImageByCapability("result-1", "secret-token")).toEqual({
      buffer: Buffer.from([1, 2, 3]),
      mimeType: "image/png",
    });

    await repository.deleteTurn("user-1", "turn-1");

    expect(await repository.getGeneratedImageByCapability("result-1", "secret-token")).toBeNull();
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
