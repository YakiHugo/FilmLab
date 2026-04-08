import { describe, expect, it } from "vitest";
import { getFrontendImageModelById } from "../models/frontendRegistry";
import {
  imageGenerationRequestSchema,
  validateImageGenerationRequestAgainstModel,
} from "./imageGenerationSchema";

const createCompatibilitySchema = (modelId: string) => {
  const frontendModel = getFrontendImageModelById(modelId);
  if (!frontendModel) {
    throw new Error(`Missing frontend model: ${modelId}`);
  }

  return imageGenerationRequestSchema.superRefine((payload, ctx) => {
    validateImageGenerationRequestAgainstModel(payload, frontendModel, ctx);
  });
};

describe("validateImageGenerationRequestAgainstModel", () => {
  it("reports guide issues against the original inputAssets index", () => {
    const result = createCompatibilitySchema("qwen-image-2-pro").safeParse({
      prompt: "Refine the poster",
      modelId: "qwen-image-2-pro",
      aspectRatio: "1:1",
      batchSize: 1,
      style: "none",
      operation: "edit",
      inputAssets: [
        { assetId: "asset-source-1", binding: "source" },
        { assetId: "asset-guide-1", binding: "guide", guideType: "style", weight: 1 },
      ],
      modelParams: {},
    });

    expect(result.success).toBe(false);
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["inputAssets", 1, "guideType"],
        }),
      ])
    );
  });

  it("rejects requests that exceed the model's executable input-image limit", () => {
    const result = createCompatibilitySchema("qwen-image-2-pro").safeParse({
      prompt: "Refine the poster",
      modelId: "qwen-image-2-pro",
      aspectRatio: "1:1",
      batchSize: 1,
      style: "none",
      operation: "edit",
      inputAssets: [
        { assetId: "asset-source-1", binding: "source" },
        { assetId: "asset-guide-1", binding: "guide", guideType: "content", weight: 1 },
        { assetId: "asset-guide-2", binding: "guide", guideType: "content", weight: 1 },
        { assetId: "asset-guide-3", binding: "guide", guideType: "content", weight: 1 },
      ],
      modelParams: {},
    });

    expect(result.success).toBe(false);
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["inputAssets"],
          message: "Qwen Image 2.0 Pro supports at most 3 executable input images.",
        }),
      ])
    );
  });
});
