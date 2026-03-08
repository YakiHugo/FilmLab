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
      provider: "flux",
      model: "flux-pro",
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
        provider: "flux",
        model: "flux-pro",
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
    expect(body.images).toEqual([
      expect.objectContaining({
        imageId: "remote-1",
        imageUrl: "/api/generated-images/remote-1",
        provider: "flux",
        model: "flux-pro",
      }),
      expect.objectContaining({
        imageId: "binary-1",
        imageUrl: "/api/generated-images/binary-1",
        provider: "flux",
        model: "flux-pro",
      }),
    ]);

    await app.close();
  });
});
