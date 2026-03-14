import { describe, expect, it } from "vitest";
import { getImageModelCapabilityFactByModelId } from "../../../shared/imageModelCapabilityFacts";
import type { ImageModelCatalogEntry } from "./imageModelCatalog";
import { sanitizeGenerationConfigWithCatalog, toCatalogFeatureSupport } from "./imageModelCatalog";

const createCatalogModelFixture = (
  modelId: Parameters<typeof getImageModelCapabilityFactByModelId>[0]
): ImageModelCatalogEntry => {
  const fact = getImageModelCapabilityFactByModelId(modelId);
  if (!fact) {
    throw new Error(`Missing capability fact for ${modelId}.`);
  }

  return {
    id: fact.modelId,
    label: fact.modelId,
    logicalModel: fact.logicalModel,
    modelFamily: fact.modelFamily,
    capability: "image.generate",
    visible: true,
    description: `${fact.modelId} fixture`,
    constraints: fact.constraints,
    parameterDefinitions: fact.parameterDefinitions,
    defaults: fact.defaults,
    supportsUpscale: fact.supportsUpscale,
    defaultProvider: fact.modelFamily === "seedream" ? "ark" : fact.modelFamily === "kling" ? "kling" : "dashscope",
    deploymentId: `${fact.modelId}-fixture`,
    providerModel: `${fact.modelId}-model`,
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
  };
};

describe("image model catalog capability facts", () => {
  it("drive frontend feature support and sanitize decisions from catalog entries", () => {
    const model = createCatalogModelFixture("qwen-image-2-pro");
    const featureSupport = toCatalogFeatureSupport(model);

    expect(featureSupport.supportsUpscale).toBe(false);
    expect(featureSupport.guidanceScale).toBe(false);
    expect(featureSupport.steps).toBe(false);
    expect(featureSupport.seed).toBe(true);

    const sanitized = sanitizeGenerationConfigWithCatalog(
      {
        modelId: model.id,
        aspectRatio: "custom",
        width: 2048,
        height: 1024,
        style: "cinematic",
        stylePreset: "",
        negativePrompt: "avoid blur",
        referenceImages: [],
        assetRefs: [],
        seed: 42,
        guidanceScale: 11,
        steps: 30,
        sampler: "",
        batchSize: 2,
        modelParams: {
          promptExtend: true,
        },
      },
      model
    );

    expect(sanitized.guidanceScale).toBeNull();
    expect(sanitized.steps).toBeNull();
    expect(sanitized.seed).toBe(42);
    expect(sanitized.width).toBe(2048);
    expect(sanitized.height).toBe(1024);
  });
});
