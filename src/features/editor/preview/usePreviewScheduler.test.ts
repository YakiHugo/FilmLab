import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PREVIEW_FULL_QUALITY_DELAY_MS,
  createPreviewSchedulerController,
} from "./usePreviewScheduler";

interface SchedulerRequest {
  documentKey: string;
  quality: "interactive" | "full";
  marker: string;
}

interface DeferredExecution {
  marker: string;
  quality: SchedulerRequest["quality"];
  requestId: number;
  signal: AbortSignal;
  resolve: (value: { marker: string }) => void;
}

const createDeferred = () => {
  let resolve!: (value: { marker: string }) => void;
  const promise = new Promise<{ marker: string }>((innerResolve) => {
    resolve = innerResolve;
  });
  return {
    promise,
    resolve,
  };
};

describe("createPreviewSchedulerController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("runs interactive immediately and full after 200ms once the document is already active", async () => {
    const executed: Array<{ marker: string; quality: SchedulerRequest["quality"] }> = [];
    const results: string[] = [];

    const controller = createPreviewSchedulerController<SchedulerRequest, { marker: string }>({
      execute: async (request) => {
        executed.push({ marker: request.marker, quality: request.quality });
        return { marker: request.marker };
      },
      onResult: (result) => {
        results.push(`${result.marker}:${result.quality}`);
      },
    });

    controller.schedule({
      documentKey: "doc-1",
      createRequest: (quality) => ({ documentKey: "doc-1", quality, marker: "initial" }),
    });
    await vi.runAllTimersAsync();
    executed.length = 0;
    results.length = 0;

    controller.schedule({
      documentKey: "doc-1",
      createRequest: (quality) => ({ documentKey: "doc-1", quality, marker: "drag" }),
    });

    expect(executed).toEqual([{ marker: "drag", quality: "interactive" }]);
    await Promise.resolve();
    expect(results).toEqual(["drag:interactive"]);

    await vi.advanceTimersByTimeAsync(PREVIEW_FULL_QUALITY_DELAY_MS);

    expect(executed).toEqual([
      { marker: "drag", quality: "interactive" },
      { marker: "drag", quality: "full" },
    ]);
    expect(results).toEqual(["drag:interactive", "drag:full"]);
  });

  it("keeps only the newest request result when rapid interactive updates overlap", async () => {
    const deferredByMarker = new Map<string, DeferredExecution>();
    const results: string[] = [];

    const controller = createPreviewSchedulerController<SchedulerRequest, { marker: string }>({
      execute: (request, signal, requestId) => {
        const deferred = createDeferred();
        deferredByMarker.set(request.marker, {
          marker: request.marker,
          quality: request.quality,
          requestId,
          signal,
          resolve: deferred.resolve,
        });
        return deferred.promise;
      },
      onResult: (result) => {
        results.push(`${result.marker}:${result.quality}:${result.requestId}`);
      },
    });

    controller.schedule({
      documentKey: "doc-1",
      createRequest: (quality) => ({ documentKey: "doc-1", quality, marker: `initial-${quality}` }),
    });
    deferredByMarker.get("initial-full")?.resolve({ marker: "initial-full" });
    await Promise.resolve();
    deferredByMarker.clear();
    results.length = 0;

    controller.schedule({
      documentKey: "doc-1",
      createRequest: (quality) => ({ documentKey: "doc-1", quality, marker: `a-${quality}` }),
    });
    controller.schedule({
      documentKey: "doc-1",
      createRequest: (quality) => ({ documentKey: "doc-1", quality, marker: `b-${quality}` }),
    });

    const firstInteractive = deferredByMarker.get("a-interactive");
    const secondInteractive = deferredByMarker.get("b-interactive");
    expect(firstInteractive?.signal.aborted).toBe(true);
    expect(secondInteractive?.signal.aborted).toBe(false);

    firstInteractive?.resolve({ marker: "a-interactive" });
    secondInteractive?.resolve({ marker: "b-interactive" });
    await Promise.resolve();

    expect(results).toEqual([
      `${secondInteractive?.marker}:${secondInteractive?.quality}:${secondInteractive?.requestId}`,
    ]);
  });

  it("drops an older full-quality result after a newer interactive request is issued", async () => {
    const deferredByMarker = new Map<string, DeferredExecution>();
    const results: string[] = [];

    const controller = createPreviewSchedulerController<SchedulerRequest, { marker: string }>({
      execute: (request, signal, requestId) => {
        const deferred = createDeferred();
        deferredByMarker.set(request.marker, {
          marker: request.marker,
          quality: request.quality,
          requestId,
          signal,
          resolve: deferred.resolve,
        });
        return deferred.promise;
      },
      onResult: (result) => {
        results.push(`${result.marker}:${result.quality}:${result.requestId}`);
      },
    });

    controller.schedule({
      documentKey: "doc-1",
      createRequest: (quality) => ({ documentKey: "doc-1", quality, marker: `initial-${quality}` }),
    });

    controller.schedule({
      documentKey: "doc-1",
      createRequest: (quality) => ({ documentKey: "doc-1", quality, marker: `drag-${quality}` }),
    });

    const initialFull = deferredByMarker.get("initial-full");
    const dragInteractive = deferredByMarker.get("drag-interactive");

    initialFull?.resolve({ marker: "initial-full" });
    dragInteractive?.resolve({ marker: "drag-interactive" });
    await Promise.resolve();

    expect(results).toEqual([
      `${dragInteractive?.marker}:${dragInteractive?.quality}:${dragInteractive?.requestId}`,
    ]);
  });

  it("aborts old work and runs a full render immediately when the document changes", async () => {
    const deferredByMarker = new Map<string, DeferredExecution>();
    const results: string[] = [];

    const controller = createPreviewSchedulerController<SchedulerRequest, { marker: string }>({
      execute: (request, signal, requestId) => {
        const deferred = createDeferred();
        deferredByMarker.set(request.marker, {
          marker: request.marker,
          quality: request.quality,
          requestId,
          signal,
          resolve: deferred.resolve,
        });
        return deferred.promise;
      },
      onResult: (result) => {
        results.push(`${result.marker}:${result.quality}`);
      },
    });

    controller.schedule({
      documentKey: "doc-a",
      createRequest: (quality) => ({ documentKey: "doc-a", quality, marker: `doc-a-${quality}` }),
    });

    const firstDocument = deferredByMarker.get("doc-a-full");
    expect(firstDocument?.quality).toBe("full");

    controller.schedule({
      documentKey: "doc-b",
      createRequest: (quality) => ({ documentKey: "doc-b", quality, marker: `doc-b-${quality}` }),
    });

    const secondDocument = deferredByMarker.get("doc-b-full");
    expect(firstDocument?.signal.aborted).toBe(true);
    expect(secondDocument?.quality).toBe("full");

    firstDocument?.resolve({ marker: "doc-a-full" });
    secondDocument?.resolve({ marker: "doc-b-full" });
    await Promise.resolve();

    expect(results).toEqual(["doc-b-full:full"]);
  });
});
