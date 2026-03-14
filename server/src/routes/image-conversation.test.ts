import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repositoryMock = {
  getConversationById: vi.fn(),
  getOrCreateActiveConversation: vi.fn(),
  getConversationSnapshot: vi.fn(),
  clearActiveConversation: vi.fn(),
  deleteTurn: vi.fn(),
  createGeneration: vi.fn(),
  completeGenerationSuccess: vi.fn(),
  completeGenerationFailure: vi.fn(),
  turnExists: vi.fn(),
};

vi.mock("../chat/persistence/repository", () => ({
  getChatStateRepository: () => repositoryMock,
}));

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

describe("imageConversationRoute", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_JWT_SECRET", "test-secret");
    vi.unstubAllGlobals();
    repositoryMock.getConversationById.mockReset();
    repositoryMock.getOrCreateActiveConversation.mockReset();
    repositoryMock.getConversationSnapshot.mockReset();
    repositoryMock.clearActiveConversation.mockReset();
    repositoryMock.deleteTurn.mockReset();
    repositoryMock.createGeneration.mockReset();
    repositoryMock.completeGenerationSuccess.mockReset();
    repositoryMock.completeGenerationFailure.mockReset();
    repositoryMock.turnExists.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("requires auth to read the active conversation", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageConversationRoute } = await import("./image-conversation");

    const app = Fastify();
    await app.register(imageConversationRoute);

    const response = await app.inject({
      method: "GET",
      url: "/api/image-conversation",
    });

    expect(response.statusCode).toBe(401);
    expect(repositoryMock.getConversationSnapshot).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns the caller's active conversation snapshot", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageConversationRoute } = await import("./image-conversation");

    repositoryMock.getConversationSnapshot.mockResolvedValue({
      id: "conversation-1",
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      turns: [],
      jobs: [],
    });

    const app = Fastify();
    await app.register(imageConversationRoute);

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

  it("clears and recreates the active conversation", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageConversationRoute } = await import("./image-conversation");

    repositoryMock.clearActiveConversation.mockResolvedValue({
      id: "conversation-2",
      createdAt: "2026-03-12T01:00:00.000Z",
      updatedAt: "2026-03-12T01:00:00.000Z",
      turns: [],
      jobs: [],
    });

    const app = Fastify();
    await app.register(imageConversationRoute);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/image-conversation",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(repositoryMock.clearActiveConversation).toHaveBeenCalledWith("user-1");
    expect(response.json()).toMatchObject({
      id: "conversation-2",
      turns: [],
      jobs: [],
    });

    await app.close();
  });

  it("returns 404 when the requested conversation does not exist", async () => {
    const { default: Fastify } = await import("fastify");
    const { ChatConversationNotFoundError } = await import("../chat/persistence/types");
    const { imageConversationRoute } = await import("./image-conversation");

    repositoryMock.getConversationSnapshot.mockRejectedValue(
      new ChatConversationNotFoundError("conversation-missing")
    );

    const app = Fastify();
    await app.register(imageConversationRoute);

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

  it("returns 500 when loading the conversation fails for a non-not-found reason", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageConversationRoute } = await import("./image-conversation");

    repositoryMock.getConversationSnapshot.mockRejectedValue(new Error("db offline"));

    const app = Fastify();
    await app.register(imageConversationRoute);

    const response = await app.inject({
      method: "GET",
      url: "/api/image-conversation",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "Conversation could not be loaded.",
    });

    await app.close();
  });

  it("deletes only turns owned by the current user", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageConversationRoute } = await import("./image-conversation");

    repositoryMock.deleteTurn.mockResolvedValueOnce(null);
    repositoryMock.deleteTurn.mockResolvedValueOnce({
      id: "conversation-1",
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:05:00.000Z",
      turns: [],
      jobs: [],
    });

    const app = Fastify();
    await app.register(imageConversationRoute);

    const notFound = await app.inject({
      method: "DELETE",
      url: "/api/image-conversation/turns/turn-1",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
    });
    expect(notFound.statusCode).toBe(404);
    expect(repositoryMock.deleteTurn).toHaveBeenNthCalledWith(1, "user-1", "turn-1");

    const deleted = await app.inject({
      method: "DELETE",
      url: "/api/image-conversation/turns/turn-2",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
    });
    expect(deleted.statusCode).toBe(200);
    expect(repositoryMock.deleteTurn).toHaveBeenNthCalledWith(2, "user-1", "turn-2");

    await app.close();
  });
});
