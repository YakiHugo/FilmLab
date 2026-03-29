import { describe, expect, it } from "vitest";
import type { GenerationConfig } from "@/stores/generationConfigStore";
import {
  bindGuideAssetToConfig,
  clearGuideAssetsFromConfig,
  clearSourceAssetFromConfig,
  removeGuideAssetFromConfig,
  removeInputAssetFromConfig,
  setSourceAssetInConfig,
  updateGuideAssetInConfig,
} from "./referenceImages";

const createConfig = (patch: Partial<GenerationConfig> = {}): GenerationConfig => ({
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
  operation: "generate",
  inputAssets: [],
  seed: null,
  guidanceScale: null,
  steps: null,
  sampler: "",
  batchSize: 1,
  modelParams: {},
  ...patch,
});

describe("image input config helpers", () => {
  it("binds a guide asset with default metadata", () => {
    const nextConfig = bindGuideAssetToConfig(createConfig(), {
      assetId: "asset-guide-1",
    });

    expect(nextConfig.operation).toBe("generate");
    expect(nextConfig.inputAssets).toEqual([
      {
        assetId: "asset-guide-1",
        binding: "guide",
        guideType: "content",
        weight: 1,
      },
    ]);
  });

  it("switches a source asset back to guide mode and resets the operation when no source remains", () => {
    const nextConfig = bindGuideAssetToConfig(
      createConfig({
        operation: "edit",
        inputAssets: [{ assetId: "asset-source-1", binding: "source" }],
      }),
      {
        assetId: "asset-source-1",
        guideType: "style",
        weight: 0.4,
      }
    );

    expect(nextConfig.operation).toBe("generate");
    expect(nextConfig.inputAssets).toEqual([
      {
        assetId: "asset-source-1",
        binding: "guide",
        guideType: "style",
        weight: 0.4,
      },
    ]);
  });

  it("sets a single source asset and preserves guide bindings", () => {
    const nextConfig = setSourceAssetInConfig(
      createConfig({
        inputAssets: [
          {
            assetId: "asset-guide-1",
            binding: "guide",
            guideType: "content",
            weight: 0.8,
          },
        ],
      }),
      {
        assetId: "asset-source-1",
        operation: "variation",
      }
    );

    expect(nextConfig.operation).toBe("variation");
    expect(nextConfig.inputAssets).toEqual([
      { assetId: "asset-source-1", binding: "source" },
      {
        assetId: "asset-guide-1",
        binding: "guide",
        guideType: "content",
        weight: 0.8,
      },
    ]);
  });

  it("updates guide metadata in place", () => {
    const nextConfig = updateGuideAssetInConfig(
      createConfig({
        inputAssets: [
          {
            assetId: "asset-guide-1",
            binding: "guide",
            guideType: "content",
            weight: 0.8,
          },
        ],
      }),
      "asset-guide-1",
      {
        guideType: "style",
        weight: 0.25,
      }
    );

    expect(nextConfig.inputAssets).toEqual([
      {
        assetId: "asset-guide-1",
        binding: "guide",
        guideType: "style",
        weight: 0.25,
      },
    ]);
  });

  it("clears only guide assets while preserving the source operation", () => {
    const nextConfig = clearGuideAssetsFromConfig(
      createConfig({
        operation: "edit",
        inputAssets: [
          { assetId: "asset-source-1", binding: "source" },
          {
            assetId: "asset-guide-1",
            binding: "guide",
            guideType: "content",
            weight: 0.8,
          },
        ],
      })
    );

    expect(nextConfig.operation).toBe("edit");
    expect(nextConfig.inputAssets).toEqual([{ assetId: "asset-source-1", binding: "source" }]);
  });

  it("removes a single guide asset without touching the source binding", () => {
    const nextConfig = removeGuideAssetFromConfig(
      createConfig({
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
      }),
      "asset-guide-1"
    );

    expect(nextConfig.operation).toBe("variation");
    expect(nextConfig.inputAssets).toEqual([{ assetId: "asset-source-1", binding: "source" }]);
  });

  it("clears the source asset and resets the operation while preserving guides", () => {
    const nextConfig = clearSourceAssetFromConfig(
      createConfig({
        operation: "edit",
        inputAssets: [
          { assetId: "asset-source-1", binding: "source" },
          {
            assetId: "asset-guide-1",
            binding: "guide",
            guideType: "content",
            weight: 0.8,
          },
        ],
      })
    );

    expect(nextConfig.operation).toBe("generate");
    expect(nextConfig.inputAssets).toEqual([
      {
        assetId: "asset-guide-1",
        binding: "guide",
        guideType: "content",
        weight: 0.8,
      },
    ]);
  });

  it("resets the operation when removing the last source asset", () => {
    const nextConfig = removeInputAssetFromConfig(
      createConfig({
        operation: "edit",
        inputAssets: [
          { assetId: "asset-source-1", binding: "source" },
          {
            assetId: "asset-guide-1",
            binding: "guide",
            guideType: "content",
            weight: 0.8,
          },
        ],
      }),
      "asset-source-1"
    );

    expect(nextConfig.operation).toBe("generate");
    expect(nextConfig.inputAssets).toEqual([
      {
        assetId: "asset-guide-1",
        binding: "guide",
        guideType: "content",
        weight: 0.8,
      },
    ]);
  });
});
