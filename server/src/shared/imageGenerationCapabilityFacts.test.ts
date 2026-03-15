import { describe, expect, it } from "vitest";
import { getImageModelCatalog } from "../capabilities/registry";
import { getFrontendImageModelById } from "../models/frontendRegistry";
import {
  imageGenerationRequestSchema,
  validateImageGenerationRequestAgainstModel,
} from "./imageGenerationSchema";

const createDataUrl = (byteLength: number) =>
  `data:image/png;base64,${Buffer.alloc(byteLength, 1).toString("base64")}`;

describe("image generation capability facts", () => {
  it("stay aligned across frontend model registry, catalog, and server validation", () => {
    const frontendModel = getFrontendImageModelById("qwen-image-2-pro");
    const catalogModel = getImageModelCatalog().models.find((model) => model.id === "qwen-image-2-pro");

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
        referenceImages: [
          {
            id: "ref-1",
            url: createDataUrl(1024),
            type: "content",
          },
        ],
        negativePrompt: "avoid blur",
        seed: 42,
        guidanceScale: 11,
        steps: 30,
        batchSize: 2,
        modelParams: {
          promptExtend: true,
        },
        assetRefs: [{ assetId: "thread-asset-1", role: "edit" }],
      });

    expect(validationResult.success).toBe(false);
    if (validationResult.success) {
      return;
    }

    const issuePaths = validationResult.error.issues.map((issue) => issue.path.join("."));
    expect(issuePaths).toContain("guidanceScale");
    expect(issuePaths).toContain("steps");
  });

  it("rejects oversized qwen reference images during compatibility validation", () => {
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
        referenceImages: [
          {
            id: "ref-oversized",
            url: createDataUrl(10 * 1024 * 1024 + 1),
            type: "content",
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
          path: ["referenceImages", 0, "url"],
        }),
      ])
    );
  });
});
