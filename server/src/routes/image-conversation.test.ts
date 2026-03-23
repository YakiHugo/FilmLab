import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repositoryMock = {
  close: vi.fn(),
  getConversationById: vi.fn(),
  getOrCreateActiveConversation: vi.fn(),
  getConversationSnapshot: vi.fn(),
  getPromptArtifactsForTurn: vi.fn(),
  getPromptObservabilityForConversation: vi.fn(),
  clearActiveConversation: vi.fn(),
  deleteTurn: vi.fn(),
  getGeneratedImageByCapability: vi.fn(),
  createTurn: vi.fn(),
  createGeneration: vi.fn(),
  createRun: vi.fn(),
  createPromptVersions: vi.fn(),
  updateConversationPromptState: vi.fn(),
  acceptConversationTurn: vi.fn(),
  completeGenerationSuccess: vi.fn(),
  completeGenerationFailure: vi.fn(),
  turnExists: vi.fn(),
};

const encodeBase64Url = (value: string) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const createBearerToken = (userId: string, secret = "test-secret") => {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + 60,
    })
  );
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `Bearer ${header}.${payload}.${signature}`;
};

const createApp = async () => {
  const { default: Fastify } = await import("fastify");
  const { imageConversationRoute } = await import("./image-conversation");

  const app = Fastify();
  app.decorate("chatStateRepository", repositoryMock);
  await app.register(imageConversationRoute);
  return app;
};

