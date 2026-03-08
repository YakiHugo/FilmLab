import { describe, expect, it } from "vitest";
import { imageGenerationRequestSchema } from "./imageGenerationSchema";

const basePayload = {
  prompt: "A cinematic night street scene",
  provider: "openai" as const,
  model: "gpt-image-1",
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
  it("rejects models that do not belong to the selected provider", () => {
    const issuePaths = getIssuePaths({
      provider: "openai",
      model: "flux-pro",
    });

    expect(issuePaths).toContain("model");
  });

  it("rejects unsupported aspect ratios for the selected model", () => {
    const issuePaths = getIssuePaths({
      provider: "openai",
      model: "gpt-image-1",
      aspectRatio: "4:3",
    });

    expect(issuePaths).toContain("aspectRatio");
  });

  it("rejects unsupported Ideogram reference types and weights", () => {
    const issuePaths = getIssuePaths({
      provider: "ideogram",
      model: "ideogram-3",
      referenceImages: [
        {
          url: "data:image/png;base64,abc",
          type: "controlnet",
          weight: 0.4,
        },
      ],
    });

    expect(issuePaths).toContain("referenceImages.0.type");
    expect(issuePaths).toContain("referenceImages.0.weight");
  });

  it("rejects explicit dimensions for models without custom-size support", () => {
    const issuePaths = getIssuePaths({
      provider: "openai",
      model: "gpt-image-1",
      width: 1536,
      height: 1024,
    });

    expect(issuePaths).toContain("width");
  });

  it("rejects batch sizes above the model limit", () => {
    const issuePaths = getIssuePaths({
      provider: "openai",
      model: "dall-e-3",
      batchSize: 2,
    });

    expect(issuePaths).toContain("batchSize");
  });
});
