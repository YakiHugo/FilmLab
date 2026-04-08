import { describe, expect, it } from "vitest";
import {
  dedupeImageInputAssets,
  resolveExactRetryNegativePrompt,
  resolveImagePromptCompilerOperation,
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
