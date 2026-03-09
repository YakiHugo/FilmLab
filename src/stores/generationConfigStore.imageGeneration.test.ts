import { describe, expect, it } from "vitest";
import { getDefaultImageModelParams } from "@/lib/ai/imageModelParams";
import type { ReferenceImage } from "@/types/imageGeneration";
import type { GenerationConfig } from "./generationConfigStore";
import { sanitizeGenerationConfig } from "./generationConfigStore";

const createConfig = (patch: Partial<GenerationConfig> = {}): GenerationConfig => ({
  provider: "flux",
  model: "flux-pro",
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
  modelParams: getDefaultImageModelParams("flux", "flux-pro"),
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
        provider: "openai",
        model: "gpt-image-1",
        aspectRatio: "16:9",
        width: 1536,
        height: 864,
        negativePrompt: "avoid blur",
        referenceImages,
        seed: 42,
        guidanceScale: 12,
        steps: 35,
        modelParams: getDefaultImageModelParams("openai", "gpt-image-1"),
      })
    );

    expect(sanitized.width).toBeNull();
    expect(sanitized.height).toBeNull();
    expect(sanitized.negativePrompt).toBe("");
    expect(sanitized.referenceImages).toEqual([]);
    expect(sanitized.seed).toBeNull();
    expect(sanitized.guidanceScale).toBeNull();
    expect(sanitized.steps).toBeNull();
  });

  it("clamps Flux custom-size requests locally before request validation", () => {
    const sanitized = sanitizeGenerationConfig(
      createConfig({
        width: 50_000,
        height: 64,
        seed: -9,
        guidanceScale: 99,
        steps: 200,
        batchSize: 9,
        modelParams: {
          ...getDefaultImageModelParams("flux", "flux-pro"),
          safetyTolerance: 99,
        },
      })
    );

    expect(sanitized.width).toBe(4096);
    expect(sanitized.height).toBe(256);
    expect(sanitized.seed).toBe(0);
    expect(sanitized.guidanceScale).toBe(20);
    expect(sanitized.steps).toBe(80);
    expect(sanitized.batchSize).toBe(4);
    expect(sanitized.modelParams.safetyTolerance).toBe(6);
  });

  it("fills in the model default steps when the provider supports custom step counts", () => {
    const sanitized = sanitizeGenerationConfig(
      createConfig({
        provider: "stability",
        model: "stable-image-core",
        aspectRatio: "1:1",
        width: 1024,
        height: 1024,
        steps: null,
        modelParams: getDefaultImageModelParams("stability", "stable-image-core"),
      })
    );

    expect(sanitized.steps).toBe(30);
    expect(sanitized.width).toBeNull();
    expect(sanitized.height).toBeNull();
  });

  it("normalizes Ideogram reference capabilities in store state", () => {
    const sanitized = sanitizeGenerationConfig(
      createConfig({
        provider: "ideogram",
        model: "ideogram-3",
        referenceImages: [
          {
            id: "ref-1",
            url: "data:image/png;base64,abc",
            type: "controlnet",
            weight: 0.3,
          },
        ],
        modelParams: getDefaultImageModelParams("ideogram", "ideogram-3"),
      })
    );

    expect(sanitized.referenceImages).toHaveLength(1);
    expect(sanitized.referenceImages[0]?.type).toBe("style");
    expect(sanitized.referenceImages[0]?.weight).toBe(1);
  });

  it("falls back legacy Seedream selections to the 5.0 MVP config", () => {
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
