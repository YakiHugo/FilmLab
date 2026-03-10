import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const resolveApiUrlMock = vi.fn((value: string) => value);

vi.mock("@/lib/api/resolveApiUrl", () => ({
  resolveApiUrl: resolveApiUrlMock,
}));

describe("generateImage", () => {
  beforeEach(() => {
    resolveApiUrlMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes warnings from the image generation response", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          provider: "seedream",
          model: "doubao-seedream-5-0-260128",
          createdAt: "2026-03-09T00:00:00.000Z",
          imageId: "img-1",
          imageUrl: "/api/generated-images/img-1",
          warnings: ["Seedream returned 1 of 2 requested images."],
          images: [
            {
              imageId: "img-1",
              imageUrl: "/api/generated-images/img-1",
              provider: "seedream",
              model: "doubao-seedream-5-0-260128",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      )
    );

    const { generateImage } = await import("./imageGeneration");
    const result = await generateImage({
      prompt: "Rainy alley",
      provider: "seedream",
      model: "doubao-seedream-5-0-260128",
      aspectRatio: "1:1",
      style: "none",
      referenceImages: [],
      batchSize: 1,
      modelParams: {},
    });

    expect(result.warnings).toEqual(["Seedream returned 1 of 2 requested images."]);
    expect(result.images).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("accepts canonical providers and preserves runtime metadata from the response", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          provider: "qwen",
          runtimeProvider: "dashscope",
          modelFamily: "qwen",
          model: "qwen-image-2.0-pro",
          createdAt: "2026-03-09T00:00:00.000Z",
          imageId: "img-2",
          imageUrl: "/api/generated-images/img-2",
          images: [
            {
              imageId: "img-2",
              imageUrl: "/api/generated-images/img-2",
              provider: "qwen",
              model: "qwen-image-2.0-pro",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      )
    );

    const { generateImage } = await import("./imageGeneration");
    const result = await generateImage({
      prompt: "Rainy alley",
      provider: "dashscope",
      model: "qwen-image-2.0-pro",
      aspectRatio: "1:1",
      style: "none",
      referenceImages: [],
      batchSize: 1,
      modelParams: {},
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/image-generate",
      expect.objectContaining({
        body: expect.stringContaining("\"provider\":\"dashscope\""),
      })
    );
    expect(result.provider).toBe("qwen");
    expect(result.runtimeProvider).toBe("dashscope");
    expect(result.modelFamily).toBe("qwen");
    expect(result.images[0]).toMatchObject({
      provider: "qwen",
      runtimeProvider: "dashscope",
      modelFamily: "qwen",
    });
  });
});
