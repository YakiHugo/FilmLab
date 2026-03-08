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

  it("signs Seedream requests and normalizes base64 images", async () => {
    const { seedreamImageProvider } = await import("./seedream");
    const imageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 10000,
          data: {
            binary_data_base64: [imageBuffer.toString("base64")],
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

    const result = await seedreamImageProvider.generate(
      {
        prompt: "Rainy Tokyo alley",
        negativePrompt: "avoid blur",
        provider: "seedream",
        model: "seedream-3.0",
        aspectRatio: "16:9",
        style: "cinematic",
        referenceImages: [],
        seed: 9,
        guidanceScale: 4.2,
        steps: 28,
        batchSize: 1,
        modelParams: {},
      },
      "access-key-id:secret-access-key"
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [input, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(input.toString()).toBe("https://visual.volcengineapi.com/?Action=CVProcess&Version=2022-08-31");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toContain("HMAC-SHA256");
    expect(headers["X-Date"]).toMatch(/^\d{8}T\d{6}Z$/);
    expect(headers["X-Content-Sha256"]).toMatch(/^[a-f0-9]{64}$/i);

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.req_key).toBe("seedream_3_0_t2i");
    expect(body.width).toBe(1664);
    expect(body.height).toBe(936);
    expect(body.scale).toBe(4.2);
    expect(body.ddim_steps).toBe(28);
    expect(body.seed).toBe(9);
    expect(body.negative_prompt).toBe("avoid blur");
    expect(String(body.prompt)).toContain("Style:");
    expect(String(body.prompt)).not.toContain("Avoid:");

    expect(result.provider).toBe("seedream");
    expect(result.model).toBe("seedream-3.0");
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.binaryData).toEqual(imageBuffer);
    expect(result.images[0]?.mimeType).toBe("image/png");
  });

  it("rejects malformed Seedream credentials before sending a request", async () => {
    const { seedreamImageProvider } = await import("./seedream");

    await expect(
      seedreamImageProvider.generate(
        {
          prompt: "Studio portrait",
          provider: "seedream",
          model: "seedream-3.0",
          aspectRatio: "1:1",
          style: "none",
          referenceImages: [],
          batchSize: 1,
          modelParams: {},
        },
        "invalid-key"
      )
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wraps batch seeds instead of clamping to the same value", async () => {
    const { seedreamImageProvider } = await import("./seedream");
    const imageBuffer = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 10000,
          data: {
            binary_data_base64: [imageBuffer.toString("base64")],
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

    await seedreamImageProvider.generate(
      {
        prompt: "Studio portrait",
        provider: "seedream",
        model: "seedream-3.0",
        aspectRatio: "1:1",
        style: "none",
        referenceImages: [],
        seed: 2_147_483_646,
        batchSize: 3,
        modelParams: {},
      },
      "access-key-id:secret-access-key"
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const seeds = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body)).seed);
    expect(seeds).toEqual([2_147_483_646, 2_147_483_647, 0]);
  });

  it("surfaces upstream HTTP 403 errors", async () => {
    const { seedreamImageProvider } = await import("./seedream");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Forbidden",
        }),
        {
          status: 403,
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
          model: "seedream-3.0",
          aspectRatio: "1:1",
          style: "none",
          referenceImages: [],
          batchSize: 1,
          modelParams: {},
        },
        "access-key-id:secret-access-key"
      )
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Forbidden",
    });
  });

  it("surfaces upstream HTTP 500 errors", async () => {
    const { seedreamImageProvider } = await import("./seedream");

    fetchMock.mockResolvedValue(
      new Response("Internal Error", {
        status: 500,
      })
    );

    await expect(
      seedreamImageProvider.generate(
        {
          prompt: "Retry later",
          provider: "seedream",
          model: "seedream-3.0",
          aspectRatio: "1:1",
          style: "none",
          referenceImages: [],
          batchSize: 1,
          modelParams: {},
        },
        "access-key-id:secret-access-key"
      )
    ).rejects.toMatchObject({
      statusCode: 500,
      message: "Internal Error",
    });
  });

  it("surfaces Seedream business errors from a 200 response", async () => {
    const { seedreamImageProvider } = await import("./seedream");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 50413,
          data: null,
          message: "Post Text Risk Not Pass",
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
          model: "seedream-3.0",
          aspectRatio: "1:1",
          style: "none",
          referenceImages: [],
          batchSize: 1,
          modelParams: {},
        },
        "access-key-id:secret-access-key"
      )
    ).rejects.toMatchObject({
      message: "Post Text Risk Not Pass",
    });
  });

  it("rejects empty base64 payloads", async () => {
    const { seedreamImageProvider } = await import("./seedream");

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 10000,
          data: {
            binary_data_base64: [],
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
          prompt: "No image returned",
          provider: "seedream",
          model: "seedream-3.0",
          aspectRatio: "1:1",
          style: "none",
          referenceImages: [],
          batchSize: 1,
          modelParams: {},
        },
        "access-key-id:secret-access-key"
      )
    ).rejects.toMatchObject({
      message: "Seedream provider returned no image data.",
    });
  });

  it("returns warnings when only part of a batch succeeds", async () => {
    const { seedreamImageProvider } = await import("./seedream");
    const imageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 10000,
            data: {
              binary_data_base64: [imageBuffer.toString("base64")],
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "Concurrent limit exceeded",
          }),
          {
            status: 429,
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
        model: "seedream-3.0",
        aspectRatio: "1:1",
        style: "none",
        referenceImages: [],
        batchSize: 2,
        modelParams: {},
      },
      "access-key-id:secret-access-key"
    );

    expect(result.images).toHaveLength(1);
    expect(result.warnings).toEqual([
      expect.stringContaining("Seedream returned 1 of 2 requested images."),
    ]);
    expect(result.warnings?.[0]).toContain("Concurrent limit exceeded");
  });
});
