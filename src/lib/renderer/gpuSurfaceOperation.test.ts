import { beforeEach, describe, expect, it, vi } from "vitest";

const getRendererMock = vi.fn();
const disposeMock = vi.fn();
const disposeAllMock = vi.fn();

vi.mock("./RenderManager", () => ({
  RenderManager: class MockRenderManager {
    getRenderer(...args: unknown[]) {
      return Reflect.apply(getRendererMock, this, args);
    }

    dispose(...args: unknown[]) {
      return Reflect.apply(disposeMock, this, args);
    }

    disposeAll(...args: unknown[]) {
      return Reflect.apply(disposeAllMock, this, args);
    }
  },
}));

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

describe("gpuSurfaceOperation.runRendererPixelReadbackOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("holds the slot mutex until async pixel readback completes", async () => {
    vi.resetModules();
    const { runRendererPixelReadbackOperation } = await import("./gpuSurfaceOperation");
    const firstReadback = createDeferred<Uint8Array>();
    const firstRenderer = {
      extractPixelsAsync: vi.fn(() => firstReadback.promise),
    };
    const secondRenderer = {
      extractPixelsAsync: vi.fn(async () => new Uint8Array([5, 6, 7, 8])),
    };

    getRendererMock.mockReturnValueOnce(firstRenderer).mockReturnValueOnce(secondRenderer);

    const firstRender = vi.fn(() => true);
    const secondRender = vi.fn(() => true);

    const firstPromise = runRendererPixelReadbackOperation({
      mode: "preview",
      width: 1,
      height: 1,
      slotId: "ascii-analysis",
      render: firstRender,
    });
    const secondPromise = runRendererPixelReadbackOperation({
      mode: "preview",
      width: 1,
      height: 1,
      slotId: "ascii-analysis",
      render: secondRender,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(getRendererMock).toHaveBeenCalledTimes(1);
    expect(firstRender).toHaveBeenCalledTimes(1);
    expect(secondRender).not.toHaveBeenCalled();

    firstReadback.resolve(new Uint8Array([1, 2, 3, 4]));
    await expect(firstPromise).resolves.toEqual(new Uint8Array([1, 2, 3, 4]));
    await expect(secondPromise).resolves.toEqual(new Uint8Array([5, 6, 7, 8]));

    expect(getRendererMock).toHaveBeenCalledTimes(2);
    expect(secondRender).toHaveBeenCalledTimes(1);
  });

  it("disposes the renderer slot when async readback rejects", async () => {
    vi.resetModules();
    const { runRendererPixelReadbackOperation } = await import("./gpuSurfaceOperation");
    getRendererMock.mockReturnValueOnce({
      extractPixelsAsync: vi.fn(async () => {
        throw new Error("context lost");
      }),
    });

    const result = await runRendererPixelReadbackOperation({
      mode: "export",
      width: 4,
      height: 4,
      slotId: "ascii-analysis",
      render: () => true,
    });

    expect(result).toBeNull();
    expect(disposeMock).toHaveBeenCalledWith("export", "ascii-analysis");
  });
});
