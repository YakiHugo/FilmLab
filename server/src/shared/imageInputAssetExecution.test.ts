import { describe, expect, it } from "vitest";
import { getImageModelCapabilityFactByModelId } from "../../../shared/imageModelCapabilityFacts";
import { countModelExecutableInputAssets, projectInputAssetsForModelExecution } from "./imageInputAssetExecution";

describe("image input execution projection", () => {
  it("drops guide and source assets when the model compiles all image inputs to text", () => {
    const promptCompiler = getImageModelCapabilityFactByModelId("seedream-v5")!.promptCompiler;

    expect(
      projectInputAssetsForModelExecution({
        operation: "edit",
        inputAssets: [
          { assetId: "asset-source-1", binding: "source" },
          { assetId: "asset-guide-1", binding: "guide", guideType: "content", weight: 1 },
        ],
        promptCompiler,
      })
    ).toEqual([]);
  });

  it("downgrades source assets into guide bindings when the model is reference-guided", () => {
    const promptCompiler = getImageModelCapabilityFactByModelId("qwen-image-2-pro")!.promptCompiler;

    expect(
      projectInputAssetsForModelExecution({
        operation: "variation",
        inputAssets: [{ assetId: "asset-source-1", binding: "source" }],
        promptCompiler,
      })
    ).toEqual([
      {
        assetId: "asset-source-1",
        binding: "guide",
        guideType: "content",
      },
    ]);
  });

  it("counts total provider-executable input images after source-role projection", () => {
    const promptCompiler = getImageModelCapabilityFactByModelId("qwen-image-2-pro")!.promptCompiler;

    expect(
      countModelExecutableInputAssets({
        operation: "edit",
        inputAssets: [
          { assetId: "asset-source-1", binding: "source" },
          { assetId: "asset-guide-1", binding: "guide", guideType: "content", weight: 1 },
          { assetId: "asset-guide-2", binding: "guide", guideType: "content", weight: 1 },
          { assetId: "asset-guide-3", binding: "guide", guideType: "content", weight: 1 },
        ],
        promptCompiler,
      })
    ).toBe(4);
  });
});
