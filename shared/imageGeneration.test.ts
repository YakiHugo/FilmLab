import { describe, expect, it } from "vitest";
import {
  resolveImagePromptCompilerOperation,
  validateImageAssetRefs,
} from "./imageGeneration";

describe("image asset ref semantics", () => {
  it("derives the requested prompt compiler operation from asset roles", () => {
    expect(resolveImagePromptCompilerOperation(undefined)).toBe("image.generate");
    expect(
      resolveImagePromptCompilerOperation([{ assetId: "asset-ref-1", role: "reference" }])
    ).toBe("image.generate");
    expect(
      resolveImagePromptCompilerOperation([{ assetId: "asset-edit-1", role: "edit" }])
    ).toBe("image.edit");
    expect(
      resolveImagePromptCompilerOperation([{ assetId: "asset-var-1", role: "variation" }])
    ).toBe("image.variation");
    expect(
      resolveImagePromptCompilerOperation([
        { assetId: "asset-var-1", role: "variation" },
        { assetId: "asset-edit-1", role: "edit" },
      ])
    ).toBe("image.edit");
  });

  it("rejects more than one source asset in a single turn", () => {
    expect(
      validateImageAssetRefs([
        { assetId: "asset-ref-1", role: "reference" },
        { assetId: "asset-edit-1", role: "edit" },
      ])
    ).toEqual([]);

    expect(
      validateImageAssetRefs([
        { assetId: "asset-edit-1", role: "edit" },
        { assetId: "asset-var-1", role: "variation" },
      ])
    ).toEqual([
      expect.objectContaining({
        path: ["assetRefs"],
        message: expect.stringContaining("Only one source asset is allowed"),
      }),
    ]);
  });
});
