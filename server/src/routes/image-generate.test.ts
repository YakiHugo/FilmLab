import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateMock = vi.fn();
const downloadGeneratedImageMock = vi.fn();
const storeGeneratedImageMock = vi.fn();

vi.mock("../gateway/router/router", () => ({
  imageRuntimeRouter: {
    generate: (...args: unknown[]) => generateMock(...args),
  },
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
    generateMock.mockReset();
    downloadGeneratedImageMock.mockReset();
    storeGeneratedImageMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes provider outputs to local urls and includes canonical runtime metadata", async () => {
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

    const body = response.json();
    expect(body.modelId).toBe("qwen-image-2-pro");
    expect(body.logicalModel).toBe("image.qwen.v2.pro");
    expect(body.deploymentId).toBe("dashscope-qwen-image-2-pro-primary");
    expect(body.runtimeProvider).toBe("dashscope");
    expect(body.providerModel).toBe("qwen-image-2.0-pro");
    expect(body.imageId).toBe("remote-1");
    expect(body.imageUrl).toBe("/api/generated-images/remote-1");
    expect(body.warnings).toEqual(["2 of 4 images completed."]);
    expect(body.images).toEqual([
      expect.objectContaining({
        imageId: "remote-1",
        imageUrl: "/api/generated-images/remote-1",
        provider: "dashscope",
        model: "qwen-image-2.0-pro",
      }),
      expect.objectContaining({
        imageId: "binary-1",
        imageUrl: "/api/generated-images/binary-1",
        provider: "dashscope",
        model: "qwen-image-2.0-pro",
      }),
    ]);

    await app.close();
  });

  it("returns provider errors from the runtime router", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");
    const { ProviderError } = await import("../providers/base/errors");

    generateMock.mockRejectedValueOnce(new ProviderError("policy blocked", 502));

    const app = Fastify();
    await app.register(imageGenerateRoute);

    const response = await app.inject({
      method: "POST",
      url: "/api/image-generate",
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
    });

    await app.close();
  });

  it("rejects unsupported parameter combinations from the selected model", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");

    generateMock.mockResolvedValue({
      modelId: "qwen-image-2-pro",
      logicalModel: "image.qwen.v2.pro",
      deploymentId: "dashscope-qwen-image-2-pro-primary",
      runtimeProvider: "dashscope",
      providerModel: "qwen-image-2.0-pro",
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
        modelId: "qwen-image-2-pro",
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

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Qwen Image 2.0 Pro does not support reference images.",
    });

    await app.close();
  });
});