describe("imageConversationRoute", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_JWT_SECRET", "test-secret");
    Object.values(repositoryMock).forEach((mockFn) => {
      if ("mockReset" in mockFn) {
        mockFn.mockReset();
      }
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("requires auth to read the active conversation", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/image-conversation",
    });

    expect(response.statusCode).toBe(401);
    expect(repositoryMock.getConversationSnapshot).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns the caller's active conversation snapshot", async () => {
    repositoryMock.getConversationSnapshot.mockResolvedValue({
      id: "conversation-1",
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      turns: [],
      jobs: [],
    });

    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/image-conversation",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(repositoryMock.getConversationSnapshot).toHaveBeenCalledWith("user-1", undefined);
    expect(response.json()).toMatchObject({
      id: "conversation-1",
      turns: [],
      jobs: [],
    });

    await app.close();
  });

  it("requires auth to read prompt artifacts", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/image-conversation/turns/turn-1/prompt-artifacts",
    });

    expect(response.statusCode).toBe(401);
    expect(repositoryMock.getPromptArtifactsForTurn).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns ordered prompt artifacts for an owned turn", async () => {
    repositoryMock.getPromptArtifactsForTurn.mockResolvedValue({
      turnId: "turn-1",
      versions: [
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
          createdAt: "2026-03-15T00:00:00.000Z",
        },
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
          compiledPrompt: "compiled prompt",
          dispatchedPrompt: "dispatch prompt",
          providerEffectivePrompt: "provider prompt",
          semanticLosses: [],
          warnings: [],
          hashes: {
            stateHash: "state-2",
            irHash: "ir-2",
            prefixHash: "prefix-2",
            payloadHash: "payload-2",
          },
          createdAt: "2026-03-15T00:00:01.000Z",
        },
      ],
    });

    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/image-conversation/turns/turn-1/prompt-artifacts",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(repositoryMock.getPromptArtifactsForTurn).toHaveBeenCalledWith("user-1", "turn-1");
    expect(response.json()).toMatchObject({
      turnId: "turn-1",
      versions: [
        { id: "artifact-1", stage: "rewrite", version: 1 },
        { id: "artifact-2", stage: "dispatch", version: 2 },
      ],
    });

    await app.close();
  });

  it("returns an empty artifact list for an owned turn without stored compiler records", async () => {
    repositoryMock.getPromptArtifactsForTurn.mockResolvedValue({
      turnId: "turn-1",
      versions: [],
    });

    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/image-conversation/turns/turn-1/prompt-artifacts",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      turnId: "turn-1",
      versions: [],
    });

    await app.close();
  });

  it("returns 404 when prompt artifacts are requested for a missing turn", async () => {
    repositoryMock.getPromptArtifactsForTurn.mockResolvedValue(null);

    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/image-conversation/turns/missing-turn/prompt-artifacts",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Turn not found.",
    });

    await app.close();
  });

  it("requires auth to read prompt observability", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/image-conversation/observability",
    });

    expect(response.statusCode).toBe(401);
    expect(repositoryMock.getPromptObservabilityForConversation).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns conversation-scoped prompt observability", async () => {
    repositoryMock.getPromptObservabilityForConversation.mockResolvedValue({
      conversationId: "conversation-1",
      overview: {
        totalTurns: 2,
        turnsWithArtifacts: 2,
        degradedTurns: 1,
        fallbackTurns: 1,
      },
      semanticLosses: [
        {
          code: "NEGATIVE_PROMPT_DEGRADED_TO_TEXT",
          occurrenceCount: 2,
          turnCount: 1,
          latestCreatedAt: "2026-03-15T00:00:03.000Z",
        },
      ],
      targets: [
        {
          targetKey: "dashscope:qwen-image-2.0-pro",
          compileArtifactCount: 1,
          dispatchArtifactCount: 2,
          degradedDispatchCount: 1,
          latestCreatedAt: "2026-03-15T00:00:04.000Z",
        },
      ],
      turns: [
        {
          turnId: "turn-1",
          prompt: "Studio portrait",
          createdAt: "2026-03-15T00:00:00.000Z",
          artifactCount: 2,
          semanticLossCodes: ["NEGATIVE_PROMPT_DEGRADED_TO_TEXT"],
          degraded: true,
          fallback: true,
          selectedTargetKey: "dashscope:qwen-image-2.0-pro",
          executedTargetKey: "dashscope:qwen-image-2.0-pro-fallback",
        },
      ],
    });

    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/image-conversation/observability?conversationId=conversation-1",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(repositoryMock.getPromptObservabilityForConversation).toHaveBeenCalledWith(
      "user-1",
      "conversation-1"
    );
    expect(response.json()).toMatchObject({
      conversationId: "conversation-1",
      overview: {
        degradedTurns: 1,
        fallbackTurns: 1,
      },
    });

    await app.close();
  });

  it("returns 404 when prompt observability is requested for a missing conversation", async () => {
    repositoryMock.getPromptObservabilityForConversation.mockResolvedValue(null);

    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/image-conversation/observability?conversationId=conversation-missing",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Conversation not found.",
    });

    await app.close();
  });

  it("returns 404 when prompt observability is requested without an active conversation", async () => {
    repositoryMock.getPromptObservabilityForConversation.mockResolvedValue(null);

    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/image-conversation/observability",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
    });

    expect(response.statusCode).toBe(404);
    expect(repositoryMock.getPromptObservabilityForConversation).toHaveBeenCalledWith(
      "user-1",
      undefined
    );
    expect(response.json()).toEqual({
      error: "Conversation not found.",
    });

    await app.close();
  });

  it("clears and recreates the active conversation", async () => {
    repositoryMock.clearActiveConversation.mockResolvedValue({
      id: "conversation-2",
      createdAt: "2026-03-12T01:00:00.000Z",
      updatedAt: "2026-03-12T01:00:00.000Z",
      turns: [],
      jobs: [],
    });

    const app = await createApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/api/image-conversation",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(repositoryMock.clearActiveConversation).toHaveBeenCalledWith("user-1");

    await app.close();
  });

  it("returns 404 when the requested conversation does not exist", async () => {
    const { ChatConversationNotFoundError } = await import("../chat/persistence/types");
    repositoryMock.getConversationSnapshot.mockRejectedValue(
      new ChatConversationNotFoundError("conversation-missing")
    );

    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/image-conversation?conversationId=conversation-missing",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Conversation not found.",
    });

    await app.close();
  });

  it("deletes only turns owned by the current user", async () => {
    repositoryMock.deleteTurn.mockResolvedValueOnce(null);
    repositoryMock.deleteTurn.mockResolvedValueOnce({
      id: "conversation-1",
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:05:00.000Z",
      turns: [],
      jobs: [],
    });

    const app = await createApp();

    const notFound = await app.inject({
      method: "DELETE",
      url: "/api/image-conversation/turns/turn-1",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
    });
    expect(notFound.statusCode).toBe(404);

    const deleted = await app.inject({
      method: "DELETE",
      url: "/api/image-conversation/turns/turn-2",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
    });
    expect(deleted.statusCode).toBe(200);
    expect(repositoryMock.deleteTurn).toHaveBeenNthCalledWith(1, "user-1", "turn-1");
    expect(repositoryMock.deleteTurn).toHaveBeenNthCalledWith(2, "user-1", "turn-2");

    await app.close();
  });

  it("accepts a generated result as the conversation base asset", async () => {
    repositoryMock.acceptConversationTurn.mockResolvedValue({
      id: "conversation-1",
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:05:00.000Z",
      thread: {
        id: "conversation-1",
        creativeBrief: {
          latestPrompt: "Studio portrait",
          latestModelId: "seedream-v5",
          acceptedAssetId: "thread-asset-1",
          selectedAssetIds: ["thread-asset-1"],
          recentAssetRefIds: [],
        },
        promptState: {
          committed: {
            prompt: "Studio portrait",
            preserve: [],
            avoid: [],
            styleDirectives: [],
            continuityTargets: [],
            editOps: [],
            referenceAssetIds: [],
          },
          candidate: null,
          baseAssetId: "thread-asset-1",
          candidateTurnId: null,
          revision: 2,
        },
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:05:00.000Z",
      },
      turns: [],
      runs: [],
      assets: [],
      assetEdges: [],
      jobs: [],
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/image-conversation/turns/turn-1/accept",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        assetId: "thread-asset-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(repositoryMock.acceptConversationTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        turnId: "turn-1",
        assetId: "thread-asset-1",
      })
    );

    await app.close();
  });
});
