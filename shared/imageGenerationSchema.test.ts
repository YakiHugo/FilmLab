import { describe, expect, it } from "vitest";
import { imageGenerationRequestSchema } from "./imageGenerationSchema";

const basePayload = {
  prompt: "A cinematic night street scene",
  provider: "seedream" as const,
  model: "doubao-seedream-5-0-260128",
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
  it("accepts canonical runtime providers when the model resolves to a matching family", () => {
    const result = imageGenerationRequestSchema.safeParse({
      ...basePayload,
      provider: "dashscope",
      model: "qwen-image-2.0-pro",
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

  it("rejects models that do not belong to the selected provider", () => {
    const issuePaths = getIssuePaths({
      provider: "qwen",
      model: "z-image-turbo",
    });

    expect(issuePaths).toContain("model");
  });

  it("rejects unsupported aspect ratios for the selected model", () => {
    const issuePaths = getIssuePaths({
      provider: "ark",
      model: "doubao-seedream-5-0-260128",
      aspectRatio: "21:9",
    });

    expect(issuePaths).toContain("aspectRatio");
  });

  it("accepts reference images for models that do not support them", () => {
    const result = imageGenerationRequestSchema.safeParse({
      ...basePayload,
      provider: "qwen",
      model: "qwen-image-2.0-pro",
      referenceImages: [
        {
          url: "data:image/png;base64,abc",
          type: "content",
          weight: 0.4,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects explicit dimensions for models without custom-size support", () => {
    const issuePaths = getIssuePaths({
      provider: "seedream",
      model: "doubao-seedream-5-0-260128",
      width: 1536,
      height: 1024,
    });

    expect(issuePaths).toContain("width");
  });

  it("rejects batch sizes above the model limit", () => {
    const issuePaths = getIssuePaths({
      provider: "qwen",
      model: "qwen-image-2.0-pro",
      batchSize: 7,
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

  it("accepts Qwen custom-size generation with supported controls", () => {
    const result = imageGenerationRequestSchema.safeParse({
      ...basePayload,
      provider: "qwen",
      model: "qwen-image-2.0-pro",
      aspectRatio: "custom",
      width: 1536,
      height: 1024,
      style: "cinematic",
      negativePrompt: "avoid blur",
      seed: 42,
      batchSize: 2,
      modelParams: {
        promptExtend: true,
      },
    });

    expect(result.success).toBe(true);
  });

  it("validates Seedream model params options", () => {
    const issuePaths = getIssuePaths({
      provider: "seedream",
      model: "doubao-seedream-5-0-260128",
      modelParams: {
        responseFormat: "png",
      },
    });

    expect(issuePaths).toContain("modelParams.responseFormat");
  });

  it("rejects Seedream controls disabled by the current model capabilities", () => {
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
  });
});
