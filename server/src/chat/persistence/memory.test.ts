import { describe, expect, it } from "vitest";
import { MemoryChatStateRepository } from "./memory";

const createGenerationInput = (overrides?: {
  conversationId?: string;
  turnId?: string;
  jobId?: string;
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
    results: [],
  },
  job: {
    id: overrides?.jobId ?? "job-1",
    turnId: overrides?.turnId ?? "turn-1",
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
  attempt: {
    id: overrides?.attemptId ?? "attempt-1",
    jobId: overrides?.jobId ?? "job-1",
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
        attemptId: "attempt-1",
      })
    );
    await repository.completeGenerationSuccess({
      conversationId: conversation.id,
      turnId: "turn-1",
      jobId: "job-1",
      attemptId: "attempt-1",
      logicalModel: "image.seedream.v5",
      deploymentId: "ark-seedream-v5-primary",
      runtimeProvider: "ark",
      providerModel: "doubao-seedream-5-0-260128",
      providerRequestId: "req-1",
      warnings: ["provider warning"],
      completedAt: "2026-03-12T00:00:05.000Z",
      results: [
        {
          id: "result-1",
          imageUrl: "/api/generated-images/result-1",
          imageId: "result-1",
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
        attemptId: "attempt-2",
        retryOfTurnId: "turn-1",
      })
    );
    await repository.completeGenerationFailure({
      conversationId: conversation.id,
      turnId: "turn-2",
      jobId: "job-2",
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

  it("clears the active conversation and creates a fresh one", async () => {
    const repository = new MemoryChatStateRepository();
    const current = await repository.getOrCreateActiveConversation("user-1");

    await repository.createGeneration(
      createGenerationInput({
        conversationId: current.id,
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
      })
    );

    const deletedSnapshot = await repository.deleteTurn("user-1", "turn-1");
    expect(deletedSnapshot?.turns).toEqual([]);

    await repository.completeGenerationFailure({
      conversationId: conversation.id,
      turnId: "turn-1",
      jobId: "job-1",
      attemptId: "attempt-1",
      error: "provider blocked",
      completedAt: "2026-03-12T00:00:30.000Z",
    });

    const refreshed = await repository.getConversationSnapshot("user-1", conversation.id);

    expect(refreshed.turns).toEqual([]);
    expect(refreshed.jobs).toEqual([]);
  });
});
