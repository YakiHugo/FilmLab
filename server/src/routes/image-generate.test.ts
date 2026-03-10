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
      runtimeProvider: "dashscope",
      modelFamily: "qwen",
      legacyProvider: "qwen",
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
        provider: "dashscope",
        model: "qwen-image-2.0-pro",
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
        provider: "dashscope",
        model: "qwen-image-2.0-pro",
      }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );

    const body = response.json();
    expect(body.provider).toBe("qwen");
    expect(body.runtimeProvider).toBe("dashscope");
    expect(body.modelFamily).toBe("qwen");
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
    expect(response.json()).toEqual({
      error: "policy blocked",
      provider: "seedream",
    });

    await app.close();
  });

  it("adds capability-registry warnings when unsupported reference images are supplied", async () => {
    const { default: Fastify } = await import("fastify");
    const { imageGenerateRoute } = await import("./image-generate");

    generateMock.mockResolvedValue({
      runtimeProvider: "dashscope",
      modelFamily: "qwen",
      legacyProvider: "qwen",
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
        provider: "dashscope",
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
    expect(response.json().warnings).toEqual([
      "Qwen Image Qwen Image 2.0 Pro ignores 1 reference image.",
    ]);

    await app.close();
  });
});
