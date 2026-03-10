import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upscaleMock = vi.fn();
const getGeneratedImageMock = vi.fn();
const storeGeneratedImageMock = vi.fn();

vi.mock("../gateway/router/router", () => ({
  imageRuntimeRouter: {
    upscale: (...args: unknown[]) => upscaleMock(...args),
  },
}));

vi.mock("../shared/generatedImageStore", () => ({
  getGeneratedImage: (...args: unknown[]) => getGeneratedImageMock(...args),
  storeGeneratedImage: (...args: unknown[]) => storeGeneratedImageMock(...args),
}));

describe("imageUpscaleRoute", () => {
  beforeEach(() => {
    vi.resetModules();
    upscaleMock.mockReset();
    getGeneratedImageMock.mockReset();
    storeGeneratedImageMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes upscale through the image runtime router", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageUpscaleRoute } = await import("./image-upscale");

    getGeneratedImageMock.mockReturnValue({
      buffer: Buffer.from([1, 2, 3]),
      mimeType: "image/png",
    });
    upscaleMock.mockResolvedValue({
      binaryData: Buffer.from([4, 5, 6]),
      mimeType: "image/png",
    });
    storeGeneratedImageMock.mockReturnValue("upscaled-1");

    const app = Fastify();
    await app.register(imageUpscaleRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/image-upscale",
      payload: {
        provider: "dashscope",
        model: "qwen-image-2.0-pro",
        imageId: "cached-1",
        scale: "2x",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(upscaleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "dashscope",
        model: "qwen-image-2.0-pro",
      }),
      expect.objectContaining({
        imageBuffer: expect.any(Buffer),
        mimeType: "image/png",
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
    expect(response.json()).toEqual({
      provider: "qwen",
      runtimeProvider: "dashscope",
      modelFamily: "qwen",
      model: "qwen-image-2.0-pro",
      imageId: "upscaled-1",
      imageUrl: "/api/generated-images/upscaled-1",
      mimeType: "image/png",
    });

    await app.close();
  });

  it("returns router provider errors for unsupported upscale", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageUpscaleRoute } = await import("./image-upscale");
    const { ProviderError } = await import("../providers/base/errors");

    getGeneratedImageMock.mockReturnValue({
      buffer: Buffer.from([1, 2, 3]),
      mimeType: "image/png",
    });
    upscaleMock.mockRejectedValue(
      new ProviderError("Qwen Image Qwen Image 2.0 Pro does not support upscale.", 400)
    );

    const app = Fastify();
    await app.register(imageUpscaleRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/image-upscale",
      payload: {
        provider: "dashscope",
        model: "qwen-image-2.0-pro",
        imageId: "cached-1",
        scale: "2x",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Qwen Image Qwen Image 2.0 Pro does not support upscale.",
      provider: "qwen",
    });

    await app.close();
  });
});
