import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repositoryMock = {
  close: vi.fn(),
  getConversationById: vi.fn(),
  getOrCreateActiveConversation: vi.fn(),
  getConversationSnapshot: vi.fn(),
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

const createApp = async () => {
  const { default: Fastify } = await import("fastify");
  const { generatedImageRoute } = await import("./generated-image");

  const app = Fastify();
  app.decorate("chatStateRepository", repositoryMock);
  await app.register(generatedImageRoute);
  return app;
};

describe("generatedImageRoute", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(repositoryMock).forEach((mockFn) => {
      if ("mockReset" in mockFn) {
        mockFn.mockReset();
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a capability token", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/generated-images/image-1",
    });

    expect(response.statusCode).toBe(404);
    expect(repositoryMock.getGeneratedImageByCapability).not.toHaveBeenCalled();

    await app.close();
  });

  it("serves an image when the capability token is valid", async () => {
    repositoryMock.getGeneratedImageByCapability.mockResolvedValue({
      buffer: Buffer.from([1, 2, 3]),
      mimeType: "image/png",
    });

    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/generated-images/image-1?token=secret-token",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(repositoryMock.getGeneratedImageByCapability).toHaveBeenCalledWith(
      "image-1",
      "secret-token"
    );

    await app.close();
  });

  it("returns 404 when the capability token is invalid or revoked", async () => {
    repositoryMock.getGeneratedImageByCapability.mockResolvedValue(null);

    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/generated-images/image-1?token=wrong",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "Generated image not found.",
    });

    await app.close();
  });
});
