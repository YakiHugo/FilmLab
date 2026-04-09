import { describe, expect, it } from "vitest";
import type { AppConfig } from "../config";
import { createImageModelCatalogRegistry } from "../capabilities/registry";
import { getFrontendImageModelById } from "../models/frontendRegistry";
import {
  imageGenerationRequestSchema,
  validateImageGenerationRequestAgainstModel,
} from "./imageGenerationSchema";

const testConfig = {
  arkApiKey: "test-key",
  arkApiBaseUrl: "https://ark.cn-beijing.volces.com",
  dashscopeApiKey: "test-key",
  dashscopeApiBaseUrl: "https://dashscope.aliyuncs.com",
  klingAccessKey: "test-key",
  klingSecretKey: "test-key",
  klingApiBaseUrl: "https://api-beijing.klingai.com",
} as AppConfig;

describe("image generation capability facts", () => {
  it("stay aligned across frontend model registry, catalog, and server validation", () => {
    const frontendModel = getFrontendImageModelById("qwen-image-2-pro");
    const registry = createImageModelCatalogRegistry(testConfig);
    const catalogModel = registry.getCatalog().models.find((model) => model.id === "qwen-image-2-pro");

    expect(frontendModel).not.toBeNull();
    expect(catalogModel).not.toBeUndefined();

    expect(catalogModel).toMatchObject({
      modelFamily: frontendModel?.modelFamily,
      constraints: frontendModel?.constraints,
      parameterDefinitions: frontendModel?.parameterDefinitions,
      defaults: frontendModel?.defaults,
      promptCompiler: frontendModel?.promptCompiler,
      supportsUpscale: frontendModel?.supportsUpscale,
    });
    expect(frontendModel?.constraints.referenceImages).toMatchObject({
      enabled: true,
      maxImages: 3,
      supportedTypes: ["content"],
      supportsWeight: false,
      maxFileSizeBytes: 10 * 1024 * 1024,
    });

    const validationResult = imageGenerationRequestSchema
      .superRefine((payload, ctx) => {
        if (!frontendModel) {
          return;
        }
        validateImageGenerationRequestAgainstModel(payload, frontendModel, ctx);
      })
      .safeParse({
        prompt: "Rainy alley",
        modelId: "qwen-image-2-pro",
        aspectRatio: "custom",
        width: 2048,
        height: 1024,
        style: "cinematic",
        negativePrompt: "avoid blur",
        seed: 42,
        guidanceScale: 11,
        steps: 30,
        batchSize: 2,
        modelParams: {
          promptExtend: true,
        },
        operation: "edit",
        inputAssets: [{ assetId: "thread-asset-1", binding: "source" }],
      });

    expect(validationResult.success).toBe(false);
    if (validationResult.success) {
      return;
    }

    const issuePaths = validationResult.error.issues.map((issue) => issue.path.join("."));
    expect(issuePaths).toContain("guidanceScale");
    expect(issuePaths).toContain("steps");
  });

  it("rejects weighted qwen reference assets during compatibility validation", () => {
    const frontendModel = getFrontendImageModelById("qwen-image-2-pro");
    expect(frontendModel).not.toBeNull();
    if (!frontendModel) {
      return;
    }

    const validationResult = imageGenerationRequestSchema
      .superRefine((payload, ctx) => {
        validateImageGenerationRequestAgainstModel(payload, frontendModel, ctx);
      })
      .safeParse({
        prompt: "Rainy alley",
        modelId: "qwen-image-2-pro",
        aspectRatio: "1:1",
        style: "none",
        inputAssets: [
          {
            assetId: "asset-ref-1",
            binding: "guide",
            guideType: "content",
            weight: 0.5,
          },
        ],
        batchSize: 1,
        modelParams: {
          promptExtend: true,
        },
      });

    expect(validationResult.success).toBe(false);
    if (validationResult.success) {
      return;
    }

    expect(validationResult.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["inputAssets", 0, "weight"],
        }),
      ])
    );
  });
});
