import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getProviderApiKeyMock = vi.fn();
const resolveApiUrlMock = vi.fn((value: string) => value);

vi.mock("@/stores/apiKeyStore", () => ({
  getProviderApiKey: getProviderApiKeyMock,
}));

vi.mock("@/lib/api/resolveApiUrl", () => ({
  resolveApiUrl: resolveApiUrlMock,
}));

describe("generateImage", () => {
  beforeEach(() => {
    getProviderApiKeyMock.mockReset();
    resolveApiUrlMock.mockClear();
    getProviderApiKeyMock.mockReturnValue("");
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
          model: "seedream-3.0",
          createdAt: "2026-03-09T00:00:00.000Z",
          imageId: "img-1",
          imageUrl: "/api/generated-images/img-1",
          warnings: ["Seedream returned 1 of 2 requested images."],
          images: [
            {
              imageId: "img-1",
              imageUrl: "/api/generated-images/img-1",
              provider: "seedream",
              model: "seedream-3.0",
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
      model: "seedream-3.0",
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
});
