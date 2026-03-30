import { beforeEach, describe, expect, it, vi } from "vitest";

describe("loadAssets", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns stored assets without trying to hydrate legacy editor fields", async () => {
    const storedAssets = [
      {
        id: "asset-1",
        name: "legacy.jpg",
        type: "image/jpeg",
        size: 3,
        createdAt: "2026-03-14T00:00:00.000Z",
        blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
        adjustments: {
          exposure: 0,
          contrast: 0,
        },
        layers: [
          {
            id: "layer-1",
            type: "adjustment",
          },
        ],
      },
      {
        id: "asset-2",
        name: "plain.jpg",
        type: "image/jpeg",
        size: 3,
        createdAt: "2026-03-14T00:00:00.000Z",
        blob: new Blob([new Uint8Array([4, 5, 6])], { type: "image/jpeg" }),
      },
    ];

    const getMock = vi.fn(async () => undefined);
    vi.doMock("idb", () => ({
      openDB: vi.fn(async () => ({
        getAll: vi.fn(async () => storedAssets),
        get: getMock,
        objectStoreNames: {
          contains: vi.fn(() => false),
        },
      })),
    }));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { loadAssets } = await import("./db");

    const result = await loadAssets();

    expect(result).toEqual(storedAssets);
    expect(getMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalledWith(
      "IndexedDB loadAssets failed:",
      expect.anything()
    );
  });
});
