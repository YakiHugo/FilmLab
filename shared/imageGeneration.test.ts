import { describe, expect, it } from "vitest";
import {
  dedupeImageInputAssets,
  hasLegacyUnrestorableInputImages,
  resolveExactRetryNegativePrompt,
  resolveImagePromptCompilerOperation,
  resolveLegacyImageGenerationInputs,
  validateImageInputAssets,
} from "./imageGeneration";

describe("image input semantics", () => {
  it("derives the requested prompt compiler operation from explicit operation", () => {
    expect(resolveImagePromptCompilerOperation(undefined)).toBe("image.generate");
    expect(resolveImagePromptCompilerOperation("generate")).toBe("image.generate");
    expect(resolveImagePromptCompilerOperation("edit")).toBe("image.edit");
    expect(resolveImagePromptCompilerOperation("variation")).toBe("image.variation");
  });

  it("rejects invalid source binding combinations for the selected operation", () => {
    expect(
      validateImageInputAssets({
        operation: "generate",
        inputAssets: [{ assetId: "asset-source-1", binding: "source" }],
      })
    ).toEqual([
      expect.objectContaining({
        path: ["inputAssets"],
        message: expect.stringContaining("Generate requests do not accept source assets"),
      }),
    ]);

    expect(
      validateImageInputAssets({
        operation: "edit",
        inputAssets: [{ assetId: "asset-guide-1", binding: "guide" }],
      })
    ).toEqual([
      expect.objectContaining({
        path: ["inputAssets"],
        message: expect.stringContaining("edit requests require exactly one source asset"),
      }),
    ]);
  });

  it("rejects guide-only metadata on source bindings", () => {
    expect(
      validateImageInputAssets({
        operation: "edit",
        inputAssets: [
          {
            assetId: "asset-source-1",
            binding: "source",
            guideType: "style",
            weight: 0.5,
          },
        ],
      })
    ).toEqual([
      expect.objectContaining({
        path: ["inputAssets", 0, "guideType"],
      }),
      expect.objectContaining({
        path: ["inputAssets", 0, "weight"],
      }),
    ]);
  });

  it("dedupes repeated asset bindings by asset id with source precedence", () => {
    expect(
      dedupeImageInputAssets([
        { assetId: "asset-1", binding: "guide", guideType: "style", weight: 0.8 },
        { assetId: "asset-1", binding: "source" },
        { assetId: "asset-2", binding: "guide", guideType: "content" },
      ])
    ).toEqual([
      { assetId: "asset-1", binding: "source" },
      { assetId: "asset-2", binding: "guide", guideType: "content" },
    ]);
  });

  it("maps legacy asset refs and reference images into operation + inputAssets", () => {
    expect(
      resolveLegacyImageGenerationInputs({
        assetRefs: [
          { assetId: "asset-edit-1", role: "edit" },
          { assetId: "asset-guide-1", role: "reference" },
        ],
        referenceImages: [
          {
            sourceAssetId: "asset-guide-1",
            type: "style",
            weight: 0.3,
          },
        ],
      })
    ).toEqual({
      operation: "edit",
      inputAssets: [
        { assetId: "asset-edit-1", binding: "source" },
        {
          assetId: "asset-guide-1",
          binding: "guide",
          guideType: "style",
          weight: 0.3,
        },
      ],
    });
  });

  it("falls back to legacy image inputs when explicit inputAssets is an empty compatibility placeholder", () => {
    expect(
      resolveLegacyImageGenerationInputs({
        inputAssets: [],
        assetRefs: [{ assetId: "asset-edit-1", role: "edit" }],
        referenceImages: [
          {
            sourceAssetId: "asset-guide-1",
            type: "style",
            weight: 0.3,
          },
        ],
      })
    ).toEqual({
      operation: "edit",
      inputAssets: [
        { assetId: "asset-edit-1", binding: "source" },
        {
          assetId: "asset-guide-1",
          binding: "guide",
          guideType: "style",
          weight: 0.3,
        },
      ],
    });
  });

  it("merges mixed-format snapshots instead of discarding legacy-only bindings", () => {
    expect(
      resolveLegacyImageGenerationInputs({
        operation: "generate",
        inputAssets: [{ assetId: "asset-guide-new", binding: "guide", guideType: "style" }],
        assetRefs: [
          { assetId: "asset-guide-legacy", role: "reference", referenceType: "content", weight: 0.4 },
          { assetId: "asset-source-legacy", role: "variation" },
        ],
      })
    ).toEqual({
      operation: "variation",
      inputAssets: [
        { assetId: "asset-guide-new", binding: "guide", guideType: "style" },
        {
          assetId: "asset-guide-legacy",
          binding: "guide",
          guideType: "content",
          weight: 0.4,
        },
        { assetId: "asset-source-legacy", binding: "source" },
      ],
    });
  });

  it("detects legacy URL-only inputs that cannot be restored", () => {
    expect(
      hasLegacyUnrestorableInputImages([
        {
          url: "https://cdn.example.com/legacy.png",
          fileName: "legacy.png",
        },
      ])
    ).toBe(true);
    expect(
      hasLegacyUnrestorableInputImages([
        {
          url: "https://cdn.example.com/rehydrated.png",
          sourceAssetId: "asset-1",
        },
      ])
    ).toBe(false);
  });

  it("preserves the historical negative-prompt channel for exact retries", () => {
    expect(
      resolveExactRetryNegativePrompt({
        negativePrompt: "avoid blur",
        semanticLosses: [],
      })
    ).toBe("avoid blur");

    expect(
      resolveExactRetryNegativePrompt({
        negativePrompt: "avoid blur",
        semanticLosses: [{ code: "NEGATIVE_PROMPT_DEGRADED_TO_TEXT" }],
      })
    ).toBeUndefined();
  });
});
