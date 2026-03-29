import { describe, expect, it } from "vitest";
import type { ImageLabObservabilityView } from "../../../../shared/imageLabViews";
import {
  invalidatePromptObservabilityState,
  shouldFetchPromptArtifacts,
  shouldFetchPromptObservability,
} from "./useImageGeneration";
import {
  toGenerationConfigFromRequest,
  toImageGenerationRequest,
} from "./imageLabViewState";

describe("image generation request snapshots", () => {
  it("maps canonical request views into generation config snapshots", () => {
    const config = toGenerationConfigFromRequest({
      modelId: "qwen-image-2-pro",
      aspectRatio: "1:1",
      width: null,
      height: null,
      style: "none",
      stylePreset: "",
      negativePrompt: "",
      promptIntent: {
        preserve: [],
        avoid: [],
        styleDirectives: [],
        continuityTargets: [],
        editOps: [],
      },
      operation: "edit",
      inputAssets: [
        {
          assetId: "asset-guide-1",
          binding: "guide",
          guideType: "style",
          weight: 0.35,
        },
        {
          assetId: "asset-source-1",
          binding: "source",
        },
      ],
      seed: null,
      guidanceScale: null,
      steps: null,
      sampler: "",
      batchSize: 1,
      modelParams: {},
    });

    expect(config.operation).toBe("edit");
    expect(config.inputAssets).toEqual([
      {
        assetId: "asset-guide-1",
        binding: "guide",
        guideType: "style",
        weight: 0.35,
      },
      {
        assetId: "asset-source-1",
        binding: "source",
      },
    ]);
  });

  it("preserves new request view bindings without reintroducing legacy fields", () => {
    const config = toGenerationConfigFromRequest({
      modelId: "qwen-image-2-pro",
      aspectRatio: "1:1",
      width: null,
      height: null,
      style: "none",
      stylePreset: "",
      negativePrompt: "",
      promptIntent: {
        preserve: [],
        avoid: [],
        styleDirectives: [],
        continuityTargets: [],
        editOps: [],
      },
      operation: "variation",
      inputAssets: [
        { assetId: "asset-source-1", binding: "source" },
        {
          assetId: "asset-guide-1",
          binding: "guide",
          guideType: "content",
          weight: 0.8,
        },
      ],
      seed: null,
      guidanceScale: null,
      steps: null,
      sampler: "",
      batchSize: 1,
      modelParams: {
        promptExtend: true,
      },
    });

    expect(config.operation).toBe("variation");
    expect(config.inputAssets).toEqual([
      { assetId: "asset-source-1", binding: "source" },
      {
        assetId: "asset-guide-1",
        binding: "guide",
        guideType: "content",
        weight: 0.8,
      },
    ]);

    const request = toImageGenerationRequest("Rainy alley", config);
    expect(request.operation).toBe("variation");
    expect(request.inputAssets).toEqual(config.inputAssets);
    const requestRecord = request as unknown as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(requestRecord, "referenceImages")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(requestRecord, "assetRefs")).toBe(false);
  });

  it("only fetches prompt artifacts lazily when they are not already cached", () => {
    expect(shouldFetchPromptArtifacts("done", null)).toBe(true);
    expect(shouldFetchPromptArtifacts("done", { status: "error" })).toBe(true);
    expect(shouldFetchPromptArtifacts("done", { status: "loaded" })).toBe(false);
    expect(shouldFetchPromptArtifacts("done", { status: "loading" })).toBe(false);
    expect(shouldFetchPromptArtifacts("loading", null)).toBe(false);
  });

  it("only re-fetches prompt observability when cache is missing, stale, or failed", () => {
    expect(shouldFetchPromptObservability(null, null)).toBe(false);
    expect(shouldFetchPromptObservability("conversation-1", null)).toBe(true);
    expect(
      shouldFetchPromptObservability("conversation-1", {
        conversationId: "conversation-1",
        status: "loaded",
      })
    ).toBe(false);
    expect(
      shouldFetchPromptObservability("conversation-1", {
        conversationId: "conversation-1",
        status: "loading",
      })
    ).toBe(false);
    expect(
      shouldFetchPromptObservability("conversation-1", {
        conversationId: "conversation-1",
        status: "error",
      })
    ).toBe(true);
    expect(
      shouldFetchPromptObservability("conversation-2", {
        conversationId: "conversation-1",
        status: "loaded",
      })
    ).toBe(true);
  });

  it("invalidates prompt observability for the same conversation without discarding the last summary", () => {
    const summary: ImageLabObservabilityView = {
      conversationId: "conversation-1",
      overview: {
        totalTurns: 1,
        turnsWithArtifacts: 1,
        degradedTurns: 0,
        fallbackTurns: 0,
      },
      semanticLosses: [],
      targets: [],
      turns: [],
    };

    expect(
      invalidatePromptObservabilityState("conversation-1", {
        conversationId: "conversation-1",
        status: "loaded",
        error: null,
        summary,
      })
    ).toEqual({
      conversationId: "conversation-1",
      status: "idle",
      error: null,
      summary,
    });
    expect(
      invalidatePromptObservabilityState("conversation-2", {
        conversationId: "conversation-1",
        status: "loaded",
        error: null,
        summary,
      })
    ).toBeNull();
    expect(invalidatePromptObservabilityState(null, null)).toBeNull();
  });
});
