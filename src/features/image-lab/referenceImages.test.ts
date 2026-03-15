import { describe, expect, it } from "vitest";
import type { GenerationConfig } from "@/stores/generationConfigStore";
import type { ReferenceImage } from "@/types/imageGeneration";
import {
  bindResultReferenceToConfig,
  clearBoundResultReferencesFromConfig,
  clearReferenceInputsForUnsupportedModel,
  removeBoundResultReferenceFromConfig,
} from "./referenceImages";

const createConfig = (): GenerationConfig => ({
  modelId: "qwen-image-2-pro",
  aspectRatio: "1:1",
  width: 1024,
  height: 1024,
  style: "none",
  stylePreset: "",
  negativePrompt: "",
  referenceImages: [],
  assetRefs: [],
  seed: null,
  guidanceScale: null,
  steps: null,
  sampler: "",
  batchSize: 1,
  modelParams: {
    promptExtend: true,
  },
});

const createReferenceImage = (id: string): ReferenceImage => ({
  id,
  url: `data:image/png;base64,${id}`,
  type: "content",
  weight: 1,
});

describe("reference image config helpers", () => {
  it("binds a generated result as both a replayable reference image and an asset ref", () => {
    const nextConfig = bindResultReferenceToConfig(createConfig(), {
      assetId: "thread-asset-1",
      referenceImage: createReferenceImage("ref-1"),
    });

    expect(nextConfig.referenceImages).toEqual([
      expect.objectContaining({
        id: "ref-1",
        url: "data:image/png;base64,ref-1",
        sourceAssetId: "thread-asset-1",
      }),
    ]);
    expect(nextConfig.assetRefs).toEqual([{ assetId: "thread-asset-1", role: "reference" }]);
  });

  it("removes both the materialized reference image and asset ref together", () => {
    const boundConfig = bindResultReferenceToConfig(createConfig(), {
      assetId: "thread-asset-1",
      referenceImage: createReferenceImage("ref-1"),
    });

    const nextConfig = removeBoundResultReferenceFromConfig(boundConfig, "thread-asset-1");

    expect(nextConfig.referenceImages).toEqual([]);
    expect(nextConfig.assetRefs).toEqual([]);
  });

  it("clears only result-bound references while preserving uploaded refs", () => {
    const baseConfig = bindResultReferenceToConfig(createConfig(), {
      assetId: "thread-asset-1",
      referenceImage: createReferenceImage("ref-1"),
    });
    baseConfig.assetRefs.push({
      assetId: "manual-asset-1",
      role: "reference",
    });
    baseConfig.referenceImages.push({
      id: "upload-1",
      url: "data:image/png;base64,upload",
      type: "content",
      weight: 1,
    });

    const nextConfig = clearBoundResultReferencesFromConfig(baseConfig);

    expect(nextConfig.referenceImages).toEqual([
      expect.objectContaining({
        id: "upload-1",
        url: "data:image/png;base64,upload",
      }),
    ]);
    expect(nextConfig.assetRefs).toEqual([]);
  });

  it("drops all reference inputs when switching to an unsupported model", () => {
    const baseConfig = bindResultReferenceToConfig(createConfig(), {
      assetId: "thread-asset-1",
      referenceImage: createReferenceImage("ref-1"),
    });
    baseConfig.referenceImages.push({
      id: "upload-1",
      url: "data:image/png;base64,upload",
      type: "content",
      weight: 1,
    });

    const { nextConfig, removedReferenceImageCount } =
      clearReferenceInputsForUnsupportedModel(baseConfig);

    expect(removedReferenceImageCount).toBe(2);
    expect(nextConfig.referenceImages).toEqual([]);
    expect(nextConfig.assetRefs).toEqual([]);
  });
});
