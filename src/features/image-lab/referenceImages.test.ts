import { describe, expect, it } from "vitest";
import type { GenerationConfig } from "@/stores/generationConfigStore";
import type { ReferenceImage } from "@/types/imageGeneration";
import {
  bindResultAssetToConfig,
  bindResultReferenceToConfig,
  clearBoundResultReferencesFromConfig,
  clearReferenceInputsForUnsupportedModel,
  removeBoundResultReferenceFromConfig,
  updateAssetRefRoleInConfig,
} from "./referenceImages";

const createConfig = (): GenerationConfig => ({
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
    expect(nextConfig.assetRefs).toEqual([{ assetId: "thread-asset-1", role: "reference" }]);
  });

  it("binds edit and variation roles without materializing reference images when native refs are unavailable", () => {
    const editBinding = bindResultAssetToConfig(createConfig(), {
      assetId: "thread-asset-1",
      role: "edit",
      includeReferenceImage: false,
      referenceImage: createReferenceImage("ref-1"),
    });
    const variationBinding = bindResultAssetToConfig(createConfig(), {
      assetId: "thread-asset-2",
      role: "variation",
      includeReferenceImage: false,
      referenceImage: createReferenceImage("ref-2"),
    });

    expect(editBinding.error).toBeNull();
    expect(editBinding.nextConfig.referenceImages).toEqual([]);
    expect(editBinding.nextConfig.assetRefs).toEqual([
      { assetId: "thread-asset-1", role: "edit" },
    ]);
    expect(variationBinding.error).toBeNull();
    expect(variationBinding.nextConfig.referenceImages).toEqual([]);
    expect(variationBinding.nextConfig.assetRefs).toEqual([
      { assetId: "thread-asset-2", role: "variation" },
    ]);
  });

  it("rejects multiple source asset roles in the same turn", () => {
    const firstBinding = bindResultAssetToConfig(createConfig(), {
      assetId: "thread-asset-1",
      role: "edit",
      includeReferenceImage: false,
      referenceImage: createReferenceImage("ref-1"),
    });
    const nextBinding = bindResultAssetToConfig(firstBinding.nextConfig, {
      assetId: "thread-asset-2",
      role: "variation",
      includeReferenceImage: false,
      referenceImage: createReferenceImage("ref-2"),
    });

    expect(firstBinding.error).toBeNull();
    expect(nextBinding.error).toContain("Only one source asset is allowed");
    expect(nextBinding.nextConfig.assetRefs).toEqual([
      { assetId: "thread-asset-1", role: "edit" },
    ]);
  });

  it("updates an existing asset ref role while preserving the bound reference image when available", () => {
    const baseConfig = bindResultReferenceToConfig(createConfig(), {
      assetId: "thread-asset-1",
      referenceImage: createReferenceImage("ref-1"),
    });

    const nextBinding = updateAssetRefRoleInConfig(baseConfig, {
      assetId: "thread-asset-1",
      role: "variation",
      includeReferenceImage: true,
    });

    expect(nextBinding.error).toBeNull();
    expect(nextBinding.nextConfig.assetRefs).toEqual([
      { assetId: "thread-asset-1", role: "variation" },
    ]);
    expect(nextBinding.nextConfig.referenceImages).toEqual([
      expect.objectContaining({
        id: "ref-1",
        sourceAssetId: "thread-asset-1",
      }),
    ]);
  });
});
