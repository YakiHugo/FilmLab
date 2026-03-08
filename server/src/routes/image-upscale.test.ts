import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getProviderAdapterMock = vi.fn();
const getUserProviderKeyMock = vi.fn();
const resolveApiKeyMock = vi.fn();
const getGeneratedImageMock = vi.fn();
const storeGeneratedImageMock = vi.fn();
const upscaleMock = vi.fn();

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
    getProviderAdapterMock.mockReturnValue({
      upscale: upscaleMock,
    });
    getUserProviderKeyMock.mockReset();
    getUserProviderKeyMock.mockReturnValue("user-key");
    resolveApiKeyMock.mockReset();
    resolveApiKeyMock.mockReturnValue("user-key");
    getGeneratedImageMock.mockReset();
    getGeneratedImageMock.mockReturnValue({
      buffer: Buffer.from([1, 2, 3]),
      mimeType: "image/png",
      expiresAt: Date.now() + 60_000,
      sizeBytes: 3,
    });
    storeGeneratedImageMock.mockReset();
    storeGeneratedImageMock.mockReturnValue("upscaled-1");
    upscaleMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the cached image, calls adapter.upscale, and stores a fresh generated image", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageUpscaleRoute } = await import("./image-upscale");

    upscaleMock.mockResolvedValue({
      binaryData: Buffer.from([9, 8, 7]),
      mimeType: "image/png",
    });

    const app = Fastify();
    await app.register(imageUpscaleRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/image-upscale",
      payload: {
        provider: "stability",
        model: "stable-image-ultra",
        imageId: "cached-1",
        scale: "2x",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(getGeneratedImageMock).toHaveBeenCalledWith("cached-1");
    expect(upscaleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "stable-image-ultra",
        mimeType: "image/png",
        scale: "2x",
        imageBuffer: Buffer.from([1, 2, 3]),
      }),
      "user-key",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
    expect(storeGeneratedImageMock).toHaveBeenCalledWith(Buffer.from([9, 8, 7]), "image/png");

    expect(response.json()).toEqual({
      provider: "stability",
      model: "stable-image-ultra",
      imageId: "upscaled-1",
      imageUrl: "/api/generated-images/upscaled-1",
      mimeType: "image/png",
    });

    await app.close();
  });
});
