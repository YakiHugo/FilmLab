import { describe, expect, it } from "vitest";
import { imageGenerationRequestSchema } from "./imageGenerationSchema";

const basePayload = {
  prompt: "A cinematic night street scene",
  modelId: "seedream-v5" as const,
  aspectRatio: "1:1" as const,
  style: "none" as const,
  referenceImages: [],
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

  it("rejects multiple source asset roles in the same turn", () => {
    const issuePaths = getIssuePaths({
      assetRefs: [
        { assetId: "asset-edit-1", role: "edit" },
        { assetId: "asset-var-1", role: "variation" },
      ],
    });

    expect(issuePaths).toContain("assetRefs");
  });
});
