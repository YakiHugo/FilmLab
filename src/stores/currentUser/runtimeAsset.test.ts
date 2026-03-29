import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredAsset } from "@/lib/db";
import { materializeStoredAsset } from "./runtimeAsset";

const createStoredAsset = (overrides: Partial<StoredAsset> = {}): StoredAsset => ({
  id: "asset-1",
  name: "sample.jpg",
  type: "image/jpeg",
  size: 3,
  createdAt: "2026-03-14T00:00:00.000Z",
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
  ...overrides,
});

describe("materializeStoredAsset", () => {
  beforeEach(() => {
    let index = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:mock-${++index}`);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a runtime asset from stored IndexedDB data", () => {
    const asset = materializeStoredAsset(createStoredAsset(), {
      fallbackOwnerRef: { userId: "user-1" },
      nowIso: "2026-03-14T01:00:00.000Z",
    });

    expect(asset?.id).toBe("asset-1");
    expect(asset?.objectUrl).toBe("blob:mock-1");
    expect(asset?.thumbnailUrl).toBe("blob:mock-1");
    expect(asset?.ownerRef).toEqual({ userId: "user-1" });
    expect(asset?.remote?.status).toBe("local_only");
  });

  it("skips stored assets with invalid source blobs", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const asset = materializeStoredAsset(
      createStoredAsset({
        blob: undefined as unknown as Blob,
      }),
      {
        fallbackOwnerRef: { userId: "user-1" },
      }
    );

    expect(asset).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("ignores invalid thumbnail blobs instead of failing the entire asset", () => {
    const asset = materializeStoredAsset(
      createStoredAsset({
        thumbnailBlob: { bad: true } as unknown as Blob,
      }),
      {
        fallbackOwnerRef: { userId: "user-1" },
      }
    );

    expect(asset).not.toBeNull();
    expect(asset?.thumbnailUrl).toBe(asset?.objectUrl);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});
