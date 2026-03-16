import { describe, expect, it } from "vitest";
import {
  RETRY_REFERENCE_IMAGES_OMITTED_WARNING,
  omitUnavailableReferenceImages,
  resolveRetryRequestSnapshot,
  shouldFetchPromptArtifacts,
  toPersistedRequestSnapshot,
} from "./useImageGeneration";

describe("image generation request snapshots", () => {
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
});
