import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

describe("seedreamImageProvider", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends Ark requests with bearer auth and normalizes remote urls", async () => {
    const { seedreamImageProvider } = await import("./seedream");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          created: 1_741_389_200,
          model: "doubao-seedream-5-0-260128",
          data: [
            {
              url: "https://cdn.example.com/generated-1.jpeg",
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

    const result = await seedreamImageProvider.generate(
      {
        prompt: "Rainy Tokyo alley",
        provider: "seedream",
        model: "doubao-seedream-5-0-260128",
        aspectRatio: "16:9",
        style: "cinematic",
        referenceImages: [],
        batchSize: 1,
        modelParams: {},
      },
      "ark-api-key"
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(input).toBe("https://ark.cn-beijing.volces.com/api/v3/images/generations");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer ark-api-key",
    });

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe("doubao-seedream-5-0-260128");
    expect(body.size).toBe("2560x1440");
    expect(body.sequential_image_generation).toBe("disabled");
    expect(body.response_format).toBe("url");
    expect(body.stream).toBe(false);
    expect(body.watermark).toBe(true);
    expect(String(body.prompt)).toContain("Style:");

    expect(result.provider).toBe("seedream");
    expect(result.model).toBe("doubao-seedream-5-0-260128");
    expect(result.images).toEqual([
      {
        imageUrl: "https://cdn.example.com/generated-1.jpeg",
        revisedPrompt: null,
      },
    ]);
  });

  it("normalizes inline base64 images when Ark returns b64_json", async () => {
    const { seedreamImageProvider } = await import("./seedream");
    const imageBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00]);

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              b64_json: imageBuffer.toString("base64"),
              revised_prompt: "Refined rainy alley",
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

    const result = await seedreamImageProvider.generate(
      {
        prompt: "Rainy Tokyo alley",
        provider: "seedream",
        model: "doubao-seedream-5-0-260128",
        aspectRatio: "1:1",
        style: "none",
        referenceImages: [],
        batchSize: 1,
        modelParams: {},
      },
      "ark-api-key"
    );

    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.binaryData).toEqual(imageBuffer);
    expect(result.images[0]?.mimeType).toBe("image/jpeg");
    expect(result.images[0]?.revisedPrompt).toBe("Refined rainy alley");
  });

  it("passes through configured seedream model params", async () => {
    const { seedreamImageProvider } = await import("./seedream");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              b64_json: Buffer.from([1, 2, 3]).toString("base64"),
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

    await seedreamImageProvider.generate(
      {
        prompt: "A clean product shot",
        provider: "seedream",
        model: "qwen-image-2512",
        aspectRatio: "1:1",
        style: "none",
        referenceImages: [],
        batchSize: 1,
        modelParams: {
          responseFormat: "b64_json",
          watermark: false,
          sequentialImageGeneration: "enabled",
        },
      },
      "ark-api-key"
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.response_format).toBe("b64_json");
    expect(body.watermark).toBe(false);
    expect(body.sequential_image_generation).toBe("enabled");
  });

  it("passes through newly supported Ark model ids", async () => {
    const { seedreamImageProvider } = await import("./seedream");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              url: "https://cdn.example.com/generated-qwen.jpeg",
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

    await seedreamImageProvider.generate(
      {
        prompt: "A clean product shot",
        provider: "seedream",
        model: "qwen-image-2512",
        aspectRatio: "1:1",
        style: "none",
        referenceImages: [],
        batchSize: 1,
        modelParams: {},
      },
      "ark-api-key"
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe("qwen-image-2512");
  });

  it("rejects empty Ark API keys before sending a request", async () => {
    const { seedreamImageProvider } = await import("./seedream");

    await expect(
      seedreamImageProvider.generate(
        {
          prompt: "Studio portrait",
          provider: "seedream",
          model: "doubao-seedream-5-0-260128",
          aspectRatio: "1:1",
          style: "none",
          referenceImages: [],
          batchSize: 1,
          modelParams: {},
        },
        "   "
      )
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Seedream API key is required.",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces upstream HTTP errors", async () => {
    const { seedreamImageProvider } = await import("./seedream");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "Unauthorized",
          },
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        }
      )
    );

    await expect(
      seedreamImageProvider.generate(
        {
          prompt: "Forbidden prompt",
          provider: "seedream",
          model: "doubao-seedream-5-0-260128",
          aspectRatio: "1:1",
          style: "none",
          referenceImages: [],
          batchSize: 1,
          modelParams: {},
        },
        "ark-api-key"
      )
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Unauthorized",
    });
  });

  it("surfaces Ark business errors from a 200 response", async () => {
    const { seedreamImageProvider } = await import("./seedream");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "Policy blocked",
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

    await expect(
      seedreamImageProvider.generate(
        {
          prompt: "Blocked prompt",
          provider: "seedream",
          model: "doubao-seedream-5-0-260128",
          aspectRatio: "1:1",
          style: "none",
          referenceImages: [],
          batchSize: 1,
          modelParams: {},
        },
        "ark-api-key"
      )
    ).rejects.toMatchObject({
      message: "Policy blocked",
    });
  });

  it("returns warnings when Ark includes entry-level errors alongside successful images", async () => {
    const { seedreamImageProvider } = await import("./seedream");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              url: "https://cdn.example.com/generated-1.jpeg",
            },
            {
              error: {
                message: "One image failed moderation",
              },
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

    const result = await seedreamImageProvider.generate(
      {
        prompt: "Batch portrait set",
        provider: "seedream",
        model: "doubao-seedream-5-0-260128",
        aspectRatio: "1:1",
        style: "none",
        referenceImages: [],
        batchSize: 1,
        modelParams: {},
      },
      "ark-api-key"
    );

    expect(result.images).toHaveLength(1);
    expect(result.warnings).toEqual(["One image failed moderation"]);
  });
});
