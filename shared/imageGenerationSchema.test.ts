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

  it("accepts Seedream 5.0 prompt generation with supported aspect ratios", () => {
    const result = imageGenerationRequestSchema.safeParse({
      ...basePayload,
      provider: "seedream",
      model: "doubao-seedream-5-0-260128",
      aspectRatio: "16:9",
      style: "cinematic",
      modelParams: {},
    });

    expect(result.success).toBe(true);
  });

  it("accepts additional Ark hosted models under Seedream", () => {
    const result = imageGenerationRequestSchema.safeParse({
      ...basePayload,
      provider: "seedream",
      model: "qwen-image-2512",
      aspectRatio: "1:1",
      style: "cinematic",
      modelParams: {},
    });

    expect(result.success).toBe(true);
  });

  it("validates Seedream model params options", () => {
    const issuePaths = getIssuePaths({
      provider: "seedream",
      model: "qwen-image-2512",
      modelParams: {
        responseFormat: "png",
      },
    });

    expect(issuePaths).toContain("modelParams.responseFormat");
  });

  it("rejects Seedream controls disabled by the 5.0 MVP", () => {
    const issuePaths = getIssuePaths({
      provider: "seedream",
      model: "doubao-seedream-5-0-260128",
      aspectRatio: "custom",
      width: 1344,
      height: 768,
      negativePrompt: "avoid blur",
      seed: 42,
      guidanceScale: 4.5,
      steps: 25,
      batchSize: 2,
      referenceImages: [
        {
          url: "data:image/png;base64,abc",
          type: "content",
        },
      ],
    });

    expect(issuePaths).toContain("aspectRatio");
    expect(issuePaths).toContain("width");
    expect(issuePaths).toContain("negativePrompt");
    expect(issuePaths).toContain("seed");
    expect(issuePaths).toContain("guidanceScale");
    expect(issuePaths).toContain("steps");
    expect(issuePaths).toContain("batchSize");
    expect(issuePaths).toContain("referenceImages");
  });
});
