import { describe, expect, it } from "vitest";
import { getImageModelCatalog } from "../capabilities/registry";
import { getFrontendImageModelById } from "../models/frontendRegistry";
import {
  imageGenerationRequestSchema,
  validateImageGenerationRequestAgainstModel,
} from "./imageGenerationSchema";

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
      supportsUpscale: frontendModel?.supportsUpscale,
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
        referenceImages: [],
        negativePrompt: "avoid blur",
        seed: 42,
        guidanceScale: 11,
        steps: 30,
        batchSize: 2,
        modelParams: {
          promptExtend: true,
        },
      });

    expect(validationResult.success).toBe(false);
    if (validationResult.success) {
      return;
    }

    const issuePaths = validationResult.error.issues.map((issue) => issue.path.join("."));
    expect(issuePaths).toContain("guidanceScale");
    expect(issuePaths).toContain("steps");
  });
});
