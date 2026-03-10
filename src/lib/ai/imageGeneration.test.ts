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

  it("sends platform model ids without provider selection and normalizes warnings", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          modelId: "seedream-v5",
          logicalModel: "image.seedream.v5",
          deploymentId: "ark-seedream-v5-primary",
          runtimeProvider: "ark",
          providerModel: "doubao-seedream-5-0-260128",
          createdAt: "2026-03-09T00:00:00.000Z",
          imageId: "img-1",
          imageUrl: "/api/generated-images/img-1",
          warnings: ["Seedream returned 1 of 2 requested images."],
          images: [
            {
              imageId: "img-1",
              imageUrl: "/api/generated-images/img-1",
              provider: "ark",
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
      modelId: "seedream-v5",
      aspectRatio: "1:1",
      style: "none",
      referenceImages: [],
      batchSize: 1,
      modelParams: {},
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/image-generate",
      expect.objectContaining({
        body: expect.stringContaining("\"modelId\":\"seedream-v5\""),
      })
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).not.toContain("\"provider\"");
    expect(result.warnings).toEqual(["Seedream returned 1 of 2 requested images."]);
    expect(result.images).toHaveLength(1);
  });

  it("preserves runtime routing metadata from the response", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          modelId: "qwen-image-2-pro",
          logicalModel: "image.qwen.v2.pro",
          deploymentId: "dashscope-qwen-image-2-pro-primary",
          runtimeProvider: "dashscope",
          providerModel: "qwen-image-2.0-pro",
          createdAt: "2026-03-09T00:00:00.000Z",
          imageId: "img-2",
          imageUrl: "/api/generated-images/img-2",
          images: [
            {
              imageId: "img-2",
              imageUrl: "/api/generated-images/img-2",
              provider: "dashscope",
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
      modelId: "qwen-image-2-pro",
      aspectRatio: "1:1",
      style: "none",
      referenceImages: [],
      batchSize: 1,
      modelParams: {},
    });

    expect(result).toMatchObject({
      modelId: "qwen-image-2-pro",
      logicalModel: "image.qwen.v2.pro",
      deploymentId: "dashscope-qwen-image-2-pro-primary",
      runtimeProvider: "dashscope",
      providerModel: "qwen-image-2.0-pro",
    });
    expect(result.images[0]).toMatchObject({
      provider: "dashscope",
      model: "qwen-image-2.0-pro",
    });
  });
});
