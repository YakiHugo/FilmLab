import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateMock = vi.fn();
const getProviderAdapterMock = vi.fn();
const getUserProviderKeyMock = vi.fn();
const resolveApiKeyMock = vi.fn();
const downloadGeneratedImageMock = vi.fn();
const storeGeneratedImageMock = vi.fn();

vi.mock("../providers/registry", () => ({
  getProviderAdapter: (...args: unknown[]) => getProviderAdapterMock(...args),
  getUserProviderKey: (...args: unknown[]) => getUserProviderKeyMock(...args),
  resolveApiKey: (...args: unknown[]) => resolveApiKeyMock(...args),
}));

vi.mock("../shared/downloadGeneratedImage", () => ({
  downloadGeneratedImage: (...args: unknown[]) => downloadGeneratedImageMock(...args),
}));

vi.mock("../shared/generatedImageStore", () => ({
  storeGeneratedImage: (...args: unknown[]) => storeGeneratedImageMock(...args),
}));

describe("imageGenerateRoute", () => {
  beforeEach(() => {
    vi.resetModules();
    getProviderAdapterMock.mockReset();
    getProviderAdapterMock.mockReturnValue({
      generate: generateMock,
    });
    getUserProviderKeyMock.mockReset();
    getUserProviderKeyMock.mockReturnValue("user-key");
    resolveApiKeyMock.mockReset();
    resolveApiKeyMock.mockReturnValue("user-key");
    generateMock.mockReset();
    downloadGeneratedImageMock.mockReset();
    storeGeneratedImageMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes remote and binary provider outputs to local generated-image urls", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");

    generateMock.mockResolvedValue({
      provider: "qwen",
      model: "qwen-image-2.0-pro",
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
      payload: {
        prompt: "Studio portrait",
        provider: "qwen",
        model: "qwen-image-2.0-pro",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(200);
    expect(downloadGeneratedImageMock).toHaveBeenCalledWith(
      "https://cdn.example.com/remote.png",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );

    const body = response.json();
    expect(body.imageId).toBe("remote-1");
    expect(body.imageUrl).toBe("/api/generated-images/remote-1");
    expect(body.warnings).toEqual(["2 of 4 images completed."]);
    expect(body.images).toEqual([
      expect.objectContaining({
        imageId: "remote-1",
        imageUrl: "/api/generated-images/remote-1",
        provider: "qwen",
        model: "qwen-image-2.0-pro",
      }),
      expect.objectContaining({
        imageId: "binary-1",
        imageUrl: "/api/generated-images/binary-1",
        provider: "qwen",
        model: "qwen-image-2.0-pro",
      }),
    ]);

    await app.close();
  });

  it("reads the Seedream provider key from request headers", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");

    generateMock.mockResolvedValue({
      provider: "seedream",
      model: "doubao-seedream-5-0-260128",
      images: [
        {
          binaryData: Buffer.from([1, 2, 3]),
          mimeType: "image/jpeg",
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
        "X-Provider-Key-seedream": "ark-user-key",
      },
      payload: {
        prompt: "Studio portrait",
        provider: "seedream",
        model: "doubao-seedream-5-0-260128",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(200);
    expect(getUserProviderKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        "x-provider-key-seedream": "ark-user-key",
      }),
      "seedream"
    );
    expect(resolveApiKeyMock).toHaveBeenCalledWith("seedream", "user-key");

    await app.close();
  });

  it("returns provider errors without retrying another model", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");
    const { ProviderError } = await import("../providers/types");

    generateMock.mockRejectedValueOnce(new ProviderError("policy blocked", 502));

    const app = Fastify();
    await app.register(imageGenerateRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      headers: {
        "X-Provider-Key-seedream": "ark-user-key",
      },
      payload: {
        prompt: "Blocked prompt",
        provider: "seedream",
        model: "doubao-seedream-5-0-260128",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: "policy blocked",
      errorCode: "PROVIDER_UPSTREAM",
      provider: "seedream",
    });
    expect(generateMock).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("returns 401 when no user key or server key is available", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");

    resolveApiKeyMock.mockReturnValue("");

    const app = Fastify();
    await app.register(imageGenerateRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      payload: {
        prompt: "Studio portrait",
        provider: "qwen",
        model: "qwen-image-2.0-pro",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(401);
    expect(generateMock).not.toHaveBeenCalled();

    await app.close();
  });

  it("adds capability-registry warnings when unsupported reference images are supplied", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");

    generateMock.mockResolvedValue({
      provider: "qwen",
      model: "qwen-image-2.0-pro",
      images: [
        {
          binaryData: Buffer.from([1, 2, 3]),
          mimeType: "image/png",
        },
      ],
    });
    storeGeneratedImageMock.mockReturnValue("qwen-1");

    const app = Fastify();
    await app.register(imageGenerateRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
      payload: {
        prompt: "Studio portrait",
        provider: "qwen",
        model: "qwen-image-2.0-pro",
        aspectRatio: "1:1",
        batchSize: 1,
        style: "none",
        referenceImages: [
          {
            url: "data:image/png;base64,abc",
            type: "content",
          },
        ],
        modelParams: {},
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.warnings).toEqual([
      "Qwen Image Qwen Image 2.0 Pro ignores 1 reference image.",
    ]);

    await app.close();
  });
  it("returns the same normalized errorCode for equivalent auth errors across providers", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");
    const { ProviderError } = await import("../providers/types");

    const app = Fastify();
    await app.register(imageGenerateRoute);

    const providers = [
      { provider: "qwen", model: "qwen-image-2.0-pro" },
      { provider: "seedream", model: "doubao-seedream-5-0-260128" },
    ] as const;

    for (const item of providers) {
      generateMock.mockRejectedValueOnce(
        new ProviderError(`${item.provider} auth failed`, {
          statusCode: 401,
          code: "PROVIDER_AUTH",
          provider: item.provider,
          upstreamStatus: 401,
          retryable: false,
        })
      );

      const response = await app.inject({
        method: "POST",
        url: "/api/image-generate",
        payload: {
          prompt: "Auth check",
          provider: item.provider,
          model: item.model,
          aspectRatio: "1:1",
          batchSize: 1,
          style: "none",
          referenceImages: [],
          modelParams: {},
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        provider: item.provider,
        errorCode: "PROVIDER_AUTH",
      });
    }

    await app.close();
  });

});
