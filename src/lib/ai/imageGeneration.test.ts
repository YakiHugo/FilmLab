import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolveApiUrlMock = vi.fn((value: string) => value);
const getClientAuthTokenMock = vi.fn(() => "test-token");

vi.mock("@/lib/api/resolveApiUrl", () => ({
  resolveApiUrl: resolveApiUrlMock,
}));

vi.mock("@/lib/authToken", () => ({
  getClientAuthToken: () => getClientAuthTokenMock(),
}));

describe("generateImage", () => {
  beforeEach(() => {
    resolveApiUrlMock.mockClear();
    getClientAuthTokenMock.mockClear();
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
          conversationId: "conversation-1",
          threadId: "conversation-1",
          turnId: "turn-1",
          jobId: "job-1",
          runId: "run-1",
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
              resultId: "result-1",
              imageId: "img-1",
              imageUrl: "/api/generated-images/img-1",
              assetId: "thread-asset-1",
              provider: "ark",
              model: "doubao-seedream-5-0-260128",
            },
          ],
          runs: [],
          assets: [],
          primaryAssetIds: ["thread-asset-1"],
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
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
        body: expect.stringContaining("\"modelId\":\"seedream-v5\""),
      })
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).not.toContain("\"provider\"");
    expect(result).toMatchObject({
      conversationId: "conversation-1",
      threadId: "conversation-1",
      turnId: "turn-1",
      jobId: "job-1",
      runId: "run-1",
    });
    expect(result.warnings).toEqual(["Seedream returned 1 of 2 requested images."]);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      resultId: "result-1",
    });
  });

  it("preserves runtime routing metadata from the response", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          conversationId: "conversation-1",
          threadId: "conversation-1",
          turnId: "turn-2",
          jobId: "job-2",
          runId: "run-2",
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
              resultId: "result-2",
              imageId: "img-2",
              imageUrl: "/api/generated-images/img-2",
              assetId: "thread-asset-2",
              provider: "dashscope",
              model: "qwen-image-2.0-pro",
            },
          ],
          runs: [],
          assets: [],
          primaryAssetIds: ["thread-asset-2"],
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
      conversationId: "conversation-1",
      threadId: "conversation-1",
      turnId: "turn-2",
      jobId: "job-2",
      runId: "run-2",
      modelId: "qwen-image-2-pro",
      logicalModel: "image.qwen.v2.pro",
      deploymentId: "dashscope-qwen-image-2-pro-primary",
      runtimeProvider: "dashscope",
      providerModel: "qwen-image-2.0-pro",
    });
    expect(result.images[0]).toMatchObject({
      resultId: "result-2",
      provider: "dashscope",
      model: "qwen-image-2.0-pro",
    });
  });
});
