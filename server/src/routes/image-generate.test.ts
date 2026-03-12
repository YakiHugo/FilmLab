import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateMock = vi.fn();
const getRouteTargetsMock = vi.fn();
const downloadGeneratedImageMock = vi.fn();
const storeGeneratedImageMock = vi.fn();
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

vi.mock("../gateway/router/router", () => ({
  imageRuntimeRouter: {
    getRouteTargets: (...args: unknown[]) => getRouteTargetsMock(...args),
    generate: (...args: unknown[]) => generateMock(...args),
  },
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

vi.mock("../shared/downloadGeneratedImage", () => ({
  downloadGeneratedImage: (...args: unknown[]) => downloadGeneratedImageMock(...args),
}));

vi.mock("../shared/generatedImageStore", () => ({
  storeGeneratedImage: (...args: unknown[]) => storeGeneratedImageMock(...args),
}));

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

describe("imageGenerateRoute", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_JWT_SECRET", "test-secret");
    vi.restoreAllMocks();
    generateMock.mockReset();
    getRouteTargetsMock.mockReset();
    downloadGeneratedImageMock.mockReset();
    storeGeneratedImageMock.mockReset();
    repositoryMock.getConversationById.mockReset();
    repositoryMock.getOrCreateActiveConversation.mockReset();
    repositoryMock.getConversationSnapshot.mockReset();
    repositoryMock.clearActiveConversation.mockReset();
    repositoryMock.deleteTurn.mockReset();
    repositoryMock.createGeneration.mockReset();
    repositoryMock.completeGenerationSuccess.mockReset();
    repositoryMock.completeGenerationFailure.mockReset();
    repositoryMock.turnExists.mockReset();
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
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");

    const app = Fastify();
    await app.register(imageGenerateRoute);

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

  it("normalizes provider outputs, persists chat state, and returns canonical ids", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");

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
    storeGeneratedImageMock.mockImplementation((buffer: Buffer) =>
      buffer[0] === 9 ? "remote-1" : "binary-1"
    );

    const app = Fastify();
    await app.register(imageGenerateRoute);

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
    expect(repositoryMock.createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        turn: expect.objectContaining({
          id: expect.any(String),
          prompt: "Studio portrait",
          retryOfTurnId: null,
        }),
        job: expect.objectContaining({
          id: expect.any(String),
        }),
      })
    );
    expect(repositoryMock.completeGenerationSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        results: [
          expect.objectContaining({
            id: expect.any(String),
            imageId: "remote-1",
          }),
          expect.objectContaining({
            id: expect.any(String),
            imageId: "binary-1",
          }),
        ],
      })
    );

    const body = response.json();
    expect(body).toMatchObject({
      conversationId: "conversation-1",
      modelId: "qwen-image-2-pro",
      logicalModel: "image.qwen.v2.pro",
      deploymentId: "dashscope-qwen-image-2-pro-primary",
      runtimeProvider: "dashscope",
      providerModel: "qwen-image-2.0-pro",
      imageId: "remote-1",
      imageUrl: "/api/generated-images/remote-1",
      warnings: ["2 of 4 images completed."],
    });
    expect(body.turnId).toEqual(expect.any(String));
    expect(body.jobId).toEqual(expect.any(String));
    expect(body.runId).toEqual(expect.any(String));
    expect(body.images).toEqual([
      expect.objectContaining({
        resultId: expect.any(String),
        assetId: expect.any(String),
        imageId: "remote-1",
        imageUrl: "/api/generated-images/remote-1",
        provider: "dashscope",
        model: "qwen-image-2.0-pro",
      }),
      expect.objectContaining({
        resultId: expect.any(String),
        imageId: "binary-1",
        imageUrl: "/api/generated-images/binary-1",
        provider: "dashscope",
        model: "qwen-image-2.0-pro",
      }),
    ]);

    await app.close();
  });

  it("validates retryOfTurnId within the selected conversation", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");

    repositoryMock.getConversationById.mockResolvedValue({
      id: "conversation-1",
      userId: "user-1",
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
    });
    repositoryMock.turnExists.mockResolvedValue(true);
    generateMock.mockResolvedValue({
      modelId: "seedream-v5",
      logicalModel: "image.seedream.v5",
      deploymentId: "ark-seedream-v5-primary",
      runtimeProvider: "ark",
      providerModel: "doubao-seedream-5-0-260128",
      images: [
        {
          binaryData: Buffer.from([1, 2, 3]),
          mimeType: "image/png",
        },
      ],
    });
    storeGeneratedImageMock.mockReturnValue("seedream-1");

    const app = Fastify();
    await app.register(imageGenerateRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "Retry this",
        conversationId: "conversation-1",
        retryOfTurnId: "turn-previous",
        modelId: "seedream-v5",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(200);
    expect(repositoryMock.turnExists).toHaveBeenCalledWith(
      "user-1",
      "conversation-1",
      "turn-previous"
    );
    expect(repositoryMock.createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        turn: expect.objectContaining({
          retryOfTurnId: "turn-previous",
        }),
      })
    );

    await app.close();
  });

  it("reuses client-provided optimistic ids for persisted turns and jobs", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");

    generateMock.mockResolvedValue({
      modelId: "seedream-v5",
      logicalModel: "image.seedream.v5",
      deploymentId: "ark-seedream-v5-primary",
      runtimeProvider: "ark",
      providerModel: "doubao-seedream-5-0-260128",
      images: [
        {
          binaryData: Buffer.from([1, 2, 3]),
          mimeType: "image/png",
        },
      ],
    });
    storeGeneratedImageMock.mockReturnValue("seedream-1");

    const app = Fastify();
    await app.register(imageGenerateRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "Client ids",
        clientTurnId: "client-turn-1",
        clientJobId: "client-job-1",
        modelId: "seedream-v5",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(200);
    expect(repositoryMock.createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        turn: expect.objectContaining({
          id: "client-turn-1",
        }),
        job: expect.objectContaining({
          id: "client-job-1",
        }),
      })
    );
    expect(response.json()).toMatchObject({
      turnId: "client-turn-1",
      jobId: "client-job-1",
      runId: expect.any(String),
    });

    await app.close();
  });

  it("uses threadId as the conversation alias when conversationId is omitted", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");

    repositoryMock.getConversationById.mockResolvedValue({
      id: "conversation-1",
      userId: "user-1",
      createdAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
    });
    generateMock.mockResolvedValue({
      modelId: "seedream-v5",
      logicalModel: "image.seedream.v5",
      deploymentId: "ark-seedream-v5-primary",
      runtimeProvider: "ark",
      providerModel: "doubao-seedream-5-0-260128",
      images: [
        {
          binaryData: Buffer.from([1, 2, 3]),
          mimeType: "image/png",
        },
      ],
    });
    storeGeneratedImageMock.mockReturnValue("seedream-1");

    const app = Fastify();
    await app.register(imageGenerateRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "Use thread id",
        threadId: "conversation-1",
        modelId: "seedream-v5",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(200);
    expect(repositoryMock.getConversationById).toHaveBeenCalledWith("user-1", "conversation-1");
    expect(repositoryMock.getOrCreateActiveConversation).not.toHaveBeenCalled();

    await app.close();
  });

  it("persists failed jobs when the provider returns an error", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");
    const { ProviderError } = await import("../providers/base/errors");

    generateMock.mockRejectedValueOnce(new ProviderError("policy blocked", 502));

    const app = Fastify();
    await app.register(imageGenerateRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "Blocked prompt",
        modelId: "seedream-v5",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: "policy blocked",
      conversationId: "conversation-1",
      threadId: "conversation-1",
      turnId: expect.any(String),
      jobId: expect.any(String),
      runId: expect.any(String),
    });
    expect(repositoryMock.completeGenerationFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        error: "policy blocked",
      })
    );

    await app.close();
  });

  it("rejects edit and variation requests until dedicated execution paths are implemented", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");

    const app = Fastify();
    await app.register(imageGenerateRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        Authorization: createBearerToken("user-1"),
      },
      payload: {
        prompt: "Edit this image",
        modelId: "seedream-v5",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        assetRefs: [
          {
            assetId: "asset-1",
            role: "edit",
          },
        ],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "image.edit is not available yet.",
    });
    expect(repositoryMock.createGeneration).not.toHaveBeenCalled();
    expect(generateMock).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects unsupported parameter combinations from the selected model", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");

    const app = Fastify();
    await app.register(imageGenerateRoute);

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
        referenceImages: [
          {
            id: "ref-1",
            url: "data:image/png;base64,abc",
            type: "content",
          },
        ],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Qwen Image 2.0 Pro does not support reference images.",
    });
    expect(repositoryMock.createGeneration).not.toHaveBeenCalled();

    await app.close();
  });
});
