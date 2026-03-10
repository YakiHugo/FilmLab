import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolveApiUrlMock = vi.fn((value: string) => value);

vi.mock("@/lib/api/resolveApiUrl", () => ({
  resolveApiUrl: resolveApiUrlMock,
}));

describe("upscaleImage", () => {
  beforeEach(() => {
    resolveApiUrlMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts canonical providers and returns legacy-compatible provider metadata", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          provider: "qwen",
          runtimeProvider: "dashscope",
          modelFamily: "qwen",
          model: "qwen-image-2.0-pro",
          imageId: "img-upscaled-1",
          imageUrl: "/api/generated-images/img-upscaled-1",
          mimeType: "image/png",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      )
    );

    const { upscaleImage } = await import("./imageUpscale");
    const result = await upscaleImage({
      provider: "dashscope",
      model: "qwen-image-2.0-pro",
      imageId: "img-source-1",
      scale: "2x",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/image-upscale",
      expect.objectContaining({
        body: expect.stringContaining("\"provider\":\"dashscope\""),
      })
    );
    expect(result).toMatchObject({
      provider: "qwen",
      runtimeProvider: "dashscope",
      modelFamily: "qwen",
      model: "qwen-image-2.0-pro",
      imageId: "img-upscaled-1",
      imageUrl: "/api/generated-images/img-upscaled-1",
      mimeType: "image/png",
    });
  });
});
