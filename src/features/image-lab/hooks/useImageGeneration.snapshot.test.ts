import { describe, expect, it } from "vitest";
import type { PromptObservabilitySummaryResponse } from "../../../../shared/chatImageTypes";
import {
  deserializeAssetRefs,
  invalidatePromptObservabilityState,
  RETRY_REFERENCE_IMAGES_OMITTED_WARNING,
  omitUnavailableReferenceImages,
  resolveRetryRequestSnapshot,
  shouldFetchPromptArtifacts,
  shouldFetchPromptObservability,
  toPersistedRequestSnapshot,
} from "./useImageGeneration";

describe("image generation request snapshots", () => {
  it("restores reference-only asset ref metadata from persisted snapshots", () => {
    expect(
      deserializeAssetRefs([
        {
          assetId: "asset-reference",
          role: "reference",
          referenceType: "style",
          weight: 0.35,
        },
        {
          assetId: "asset-edit",
          role: "edit",
          referenceType: "controlnet",
          weight: 0.8,
        },
      ])
    ).toEqual([
      {
        assetId: "asset-reference",
        role: "reference",
        referenceType: "style",
        weight: 0.35,
      },
      {
        assetId: "asset-edit",
        role: "edit",
      },
    ]);
  });

  it("preserves reference image urls for replayable retries", () => {
    const snapshot = toPersistedRequestSnapshot({
      prompt: "Rainy alley",
      modelId: "qwen-image-2-pro",
      aspectRatio: "1:1",
      style: "none",
      batchSize: 1,
      promptIntent: {
        preserve: [],
        avoid: [],
        styleDirectives: [],
        continuityTargets: [],
        editOps: [],
      },
      modelParams: {
        promptExtend: true,
      },
      referenceImages: [
        {
          id: "ref-1",
          url: "data:image/png;base64,AAA",
          type: "content",
          sourceAssetId: "thread-asset-1",
        },
      ],
      assetRefs: [{ assetId: "thread-asset-1", role: "reference" }],
    });

    expect(snapshot.referenceImages).toEqual([
      expect.objectContaining({
        id: "ref-1",
        url: "data:image/png;base64,AAA",
        sourceAssetId: "thread-asset-1",
      }),
    ]);

    const retryRequest = resolveRetryRequestSnapshot(snapshot);
    expect(retryRequest.warnings).toEqual([]);
    expect(retryRequest.request.referenceImages).toEqual([
      expect.objectContaining({
        id: "ref-1",
        url: "data:image/png;base64,AAA",
        sourceAssetId: "thread-asset-1",
      }),
    ]);
  });

  it("warns when historical reference image urls are unavailable", () => {
    const retryRequest = resolveRetryRequestSnapshot({
      prompt: "Rainy alley",
      modelId: "qwen-image-2-pro",
      aspectRatio: "1:1",
      style: "none",
      batchSize: 1,
      promptIntent: {
        preserve: [],
        avoid: [],
        styleDirectives: [],
        continuityTargets: [],
        editOps: [],
      },
      modelParams: {
        promptExtend: true,
      },
      referenceImages: [
        {
          id: "ref-1",
          fileName: "missing.png",
          type: "content",
        },
      ],
    });

    expect(retryRequest.request.referenceImages).toEqual([]);
    expect(retryRequest.warnings).toEqual([RETRY_REFERENCE_IMAGES_OMITTED_WARNING]);
  });

  it("drops unavailable reference images from legacy config retries and keeps valid refs", () => {
    const resolved = omitUnavailableReferenceImages({
      modelId: "qwen-image-2-pro",
      aspectRatio: "1:1",
      width: 1024,
      height: 1024,
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
      referenceImages: [
        {
          id: "missing-ref",
          url: "",
          type: "content",
          sourceAssetId: "thread-asset-1",
        },
        {
          id: "usable-ref",
          url: "data:image/png;base64,AAA",
          type: "content",
          sourceAssetId: "thread-asset-2",
        },
      ],
      assetRefs: [
        { assetId: "thread-asset-1", role: "reference" },
        { assetId: "thread-asset-2", role: "reference" },
        { assetId: "thread-asset-edit", role: "edit" },
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

    expect(resolved.warnings).toEqual([RETRY_REFERENCE_IMAGES_OMITTED_WARNING]);
    expect(resolved.config.referenceImages).toEqual([
      expect.objectContaining({
        id: "usable-ref",
        url: "data:image/png;base64,AAA",
        sourceAssetId: "thread-asset-2",
      }),
    ]);
    expect(resolved.config.assetRefs).toEqual([
      { assetId: "thread-asset-2", role: "reference" },
      { assetId: "thread-asset-edit", role: "edit" },
    ]);
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
    const summary: PromptObservabilitySummaryResponse = {
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
