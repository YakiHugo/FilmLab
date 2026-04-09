import { describe, expect, it } from "vitest";
import type { FrontendImageModelId } from "../../shared/imageModelCatalog";
import { getImageModelCapabilityFactByModelId } from "../../shared/imageModelCapabilityFacts";
import { getDefaultImageModelParams, getImageModelParamDefinitions } from "@/lib/ai/imageModelParams";
import type { ImageModelCatalogEntry } from "@/lib/ai/imageModelCatalog";
import type { GenerationConfig } from "./generationConfigStore";
import { sanitizeGenerationConfig } from "./generationConfigStore";

const createModelFixture = (
  id: FrontendImageModelId,
  overrides: Partial<ImageModelCatalogEntry>
): ImageModelCatalogEntry => {
  const fact = getImageModelCapabilityFactByModelId(id);
  if (!fact) {
    throw new Error(`Missing capability fact for ${id}.`);
  }

  return {
    id,
    label: id,
    logicalModel: fact.logicalModel,
    modelFamily: fact.modelFamily,
    capability: "image.generate",
    visible: true,
    description: `${id} fixture`,
    constraints: fact.constraints,
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
    promptCompiler: fact.promptCompiler,
    supportsUpscale: false,
    defaultProvider: "ark",
    deploymentId: "fixture-deployment",
    providerModel: "fixture-model",
    configured: true,
    health: {
      state: "healthy",
      score: 1,
      successRate: 1,
      averageLatencyMs: 100 as number | null,
      sampleSize: 1,
      circuitOpen: false,
      lastErrorType: null,
      updatedAt: "2026-03-11T00:00:00.000Z",
    },
    ...overrides,
  };
};

const seedreamModel = createModelFixture("seedream-v5", {
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
  constraints: {
    supportsCustomSize: true,
    supportedAspectRatios: ["1:1", "16:9", "9:16", "custom"],
    maxBatchSize: 6,
    referenceImages: {
      enabled: true,
      maxImages: 3,
      supportedTypes: ["content"],
      supportsWeight: false,
    },
    unsupportedFields: ["guidanceScale", "steps"],
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
  promptIntent: {
    preserve: [],
    avoid: [],
    styleDirectives: [],
    continuityTargets: [],
    editOps: [],
  },
  operation: "generate",
  inputAssets: [],
  seed: null,
  guidanceScale: null,
  steps: null,
  sampler: "",
  batchSize: 1,
  modelParams: getDefaultImageModelParams(modelId),
  ...patch,
});

describe("sanitizeGenerationConfig", () => {
  it("drops unsupported explicit sizes and controls while preserving asset handles for compiler fallback", () => {
    const sanitized = sanitizeGenerationConfig(
      createConfig("seedream-v5", {
        aspectRatio: "16:9",
        width: 1536,
        height: 864,
        negativePrompt: "avoid blur",
        operation: "edit",
        inputAssets: [
          { assetId: "asset-source-1", binding: "source" },
          {
            assetId: "asset-guide-1",
            binding: "guide",
            guideType: "style",
            weight: 0.25,
          },
        ],
        seed: 42,
        guidanceScale: 12,
        steps: 35,
      }),
      seedreamModel
    );

    expect(sanitized.width).toBeNull();
    expect(sanitized.height).toBeNull();
    expect(sanitized.negativePrompt).toBe("");
    expect(sanitized.operation).toBe("edit");
    expect(sanitized.inputAssets).toEqual([
      { assetId: "asset-source-1", binding: "source" },
      {
        assetId: "asset-guide-1",
        binding: "guide",
        guideType: "style",
        weight: 0.25,
      },
    ]);
    expect(sanitized.seed).toBeNull();
    expect(sanitized.guidanceScale).toBeNull();
    expect(sanitized.steps).toBeNull();
  });

  it("clamps custom-size requests and batch size within catalog bounds", () => {
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

  it("caps guide assets and normalizes unsupported types and weights for native reference models", () => {
    const sanitized = sanitizeGenerationConfig(
      createConfig("qwen-image-2-pro", {
        inputAssets: [
          {
            assetId: "asset-guide-1",
            binding: "guide",
            guideType: "style",
            weight: 0.25,
          },
          {
            assetId: "asset-guide-2",
            binding: "guide",
            guideType: "content",
            weight: 0.4,
          },
          {
            assetId: "asset-guide-3",
            binding: "guide",
            guideType: "controlnet",
            weight: 0.9,
          },
          {
            assetId: "asset-guide-4",
            binding: "guide",
            guideType: "content",
            weight: 0.1,
          },
        ],
      }),
      qwenModel
    );

    expect(sanitized.inputAssets).toEqual([
      {
        assetId: "asset-guide-1",
        binding: "guide",
        guideType: "content",
        weight: 1,
      },
      {
        assetId: "asset-guide-2",
        binding: "guide",
        guideType: "content",
        weight: 1,
      },
      {
        assetId: "asset-guide-3",
        binding: "guide",
        guideType: "content",
        weight: 1,
      },
    ]);
  });

  it("dedupes source and guide bindings by asset id with source taking precedence", () => {
    const sanitized = sanitizeGenerationConfig(
      createConfig("qwen-image-2-pro", {
        operation: "variation",
        inputAssets: [
          {
            assetId: "asset-1",
            binding: "guide",
            guideType: "content",
            weight: 0.5,
          },
          { assetId: "asset-1", binding: "source" },
          { assetId: "asset-2", binding: "source" },
        ],
      }),
      qwenModel
    );

    expect(sanitized.inputAssets).toEqual([
      { assetId: "asset-1", binding: "source" },
      { assetId: "asset-2", binding: "source" },
    ]);
  });
});
