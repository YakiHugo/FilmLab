import { describe, expect, it } from "vitest";
import type { FrontendImageModelId } from "../../shared/imageModelCatalog";
import { getDefaultImageModelParams, getImageModelParamDefinitions } from "@/lib/ai/imageModelParams";
import type { ImageModelCatalogEntry } from "@/lib/ai/imageModelCatalog";
import type { ReferenceImage } from "@/types/imageGeneration";
import type { GenerationConfig } from "./generationConfigStore";
import { sanitizeGenerationConfig } from "./generationConfigStore";

const createModelFixture = (
  id: FrontendImageModelId,
  overrides: Partial<ImageModelCatalogEntry>
): ImageModelCatalogEntry => ({
  id,
  label: id,
  logicalModel: "image.seedream.v5",
  capability: "image.generate",
  visible: true,
  description: `${id} fixture`,
  constraints: {
    supportsCustomSize: false,
    supportedAspectRatios: ["1:1"],
    maxBatchSize: 1,
    referenceImages: {
      enabled: false,
      maxImages: 0,
      supportedTypes: [],
      supportsWeight: false,
    },
    unsupportedFields: [],
  },
  parameterDefinitions: getImageModelParamDefinitions(id),
  defaults: {
    aspectRatio: "1:1",
    width: null,
    height: null,
    batchSize: 1,
    negativePrompt: "",
    style: "none",
    stylePreset: "",
    seed: null,
    guidanceScale: null,
    steps: null,
    sampler: "",
    modelParams: getDefaultImageModelParams(id),
  },
  primaryProvider: "ark",
  deploymentId: "fixture-deployment",
  providerModel: "fixture-model",
  configured: true,
  health: {
    state: "healthy",
    score: 1,
    successRate: 1,
    latencyP95Ms: 100,
    sampleSize: 1,
    circuitOpen: false,
    lastErrorType: null,
    updatedAt: "2026-03-11T00:00:00.000Z",
  },
  ...overrides,
});

const seedreamModel = createModelFixture("seedream-v5", {
  logicalModel: "image.seedream.v5",
  deploymentId: "ark-seedream-v5-primary",
  providerModel: "doubao-seedream-5-0-260128",
  constraints: {
    supportsCustomSize: false,
    supportedAspectRatios: ["1:1", "16:9", "9:16"],
    maxBatchSize: 1,
    referenceImages: {
      enabled: false,
      maxImages: 0,
      supportedTypes: [],
      supportsWeight: false,
    },
    unsupportedFields: ["negativePrompt", "seed", "guidanceScale", "steps"],
  },
});

const qwenModel = createModelFixture("qwen-image-2-pro", {
  logicalModel: "image.qwen.v2.pro",
  primaryProvider: "dashscope",
  deploymentId: "dashscope-qwen-image-2-pro-primary",
  providerModel: "qwen-image-2.0-pro",
  constraints: {
    supportsCustomSize: true,
    supportedAspectRatios: ["1:1", "16:9", "9:16", "custom"],
    maxBatchSize: 6,
    referenceImages: {
      enabled: true,
      maxImages: 2,
      supportedTypes: ["content"],
      supportsWeight: false,
    },
    unsupportedFields: ["guidanceScale", "steps"],
  },
  defaults: {
    aspectRatio: "1:1",
    width: 1024,
    height: 1024,
    batchSize: 1,
    negativePrompt: "",
    style: "none",
    stylePreset: "",
    seed: null,
    guidanceScale: null,
    steps: null,
    sampler: "",
    modelParams: getDefaultImageModelParams("qwen-image-2-pro"),
  },
});

const zimageModel = createModelFixture("zimage-turbo", {
  logicalModel: "image.zimage.turbo",
  primaryProvider: "dashscope",
  deploymentId: "dashscope-zimage-turbo-primary",
  providerModel: "z-image-turbo",
  constraints: {
    supportsCustomSize: false,
    supportedAspectRatios: ["1:1", "16:9"],
    maxBatchSize: 1,
    referenceImages: {
      enabled: false,
      maxImages: 0,
      supportedTypes: [],
      supportsWeight: false,
    },
    unsupportedFields: ["negativePrompt"],
  },
});

const klingModel = createModelFixture("kling-v3", {
  logicalModel: "image.kling.v3",
  primaryProvider: "kling",
  deploymentId: "kling-kling-v3-primary",
  providerModel: "kling-v3",
  constraints: {
    supportsCustomSize: false,
    supportedAspectRatios: ["1:1", "16:9", "21:9"],
    maxBatchSize: 9,
    referenceImages: {
      enabled: false,
      maxImages: 0,
      supportedTypes: [],
      supportsWeight: false,
    },
    unsupportedFields: ["seed"],
  },
});

