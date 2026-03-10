import { describe, expect, it } from "vitest";
import { getDefaultImageModelParams } from "@/lib/ai/imageModelParams";
import type { ReferenceImage } from "@/types/imageGeneration";
import type { GenerationConfig } from "./generationConfigStore";
import { sanitizeGenerationConfig } from "./generationConfigStore";

const createConfig = (patch: Partial<GenerationConfig> = {}): GenerationConfig => ({
  provider: "qwen",
  model: "qwen-image-2.0-pro",
  aspectRatio: "custom",
  width: 1024,
  height: 1024,
  style: "cinematic",
  stylePreset: "",
  negativePrompt: "",
  referenceImages: [],
  seed: null,
  guidanceScale: null,
  steps: null,
  sampler: "",
  batchSize: 1,
  modelParams: getDefaultImageModelParams("qwen", "qwen-image-2.0-pro"),
  ...patch,
});

describe("sanitizeGenerationConfig", () => {
  it("drops unsupported explicit sizes and controls for provider-managed models", () => {
    const referenceImages: ReferenceImage[] = [
      {
        id: "ref-1",
        url: "data:image/png;base64,abc",
        type: "content",
        weight: 0.25,
      },
    ];

    const sanitized = sanitizeGenerationConfig(
      createConfig({
        provider: "seedream",
        model: "doubao-seedream-5-0-260128",
        aspectRatio: "16:9",
        width: 1536,
        height: 864,
        negativePrompt: "avoid blur",
        referenceImages,
        seed: 42,
        guidanceScale: 12,
        steps: 35,
        modelParams: getDefaultImageModelParams("seedream", "doubao-seedream-5-0-260128"),
      })
    );

    expect(sanitized.width).toBeNull();
    expect(sanitized.height).toBeNull();
    expect(sanitized.negativePrompt).toBe("");
    expect(sanitized.referenceImages).toEqual([]);
    expect(sanitized.seed).toBeNull();
    expect(sanitized.guidanceScale).toBeNull();
    expect(sanitized.steps).toBeNull();
    expect(sanitized.batchSize).toBe(1);
  });

  it("clamps Qwen custom-size requests locally before request validation", () => {
    const sanitized = sanitizeGenerationConfig(
      createConfig({
        width: 50_000,
        height: 64,
        seed: -9,
        guidanceScale: 99,
        steps: 200,
        batchSize: 9,
        modelParams: {
          ...getDefaultImageModelParams("qwen", "qwen-image-2.0-pro"),
          promptExtend: "invalid" as never,
        },
      })
    );

    expect(sanitized.width).toBe(4096);
    expect(sanitized.height).toBe(256);
    expect(sanitized.seed).toBe(0);
    expect(sanitized.guidanceScale).toBeNull();
    expect(sanitized.steps).toBeNull();
    expect(sanitized.batchSize).toBe(6);
    expect(sanitized.modelParams.promptExtend).toBe(true);
  });

  it("drops unsupported negative prompts for Z Image and clamps batch size", () => {
    const sanitized = sanitizeGenerationConfig(
      createConfig({
        provider: "zimage",
        model: "z-image-turbo",
        negativePrompt: "avoid blur",
        seed: 99,
        batchSize: 4,
        modelParams: getDefaultImageModelParams("zimage", "z-image-turbo"),
      })
    );

    expect(sanitized.negativePrompt).toBe("");
    expect(sanitized.seed).toBe(99);
    expect(sanitized.batchSize).toBe(1);
  });

  it("keeps Kling widescreen aspect ratios but drops unsupported seed control", () => {
    const sanitized = sanitizeGenerationConfig(
      createConfig({
        provider: "kling",
        model: "kling-v3",
        aspectRatio: "21:9",
        width: 1536,
        height: 1024,
        negativePrompt: "avoid blur",
        seed: 123,
        batchSize: 12,
        modelParams: getDefaultImageModelParams("kling", "kling-v3"),
      })
    );

    expect(sanitized.aspectRatio).toBe("21:9");
    expect(sanitized.width).toBeNull();
    expect(sanitized.height).toBeNull();
    expect(sanitized.negativePrompt).toBe("avoid blur");
    expect(sanitized.seed).toBeNull();
    expect(sanitized.batchSize).toBe(9);
  });

  it("falls back legacy Seedream selections to the 5.0 current config", () => {
    const sanitized = sanitizeGenerationConfig(
      createConfig({
        provider: "seedream",
        model: "seedream-3.0",
        aspectRatio: "custom",
        width: 1536,
        height: 1024,
        negativePrompt: "avoid blur",
        referenceImages: [
          {
            id: "ref-1",
            url: "data:image/png;base64,abc",
            type: "content",
            weight: 0.5,
          },
        ],
        seed: 42,
        guidanceScale: 7,
        steps: 32,
        batchSize: 3,
        modelParams: {},
      })
    );

    expect(sanitized.model).toBe("doubao-seedream-5-0-260128");
    expect(sanitized.aspectRatio).toBe("1:1");
    expect(sanitized.width).toBeNull();
    expect(sanitized.height).toBeNull();
    expect(sanitized.negativePrompt).toBe("");
    expect(sanitized.referenceImages).toEqual([]);
    expect(sanitized.seed).toBeNull();
    expect(sanitized.guidanceScale).toBeNull();
    expect(sanitized.steps).toBeNull();
    expect(sanitized.batchSize).toBe(1);
    expect(sanitized.modelParams).toEqual({
      responseFormat: "url",
      sequentialImageGeneration: "disabled",
      watermark: true,
    });
  });
});
