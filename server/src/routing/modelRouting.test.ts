import { describe, expect, it } from "vitest";
import { ProviderError } from "../providers/types";
import { buildRoutedRequests, shouldFallbackToNextModel } from "./modelRouting";

describe("modelRouting", () => {
  it("builds routed requests using capability fallback chain", () => {
    const requests = buildRoutedRequests({
      prompt: "Studio portrait",
      provider: "seedream",
      model: "doubao-seedream-5-0-260128",
      aspectRatio: "1:1",
      style: "none",
      referenceImages: [],
      batchSize: 1,
      modelParams: {},
    });

    expect(requests.map((entry) => entry.model)).toEqual([
      "doubao-seedream-5-0-260128",
      "doubao-seedream-4-0-250828",
      "qwen-image-2512",
      "z-image-v1",
    ]);
  });

  it("requires explicit retriable signal for fallback", () => {
    expect(shouldFallbackToNextModel(new ProviderError("rate limited", 429))).toBe(false);
    expect(
      shouldFallbackToNextModel(
        new ProviderError("rate limited", 429, undefined, {
          isRetriable: true,
        })
      )
    ).toBe(true);
  });
});
