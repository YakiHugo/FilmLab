import { describe, expect, it } from "vitest";
import { resolveEditorSelectedAssetId } from "./selection";

const assets = [{ id: "asset-a" }, { id: "asset-b" }];

describe("resolveEditorSelectedAssetId", () => {
  it("prefers a valid assetId from the url", () => {
    expect(
      resolveEditorSelectedAssetId({
        assetId: "asset-b",
        assets,
        currentSelectedAssetId: "asset-a",
      })
    ).toBe("asset-b");
  });

  it("keeps the current selection when the url omits assetId", () => {
    expect(
      resolveEditorSelectedAssetId({
        assets,
        currentSelectedAssetId: "asset-a",
      })
    ).toBe("asset-a");
  });

  it("clears the selection when the url omits assetId and nothing valid is selected", () => {
    expect(
      resolveEditorSelectedAssetId({
        assets,
        currentSelectedAssetId: null,
      })
    ).toBeNull();
  });

  it("clears the selection when the url points to an unknown asset", () => {
    expect(
      resolveEditorSelectedAssetId({
        assetId: "missing",
        assets,
        currentSelectedAssetId: "asset-a",
      })
    ).toBeNull();
  });
});
