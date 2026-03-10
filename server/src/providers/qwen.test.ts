import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

describe("qwenImageProvider", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends DashScope requests with prompt rewrite, batch size, seed, and negative prompt", async () => {
    const { qwenImageProvider } = await import("./qwen");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          output: {
            choices: [
              {
                message: {
                  content: [
                    { image: "https://cdn.example.com/qwen-1.png" },
                    { text: "Expanded prompt" },
                  ],
                },
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

    const result = await qwenImageProvider.generate(
      {
        prompt: "Studio portrait",
        provider: "qwen",
        model: "qwen-image-2.0-pro",
        aspectRatio: "custom",
        width: 1536,
        height: 1024,
        style: "cinematic",
        negativePrompt: "avoid blur",
        referenceImages: [],
        seed: 42,
        batchSize: 3,
        modelParams: {
          promptExtend: false,
        },
      },
      "dashscope-key"
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(input).toBe("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer dashscope-key",
    });

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe("qwen-image-2.0-pro");
    expect(body.parameters).toEqual(
      expect.objectContaining({
        size: "1536*1024",
        n: 3,
        prompt_extend: false,
        negative_prompt: "avoid blur",
        seed: 42,
      })
    );
    expect(
      (body.input as { messages: Array<{ content: Array<{ text: string }> }> }).messages[0]?.content[0]
        ?.text
    ).toContain("Style:");

    expect(result).toEqual({
      provider: "qwen",
      model: "qwen-image-2.0-pro",
      images: [
        {
          imageUrl: "https://cdn.example.com/qwen-1.png",
          revisedPrompt: "Expanded prompt",
        },
      ],
    });
  });

  it("returns a warning when reference images are provided but unsupported", async () => {
    const { qwenImageProvider } = await import("./qwen");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          output: {
            choices: [
              {
                message: {
                  content: [{ image: "https://cdn.example.com/qwen-1.png" }],
                },
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

    const result = await qwenImageProvider.generate(
      {
        prompt: "Studio portrait",
        provider: "qwen",
        model: "qwen-image-2.0-pro",
        aspectRatio: "1:1",
        style: "none",
        referenceImages: [
          {
            url: "https://example.com/ref.png",
            type: "content",
            weight: 0.8,
          },
        ],
        batchSize: 1,
        modelParams: {},
      },
      "dashscope-key"
    );

    expect(result.warnings).toEqual([
      "Qwen Image does not support reference images yet. Ignored 1 reference image.",
    ]);
  });
});
