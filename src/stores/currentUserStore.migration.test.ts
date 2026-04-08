import { describe, expect, it } from "vitest";
import type { Asset } from "@/types";
import { resolveAssetImportDay, toLocalDayKey } from "./currentUser/grouping";
import { toStoredAsset } from "./currentUser/persistence";

type AssetImportDayFixture = Asset & { group?: string };

const createAsset = (overrides?: Partial<AssetImportDayFixture>): AssetImportDayFixture => ({
  id: "asset-1",
  name: "asset.jpg",
  type: "image/jpeg",
  size: 10,
  createdAt: "2026-02-20T10:00:00.000Z",
  objectUrl: "blob://asset-1",
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
  ...overrides,
});

describe("project migration helpers", () => {
  it("uses importDay when present", () => {
    const asset = createAsset({ importDay: "2026-02-26" });
    expect(resolveAssetImportDay(asset)).toBe("2026-02-26");
  });

  it("falls back to a migrated legacy group day when importDay is missing", () => {
    const asset = createAsset({ importDay: undefined, group: "2026-02-21" });
    expect(resolveAssetImportDay(asset)).toBe("2026-02-21");
  });

  it("falls back to createdAt day when importDay and legacy group are missing", () => {
    const createdAt = "2026-02-22T08:00:00.000Z";
    const asset = createAsset({ importDay: undefined, createdAt });
    expect(resolveAssetImportDay(asset)).toBe(toLocalDayKey(createdAt));
  });

  it("stores normalized importDay and tags for migrated assets", () => {
    const asset = createAsset({
      importDay: "2026-02-25",
      tags: [" Portrait ", "portrait", "Night"],
    });

    const stored = toStoredAsset(asset);
    expect(stored).not.toBeNull();
    expect(stored?.importDay).toBe("2026-02-25");
    expect(stored?.tags).toEqual(["Portrait", "Night"]);
  });
});

