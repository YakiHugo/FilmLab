import { describe, expect, it } from "vitest";
import {
  requestFilmRecommendationWithRetry,
  retryWithBackoff,
  type RecommendFilmRequestPayload,
} from "./client";

describe("retryWithBackoff", () => {
  it("retries until success", async () => {
    let calls = 0;
    const result = await retryWithBackoff(
      async () => {
        calls += 1;
        if (calls < 3) {
          throw new Error("fail");
        }
        return "ok";
      },
      { maxRetries: 3, baseDelayMs: 0 }
    );

    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });
});

describe("requestFilmRecommendationWithRetry", () => {
  it("returns parsed payload and attempt count", async () => {
    const payload: RecommendFilmRequestPayload = {
      assetId: "asset-1",
      imageDataUrl: "data:image/jpeg;base64,aaa",
      candidates: [
        {
          id: "preset-1",
          name: "Preset 1",
          description: "Preset 1",
          tags: ["portrait"],
          intensity: 60,
          isCustom: false,
        },
      ],
      topK: 5,
    };

    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      if (calls < 3) {
        return new Response("fail", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          model: "gpt-4.1-mini",
          topPresets: [
            {
              presetId: "preset-1",
              reason: "best",
              confidence: 0.9,
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };

    const result = await requestFilmRecommendationWithRetry(payload, {
      fetchImpl,
      maxRetries: 3,
      baseDelayMs: 0,
    });

    expect(calls).toBe(3);
    expect(result.attempts).toBe(3);
    expect(result.model).toBe("gpt-4.1-mini");
    expect(result.topPresets[0]?.presetId).toBe("preset-1");
  });
});
