import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";

describe("loadAssets", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does not blank the whole library when a stored local adjustment is malformed", async () => {
    const storedAssets = [
      {
        id: "asset-1",
        name: "bad-mask.jpg",
        type: "image/jpeg",
        size: 3,
        createdAt: "2026-03-14T00:00:00.000Z",
        blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
        adjustments: {
          ...createDefaultAdjustments(),
          localAdjustments: [
            {
              id: "local-1",
              enabled: true,
              amount: 100,
            } as never,
          ],
        },
      },
    ];

    vi.doMock("idb", () => ({
      openDB: vi.fn(async () => ({
        getAll: vi.fn(async () => storedAssets),
        get: vi.fn(async () => undefined),
        objectStoreNames: {
          contains: vi.fn((name: string) => name === "localMaskBlobs"),
        },
      })),
    }));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { loadAssets } = await import("./db");

    const result = await loadAssets();

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("asset-1");
    expect(warnSpy).not.toHaveBeenCalledWith(
      "IndexedDB loadAssets failed:",
      expect.anything()
    );
  });

  it("keeps other assets when one brush-mask hydration lookup fails", async () => {
    const storedAssets = [
      {
        id: "asset-1",
        name: "mask.jpg",
        type: "image/jpeg",
        size: 3,
        createdAt: "2026-03-14T00:00:00.000Z",
        blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
        adjustments: {
          ...createDefaultAdjustments(),
          localAdjustments: [
            {
              id: "local-1",
              enabled: true,
              amount: 100,
              mask: {
                mode: "brush",
                points: [],
                pointsBlobId: "blob-1",
                brushSize: 0.08,
                feather: 0.55,
                flow: 0.85,
                lumaMin: 0,
                lumaMax: 1,
                lumaFeather: 0,
                hueCenter: 0,
                hueRange: 180,
                hueFeather: 0,
                satMin: 0,
                satFeather: 0,
                invert: false,
              },
              adjustments: {},
            },
          ],
        },
      },
      {
        id: "asset-2",
        name: "plain.jpg",
        type: "image/jpeg",
        size: 3,
        createdAt: "2026-03-14T00:00:00.000Z",
        blob: new Blob([new Uint8Array([4, 5, 6])], { type: "image/jpeg" }),
        adjustments: createDefaultAdjustments(),
      },
    ];

    vi.doMock("idb", () => ({
      openDB: vi.fn(async () => ({
        getAll: vi.fn(async () => storedAssets),
        get: vi.fn(async (_store: string, key: string) => {
          if (key === "blob-1") {
            throw new Error("broken blob lookup");
          }
          return undefined;
        }),
        objectStoreNames: {
          contains: vi.fn((name: string) => name === "localMaskBlobs"),
        },
      })),
    }));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { loadAssets } = await import("./db");

    const result = await loadAssets();

    expect(result.map((asset) => asset.id)).toEqual(["asset-1", "asset-2"]);
    expect(warnSpy).toHaveBeenCalled();
  });
});
