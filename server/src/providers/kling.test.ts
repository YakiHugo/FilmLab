import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

describe("klingImageProvider", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a Kling task and polls until image urls are available", async () => {
    const { klingImageProvider } = await import("./kling");

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              task_id: "task-1",
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
            code: 0,
            data: {
              task_status: "succeed",
              task_result: {
                images: [
                  {
                    url: "https://cdn.example.com/kling-1.png",
                  },
                ],
              },
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

    const result = await klingImageProvider.generate(
      {
        prompt: "Futuristic city skyline",
        provider: "kling",
        model: "kling-v3",
        aspectRatio: "21:9",
        style: "cinematic",
        negativePrompt: "avoid blur",
        referenceImages: [],
        batchSize: 2,
        modelParams: {
          resolution: "2k",
          watermark: true,
        },
      },
      "kling-key"
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [createUrl, createInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(createUrl).toBe("https://api-singapore.klingai.com/v1/images/generations");
    expect(createInit.method).toBe("POST");
    expect(createInit.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer kling-key",
    });

    const createBody = JSON.parse(String(createInit.body)) as Record<string, unknown>;
    expect(createBody).toEqual(
      expect.objectContaining({
        model_name: "kling-v3",
        negative_prompt: "avoid blur",
        n: 2,
        aspect_ratio: "21:9",
        resolution: "2k",
        watermark_info: {
          enabled: true,
        },
      })
    );
    expect(String(createBody.prompt)).toContain("Style:");

    const [pollUrl, pollInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(pollUrl).toBe("https://api-singapore.klingai.com/v1/images/generations/task-1");
    expect(pollInit).toEqual({
      method: "GET",
      headers: {
        Authorization: "Bearer kling-key",
      },
      signal: expect.any(AbortSignal),
    });

    expect(result).toEqual({
      provider: "kling",
      model: "kling-v3",
      images: [
        {
          imageUrl: "https://cdn.example.com/kling-1.png",
        },
      ],
    });
  });

  it("surfaces task creation failures", async () => {
    const { klingImageProvider } = await import("./kling");

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 10001,
          message: "quota exceeded",
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
      klingImageProvider.generate(
        {
          prompt: "Too many requests",
          provider: "kling",
          model: "kling-v2-1",
          aspectRatio: "1:1",
          style: "none",
          referenceImages: [],
          batchSize: 1,
          modelParams: {},
        },
        "kling-key"
      )
    ).rejects.toMatchObject({
      statusCode: 502,
      message: "quota exceeded",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces failed Kling task statuses", async () => {
    const { klingImageProvider } = await import("./kling");

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              task_id: "task-2",
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
            code: 0,
            data: {
              task_status: "failed",
              task_status_msg: "moderation blocked",
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
      klingImageProvider.generate(
        {
          prompt: "Blocked prompt",
          provider: "kling",
          model: "kling-v2-1",
          aspectRatio: "1:1",
          style: "none",
          referenceImages: [],
          batchSize: 1,
          modelParams: {},
        },
        "kling-key"
      )
    ).rejects.toMatchObject({
      statusCode: 502,
      message: "moderation blocked",
    });
  });

  it("times out when poll does not converge", async () => {
    vi.useFakeTimers();
    const { klingImageProvider } = await import("./kling");

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              task_id: "task-timeout",
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
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              task_status: "processing",
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

    const pending = klingImageProvider.generate(
      {
        prompt: "Long running task",
        provider: "kling",
        model: "kling-v2-1",
        aspectRatio: "1:1",
        style: "none",
        referenceImages: [],
        batchSize: 1,
        modelParams: {},
      },
      "kling-key",
      {
        timeoutMs: 1,
      }
    );

    const timedOut = expect(pending).rejects.toMatchObject({
      statusCode: 504,
      message: "Kling image generation timed out.",
    });

    await vi.advanceTimersByTimeAsync(3_000);
    await timedOut;
  });
});
