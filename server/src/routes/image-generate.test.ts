import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateMock = vi.fn();
const getRouteTargetsMock = vi.fn();
const downloadGeneratedImageMock = vi.fn();
const repositoryMock = {
  close: vi.fn(),
  getConversationById: vi.fn(),
  getOrCreateActiveConversation: vi.fn(),
  getConversationSnapshot: vi.fn(),
  clearActiveConversation: vi.fn(),
  deleteTurn: vi.fn(),
  getGeneratedImageByCapability: vi.fn(),
  createGeneration: vi.fn(),
  completeGenerationSuccess: vi.fn(),
  completeGenerationFailure: vi.fn(),
  turnExists: vi.fn(),
};

vi.mock("../gateway/router/router", () => ({
  imageRuntimeRouter: {
    getRouteTargets: (...args: unknown[]) => getRouteTargetsMock(...args),
    generate: (...args: unknown[]) => generateMock(...args),
  },
}));

vi.mock("../shared/downloadGeneratedImage", () => ({
  downloadGeneratedImage: (...args: unknown[]) => downloadGeneratedImageMock(...args),
}));

const resolveRouteSelectionFixture = (modelId: string) => {
  if (modelId === "qwen-image-2-pro") {
    return [
      {
        frontendModel: {
          id: "qwen-image-2-pro",
          logicalModel: "image.qwen.v2.pro",
        },
        deployment: {
          id: "dashscope-qwen-image-2-pro-primary",
          providerModel: "qwen-image-2.0-pro",
        },
        provider: {
          id: "dashscope",
        },
      },
    ];
  }

  return [
    {
      frontendModel: {
        id: "seedream-v5",
        logicalModel: "image.seedream.v5",
      },
      deployment: {
        id: "ark-seedream-v5-primary",
        providerModel: "doubao-seedream-5-0-260128",
      },
      provider: {
        id: "ark",
      },
    },
  ];
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
  const { imageGenerateRoute } = await import("./image-generate");

  const app = Fastify();
  app.decorate("chatStateRepository", repositoryMock);
  await app.register(imageGenerateRoute);
  return app;
};

describe("imageGenerateRoute", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_JWT_SECRET", "test-secret");
    generateMock.mockReset();
    getRouteTargetsMock.mockReset();
    downloadGeneratedImageMock.mockReset();
    Object.values(repositoryMock).forEach((mockFn) => {
      if ("mockReset" in mockFn) {
        mockFn.mockReset();
      }
    });

    getRouteTargetsMock.mockImplementation((request: { modelId: string }) =>
      resolveRouteSelectionFixture(request.modelId)
    );
    repositoryMock.getOrCreateActiveConversation.mockResolvedValue({
      id: "conversation-1",
      userId: "user-1",
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated generation requests", async () => {
    const app = await createApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      payload: {
        prompt: "Studio portrait",
        modelId: "qwen-image-2-pro",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(401);
    expect(generateMock).not.toHaveBeenCalled();
    expect(repositoryMock.createGeneration).not.toHaveBeenCalled();

    await app.close();
  });

  it("persists generated binaries and returns capability urls", async () => {
    generateMock.mockResolvedValue({
      modelId: "qwen-image-2-pro",
      logicalModel: "image.qwen.v2.pro",
      deploymentId: "dashscope-qwen-image-2-pro-primary",
      runtimeProvider: "dashscope",
      providerModel: "qwen-image-2.0-pro",
      warnings: ["2 of 4 images completed."],
      images: [
        {
          imageUrl: "https://cdn.example.com/remote.png",
          revisedPrompt: "remote prompt",
        },
        {
          binaryData: Buffer.from([1, 2, 3]),
          mimeType: "image/png",
        },
      ],
    });
    downloadGeneratedImageMock.mockResolvedValue({
      buffer: Buffer.from([9, 8, 7]),
      mimeType: "image/png",
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "Studio portrait",
        modelId: "qwen-image-2-pro",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(200);
    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "qwen-image-2-pro",
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
    expect(repositoryMock.completeGenerationSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        generatedImages: [
          expect.objectContaining({
            ownerUserId: "user-1",
            visibility: "private",
            mimeType: "image/png",
            blobData: Buffer.from([9, 8, 7]),
          }),
          expect.objectContaining({
            ownerUserId: "user-1",
            visibility: "private",
            mimeType: "image/png",
            blobData: Buffer.from([1, 2, 3]),
          }),
        ],
        results: [
          expect.objectContaining({
            imageId: expect.any(String),
            imageUrl: expect.stringMatching(/^\/api\/generated-images\/[^?]+\?token=/),
          }),
          expect.objectContaining({
            imageId: expect.any(String),
            imageUrl: expect.stringMatching(/^\/api\/generated-images\/[^?]+\?token=/),
          }),
        ],
      })
    );

    const body = response.json();
    expect(body.imageId).toEqual(expect.any(String));
    expect(body.imageUrl).toMatch(/^\/api\/generated-images\/[^?]+\?token=/);
    expect(body.images).toHaveLength(2);
    expect(body.images[0]).toMatchObject({
      provider: "dashscope",
      model: "qwen-image-2.0-pro",
    });
    expect(body.images[0].imageUrl).toMatch(/^\/api\/generated-images\/[^?]+\?token=/);

    await app.close();
  });

  it("fails the generation when binary output exceeds the persistence limit", async () => {
    vi.stubEnv("GENERATED_IMAGE_DOWNLOAD_MAX_MB", "1");
    generateMock.mockResolvedValue({
      modelId: "seedream-v5",
      logicalModel: "image.seedream.v5",
      deploymentId: "ark-seedream-v5-primary",
      runtimeProvider: "ark",
      providerModel: "doubao-seedream-5-0-260128",
      images: [
        {
          binaryData: Buffer.alloc(1_200_000, 1),
          mimeType: "image/png",
        },
      ],
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "Too large",
        modelId: "seedream-v5",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(413);
    expect(repositoryMock.completeGenerationFailure).toHaveBeenCalled();

    await app.close();
  });

  it("returns provider errors together with persisted identifiers", async () => {
    const { ProviderError } = await import("../providers/base/errors");
    generateMock.mockRejectedValue(new ProviderError("Provider rejected request.", 429));

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "Studio portrait",
        modelId: "qwen-image-2-pro",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      error: "Provider rejected request.",
      conversationId: "conversation-1",
      threadId: "conversation-1",
      turnId: expect.any(String),
      jobId: expect.any(String),
      runId: expect.any(String),
    });
    expect(repositoryMock.completeGenerationFailure).toHaveBeenCalled();

    await app.close();
  });
});