const createConfig = (
  modelId: FrontendImageModelId,
  patch: Partial<GenerationConfig> = {}
): GenerationConfig => ({
  modelId,
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
  modelParams: getDefaultImageModelParams(modelId),
  ...patch,
});

describe("sanitizeGenerationConfig", () => {
  it("drops unsupported explicit sizes and controls from catalog constraints", () => {
    const referenceImages: ReferenceImage[] = [
      {
        id: "ref-1",
        url: "data:image/png;base64,abc",
        type: "content",
        weight: 0.25,
      },
    ];

    const sanitized = sanitizeGenerationConfig(
      createConfig("seedream-v5", {
        aspectRatio: "16:9",
        width: 1536,
        height: 864,
        negativePrompt: "avoid blur",
        referenceImages,
        seed: 42,
        guidanceScale: 12,
        steps: 35,
      }),
      seedreamModel
    );

    expect(sanitized.modelId).toBe("seedream-v5");
    expect(sanitized.width).toBeNull();
    expect(sanitized.height).toBeNull();
    expect(sanitized.negativePrompt).toBe("");
    expect(sanitized.referenceImages).toEqual([]);
    expect(sanitized.seed).toBeNull();
    expect(sanitized.guidanceScale).toBeNull();
    expect(sanitized.steps).toBeNull();
    expect(sanitized.batchSize).toBe(1);
  });

  it("clamps custom-size requests while preserving explicit model param values for later validation", () => {
    const sanitized = sanitizeGenerationConfig(
      createConfig("qwen-image-2-pro", {
        width: 50_000,
        height: 64,
        seed: -9,
        guidanceScale: 99,
        steps: 200,
        batchSize: 9,
        modelParams: {
          ...getDefaultImageModelParams("qwen-image-2-pro"),
          promptExtend: "invalid" as never,
        },
      }),
      qwenModel
    );

    expect(sanitized.width).toBe(4096);
    expect(sanitized.height).toBe(256);
    expect(sanitized.seed).toBe(0);
    expect(sanitized.guidanceScale).toBeNull();
    expect(sanitized.steps).toBeNull();
    expect(sanitized.batchSize).toBe(6);
    expect(sanitized.modelParams.promptExtend).toBe("invalid");
  });

  it("drops unsupported negative prompts for zimage while preserving supported seed control", () => {
    const sanitized = sanitizeGenerationConfig(
      createConfig("zimage-turbo", {
        negativePrompt: "avoid blur",
        seed: 99,
        batchSize: 4,
      }),
      zimageModel
    );

    expect(sanitized.negativePrompt).toBe("");
    expect(sanitized.seed).toBe(99);
    expect(sanitized.batchSize).toBe(1);
  });

  it("keeps supported aspect ratios for kling but removes unsupported seed control", () => {
    const sanitized = sanitizeGenerationConfig(
      createConfig("kling-v3", {
        aspectRatio: "21:9",
        width: 1536,
        height: 1024,
        negativePrompt: "avoid blur",
        seed: 123,
        batchSize: 12,
      }),
      klingModel
    );

    expect(sanitized.aspectRatio).toBe("21:9");
    expect(sanitized.width).toBeNull();
    expect(sanitized.height).toBeNull();
    expect(sanitized.negativePrompt).toBe("avoid blur");
    expect(sanitized.seed).toBeNull();
    expect(sanitized.batchSize).toBe(9);
  });

  it("caps reference images and normalizes unsupported types and weights from the catalog", () => {
    const sanitized = sanitizeGenerationConfig(
      createConfig("qwen-image-2-pro", {
        referenceImages: [
          {
            id: "ref-1",
            url: "data:image/png;base64,1",
            type: "style",
            weight: 0.25,
          },
          {
            id: "ref-2",
            url: "data:image/png;base64,2",
            type: "content",
            weight: 0.4,
          },
          {
            id: "ref-3",
            url: "data:image/png;base64,3",
            type: "controlnet",
            weight: 0.9,
          },
        ],
      }),
      qwenModel
    );

    expect(sanitized.referenceImages).toHaveLength(2);
    expect(sanitized.referenceImages).toEqual([
      expect.objectContaining({ id: "ref-1", type: "content", weight: 1 }),
      expect.objectContaining({ id: "ref-2", type: "content", weight: 1 }),
    ]);
  });
});
