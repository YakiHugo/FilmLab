import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

describe("zImageProvider", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends DashScope requests with the z-image model defaults and extracts result urls", async () => {
    const { zImageProvider } = await import("./zimage");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          output: {
            results: [
              {
                url: "https://cdn.example.com/zimage-1.png",
                actual_prompt: "Rewritten z-image prompt",
              },
            ],
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      )
    );

    const result = await zImageProvider.generate(
      {
        prompt: "Architectural concept art",
        provider: "zimage",
        model: "z-image-turbo",
        aspectRatio: "1:1",
        style: "none",
        referenceImages: [],
        seed: 7,
        batchSize: 1,
        modelParams: {
          promptExtend: true,
        },
      },
      "dashscope-key"
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(input).toBe("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation");

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe("z-image-turbo");
    expect(body.parameters).toEqual(
      expect.objectContaining({
        size: "1024*1024",
        prompt_extend: true,
        seed: 7,
      })
    );

    expect(result).toEqual({
      provider: "zimage",
      model: "z-image-turbo",
      images: [
        {
          imageUrl: "https://cdn.example.com/zimage-1.png",
          revisedPrompt: "Rewritten z-image prompt",
        },
      ],
    });
  });

});
