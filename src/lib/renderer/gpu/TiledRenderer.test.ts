import { describe, expect, it } from "vitest";
import { createTilePlan, readPixelsAsync } from "./TiledRenderer";

const createReadbackGl = (statuses: number[]) => {
  let statusIndex = 0;
  let readPixelsCalls = 0;
  const sync = {};
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    ALREADY_SIGNALED: 0x911a,
    CONDITION_SATISFIED: 0x911c,
    TIMEOUT_EXPIRED: 0x911b,
    WAIT_FAILED: 0x911d,
    FRAMEBUFFER: 0x8d40,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    fenceSync: () => sync as unknown as WebGLSync,
    flush: () => {},
    clientWaitSync: () => statuses[Math.min(statusIndex++, statuses.length - 1)] ?? 0x911b,
    readPixels: (
      _x: number,
      _y: number,
      _width: number,
      _height: number,
      _format: number,
      _type: number,
      pixels: Uint8Array
    ) => {
      readPixelsCalls += 1;
      pixels.fill(7);
    },
    deleteSync: () => {},
    isContextLost: () => false,
  } as unknown as WebGL2RenderingContext;

  return {
    gl,
    getReadPixelsCalls: () => readPixelsCalls,
  };
};

describe("createTilePlan", () => {
  it("creates tiles with overlap metadata", () => {
    const tiles = createTilePlan({
      width: 5000,
      height: 3000,
      tileSize: 2048,
      overlap: 64,
    });
    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles[0]?.x).toBe(0);
    expect(tiles[0]?.y).toBe(0);
    const last = tiles[tiles.length - 1]!;
    expect(last.contentX + last.contentWidth).toBeLessThanOrEqual(5000);
    expect(last.contentY + last.contentHeight).toBeLessThanOrEqual(3000);
  });
});

describe("readPixelsAsync", () => {
  it("resolves pixels when fence eventually signals", async () => {
    const { gl, getReadPixelsCalls } = createReadbackGl([0x911b, 0x911b, 0x911a]);
    const pixels = await readPixelsAsync(gl, 2, 2, {
      timeoutMs: 100,
      pollIntervalMs: 0,
    });
    expect(pixels.length).toBe(16);
    expect(pixels[0]).toBe(7);
    expect(getReadPixelsCalls()).toBe(1);
  });

  it("throws when fence wait fails", async () => {
    const { gl } = createReadbackGl([0x911d]);
    await expect(
      readPixelsAsync(gl, 1, 1, {
        timeoutMs: 50,
        pollIntervalMs: 0,
      })
    ).rejects.toThrow(/wait failed/i);
  });

  it("throws on timeout when fence never signals", async () => {
    const { gl } = createReadbackGl([0x911b]);
    await expect(
      readPixelsAsync(gl, 64, 32, {
        timeoutMs: 5,
        pollIntervalMs: 1,
      })
    ).rejects.toThrow(/Timed out waiting for GPU readback fence/i);
  });
});
