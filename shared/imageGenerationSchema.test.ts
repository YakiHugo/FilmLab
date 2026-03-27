import { describe, expect, it } from "vitest";
import { imageGenerationRequestSchema } from "./imageGenerationSchema";

const basePayload = {
  prompt: "A cinematic night street scene",
  modelId: "seedream-v5" as const,
  aspectRatio: "1:1" as const,
  style: "none" as const,
  batchSize: 1,
  modelParams: {},
};

const getIssuePaths = (payload: Record<string, unknown>) => {
  const result = imageGenerationRequestSchema.safeParse({
    ...basePayload,
    ...payload,
  });

  expect(result.success).toBe(false);
  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => issue.path.join("."));
};

describe("imageGenerationRequestSchema", () => {
  it("accepts platform model ids without provider input", () => {
    const result = imageGenerationRequestSchema.safeParse({
      ...basePayload,
      modelId: "qwen-image-2-pro",
      aspectRatio: "16:9",
      style: "cinematic",
      negativePrompt: "avoid blur",
      seed: 42,
      modelParams: {
        promptExtend: true,
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown platform model ids", () => {
    const issuePaths = getIssuePaths({
      modelId: "unknown-model",
    });

    expect(issuePaths).toContain("modelId");
  });

  it("requires width and height together when a custom size is supplied", () => {
    const issuePaths = getIssuePaths({
      width: 1536,
    });

    expect(issuePaths).toContain("width");
  });

  it("requires width and height when aspect ratio is custom", () => {
    const issuePaths = getIssuePaths({
      aspectRatio: "custom",
    });

    expect(issuePaths).toContain("width");
  });

  it("rejects width and height that do not match the selected aspect ratio", () => {
    const issuePaths = getIssuePaths({
      modelId: "qwen-image-2-pro",
      aspectRatio: "16:9",
      width: 1024,
      height: 1024,
    });

    expect(issuePaths).toContain("width");
  });

  it("validates model param options against the selected platform model", () => {
    const issuePaths = getIssuePaths({
      modelParams: {
        responseFormat: "png",
      },
    });

    expect(issuePaths).toContain("modelParams.responseFormat");
  });

  it("accepts custom size requests for models that will be validated server-side", () => {
    const result = imageGenerationRequestSchema.safeParse({
      ...basePayload,
      modelId: "qwen-image-2-pro",
      aspectRatio: "custom",
      width: 1536,
      height: 1024,
      modelParams: {
        promptExtend: true,
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects generate requests with source input assets", () => {
    const issuePaths = getIssuePaths({
      inputAssets: [{ assetId: "asset-source-1", binding: "source" }],
    });

    expect(issuePaths).toContain("inputAssets");
  });

  it("accepts legacy assetRefs and referenceImages by mapping them into the new input model", () => {
    const result = imageGenerationRequestSchema.safeParse({
      ...basePayload,
      referenceImages: [
        {
          sourceAssetId: "asset-guide-1",
          type: "style",
          weight: 0.4,
        },
      ],
      assetRefs: [
        { assetId: "asset-edit-1", role: "edit" },
        { assetId: "asset-guide-1", role: "reference" },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.operation).toBe("edit");
    expect(result.data.inputAssets).toEqual([
      { assetId: "asset-edit-1", binding: "source" },
      {
        assetId: "asset-guide-1",
        binding: "guide",
        guideType: "style",
        weight: 0.4,
      },
    ]);
  });
});
