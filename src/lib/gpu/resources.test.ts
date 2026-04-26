import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { TexturePool } from "./resources";

// `GPUTextureUsage` is a runtime browser global; the node test env lacks it.
// Stubbing here lets us exercise pool acquire paths that resolve default usage.
beforeAll(() => {
  vi.stubGlobal("GPUTextureUsage", {
    COPY_SRC: 0x01,
    COPY_DST: 0x02,
    TEXTURE_BINDING: 0x04,
    STORAGE_BINDING: 0x08,
    RENDER_ATTACHMENT: 0x10,
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

interface FakeTexture {
  destroy: ReturnType<typeof vi.fn>;
  createView: ReturnType<typeof vi.fn>;
  __id: number;
}

const makeFakeDevice = () => {
  let counter = 0;
  const createTexture = vi.fn(() => {
    counter += 1;
    const id = counter;
    const tex: FakeTexture = {
      destroy: vi.fn(),
      createView: vi.fn(() => ({ __viewOf: id })),
      __id: id,
    };
    return tex as unknown as GPUTexture;
  });
  return {
    device: { createTexture } as unknown as GPUDevice,
    createTexture,
  };
};

describe("TexturePool", () => {
  it("reuses a released entry with matching size and format", () => {
    const { device, createTexture } = makeFakeDevice();
    const pool = new TexturePool(device);

    const first = pool.acquire(256, 128, "rgba8unorm");
    first.release();
    const second = pool.acquire(256, 128, "rgba8unorm");

    expect(second.texture).toBe(first.texture);
    expect(createTexture).toHaveBeenCalledTimes(1);
  });

  it("creates a new entry when format differs", () => {
    const { device, createTexture } = makeFakeDevice();
    const pool = new TexturePool(device);

    const first = pool.acquire(256, 128, "rgba8unorm");
    first.release();
    pool.acquire(256, 128, "rgba16float");

    expect(createTexture).toHaveBeenCalledTimes(2);
  });

  it("does not hand out the same entry to two simultaneous holders", () => {
    const { device } = makeFakeDevice();
    const pool = new TexturePool(device);

    const a = pool.acquire(64, 64, "rgba8unorm");
    const b = pool.acquire(64, 64, "rgba8unorm");

    expect(b.texture).not.toBe(a.texture);
  });

  it("evicts oldest free entries when free count exceeds the cap", () => {
    const { device, createTexture } = makeFakeDevice();
    const pool = new TexturePool(device, { maxFreeEntries: 1, maxFreeBytes: Number.POSITIVE_INFINITY });

    // Two distinct (so no reuse); release both.
    const a = pool.acquire(64, 64, "rgba8unorm");
    const b = pool.acquire(64, 64, "rgba16float");
    a.release();
    b.release();

    // One of them was evicted on the second release (free=2 > cap=1).
    const stats = pool.stats();
    expect(stats.free).toBe(1);
    const destroyed = createTexture.mock.results.filter(
      (r) => (r.value as FakeTexture).destroy.mock.calls.length > 0
    );
    expect(destroyed).toHaveLength(1);
  });

  it("evicts when free byte budget is exceeded", () => {
    const { device } = makeFakeDevice();
    // 64×64 RGBA8 = 16384 bytes; 64×64 RGBA16F = 32768 bytes. Cap at 32768 →
    // freeing both produces 49152 free bytes; pool evicts the oldest (RGBA8)
    // and stops once the remaining 32768 fits the cap.
    const pool = new TexturePool(device, {
      maxFreeEntries: Number.POSITIVE_INFINITY,
      maxFreeBytes: 32768,
    });

    const a = pool.acquire(64, 64, "rgba8unorm");
    const b = pool.acquire(64, 64, "rgba16float");
    a.release();
    b.release();

    const stats = pool.stats();
    expect(stats.free).toBe(1);
    expect(stats.freeBytes).toBe(32768);
  });

  it("ignores release of an unknown handle", () => {
    const { device } = makeFakeDevice();
    const pool = new TexturePool(device);
    const fakeHandle = {
      texture: { destroy: vi.fn(), createView: vi.fn() } as unknown as GPUTexture,
      view: {} as GPUTextureView,
      width: 1,
      height: 1,
      format: "rgba8unorm" as GPUTextureFormat,
      release: () => {},
    };
    expect(() => pool.release(fakeHandle)).not.toThrow();
  });

  it("treats double-release as a no-op", () => {
    const { device } = makeFakeDevice();
    const pool = new TexturePool(device);
    const handle = pool.acquire(32, 32, "rgba8unorm");

    handle.release();
    handle.release();

    expect(pool.stats()).toEqual({ total: 1, inUse: 0, free: 1, freeBytes: 32 * 32 * 4 });
  });

  it("destroys all entries on dispose() and rejects further acquires", () => {
    const { device, createTexture } = makeFakeDevice();
    const pool = new TexturePool(device);
    pool.acquire(16, 16, "rgba8unorm");
    pool.acquire(16, 16, "rgba16float");

    pool.dispose();

    for (const result of createTexture.mock.results) {
      expect((result.value as FakeTexture).destroy).toHaveBeenCalledTimes(1);
    }
    expect(() => pool.acquire(16, 16, "rgba8unorm")).toThrow(/dispose/);
  });
});
