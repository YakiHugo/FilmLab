import { describe, expect, it } from "vitest";
import { resolveImportedAssetIds } from "./assetImport";

const createFile = (name: string, type = "image/jpeg", bytes = 3) =>
  new File([new Uint8Array(bytes)], name, { type, lastModified: Date.now() });

describe("resolveImportedAssetIds", () => {
  it("matches imported assets back to the original file order", () => {
    const files = [createFile("b.jpg", "image/jpeg", 4), createFile("a.jpg", "image/jpeg", 8)];

    const resolved = resolveImportedAssetIds({
      filesInput: files,
      assetsBefore: [],
      assetsAfter: [
        { id: "asset-a", name: "a.jpg", size: 8 },
        { id: "asset-b", name: "b.jpg", size: 4 },
      ],
      addedAssetIds: ["asset-a", "asset-b"],
    });

    expect(resolved).toEqual(["asset-b", "asset-a"]);
  });

  it("reuses an existing asset id when the imported file is a duplicate", () => {
    const files = [createFile("existing.jpg", "image/jpeg", 5), createFile("new.jpg", "image/jpeg", 7)];

    const resolved = resolveImportedAssetIds({
      filesInput: files,
      assetsBefore: [{ id: "existing-asset", name: "existing.jpg", size: 5 }],
      assetsAfter: [
        { id: "existing-asset", name: "existing.jpg", size: 5 },
        { id: "new-asset", name: "new.jpg", size: 7 },
      ],
      addedAssetIds: ["new-asset"],
    });

    expect(resolved).toEqual(["existing-asset", "new-asset"]);
  });

  it("drops unsupported, oversized, and repeated fingerprints", () => {
    const duplicate = createFile("duplicate.jpg", "image/jpeg", 6);
    const oversized = {
      name: "large.jpg",
      type: "image/jpeg",
      size: 51 * 1024 * 1024,
      lastModified: Date.now(),
    } as File;
    const unsupported = createFile("note.txt", "text/plain", 2);

    const resolved = resolveImportedAssetIds({
      filesInput: [duplicate, duplicate, oversized, unsupported],
      assetsBefore: [],
      assetsAfter: [{ id: "duplicate-asset", name: "duplicate.jpg", size: 6 }],
      addedAssetIds: ["duplicate-asset"],
    });

    expect(resolved).toEqual(["duplicate-asset"]);
  });
});
