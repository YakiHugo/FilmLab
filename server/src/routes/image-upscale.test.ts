import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upscaleMock = vi.fn();
const getProviderAdapterMock = vi.fn();
const getUserProviderKeyMock = vi.fn();
const resolveApiKeyMock = vi.fn();
const getGeneratedImageMock = vi.fn();
const storeGeneratedImageMock = vi.fn();

vi.mock("../providers/registry", () => ({
  getProviderAdapter: (...args: unknown[]) => getProviderAdapterMock(...args),
  getUserProviderKey: (...args: unknown[]) => getUserProviderKeyMock(...args),
  resolveApiKey: (...args: unknown[]) => resolveApiKeyMock(...args),
}));

vi.mock("../shared/generatedImageStore", () => ({
  getGeneratedImage: (...args: unknown[]) => getGeneratedImageMock(...args),
  storeGeneratedImage: (...args: unknown[]) => storeGeneratedImageMock(...args),
}));

describe("imageUpscaleRoute", () => {
  beforeEach(() => {
    vi.resetModules();
    getProviderAdapterMock.mockReset();
    getProviderAdapterMock.mockReturnValue({});
    getUserProviderKeyMock.mockReset();
    getUserProviderKeyMock.mockReturnValue("user-key");
    resolveApiKeyMock.mockReset();
    resolveApiKeyMock.mockReturnValue("user-key");
    getGeneratedImageMock.mockReset();
    getGeneratedImageMock.mockReturnValue({
      buffer: Buffer.from([1, 2, 3]),
      mimeType: "image/png",
    });
    storeGeneratedImageMock.mockReset();
    storeGeneratedImageMock.mockReturnValue("upscaled-1");
    upscaleMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects upscale requests for active providers without an upscale adapter", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageUpscaleRoute } = await import("./image-upscale");

    const app = Fastify();
    await app.register(imageUpscaleRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/image-upscale",
      payload: {
        provider: "seedream",
        model: "doubao-seedream-5-0-260128",
        imageId: "cached-1",
        scale: "2x",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Upscale is not supported for provider: seedream",
    });

    await app.close();
  });

  it("returns normalized errorCode for upscale provider errors", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageUpscaleRoute } = await import("./image-upscale");
    const { ProviderError } = await import("../providers/types");

    getProviderAdapterMock.mockReturnValue({
      upscale: upscaleMock,
    });
    upscaleMock.mockRejectedValueOnce(
      new ProviderError("rate limit", {
        statusCode: 429,
        code: "PROVIDER_RATE_LIMIT",
        provider: "qwen",
        upstreamStatus: 429,
        retryable: true,
      })
    );

    const app = Fastify();
    await app.register(imageUpscaleRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/image-upscale",
      payload: {
        provider: "qwen",
        model: "qwen-image-edit",
        imageId: "cached-1",
        scale: "2x",
      },
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      errorCode: "PROVIDER_RATE_LIMIT",
      provider: "qwen",
    });

    await app.close();
  });
});
