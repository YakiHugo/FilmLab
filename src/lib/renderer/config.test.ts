import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RENDERER_RUNTIME_CONFIG,
  getRendererRuntimeConfig,
  resolveExportConcurrency,
} from "./config";

interface LocalStorageLike {
  getItem(key: string): string | null;
}

const originalWindow = (globalThis as { window?: unknown }).window;

const setWindowLocalStorage = (storage: LocalStorageLike | null) => {
  if (!storage) {
    delete (globalThis as { window?: unknown }).window;
    return;
  }
  (globalThis as { window?: unknown }).window = {
    localStorage: storage,
  };
};

const createStorage = (values: Record<string, string>) => ({
  getItem(key: string) {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key]! : null;
  },
});

afterEach(() => {
  if (typeof originalWindow === "undefined") {
    delete (globalThis as { window?: unknown }).window;
    return;
  }
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("renderer runtime config", () => {
  it("returns defaults without window/localStorage", () => {
    setWindowLocalStorage(null);
    expect(getRendererRuntimeConfig()).toEqual(DEFAULT_RENDERER_RUNTIME_CONFIG);
    expect(resolveExportConcurrency()).toBe(2);
  });

  it("reads localStorage overrides and clamps export concurrency", () => {
    setWindowLocalStorage(
      createStorage({
        "filmlab:feature:gpuGeometry": "0",
        "filmlab:feature:incremental": "0",
        "filmlab:feature:hsl": "0",
        "filmlab:feature:curve": "1",
        "filmlab:feature:detail": "0",
        "filmlab:feature:film": "1",
        "filmlab:feature:optics": "0",
        "filmlab:feature:keepLastPreviewFrameOnError": "0",
        "filmlab:renderTiming": "1",
        "filmlab:renderTimingVerbose": "1",
        "filmlab:exportConcurrency": "99",
      })
    );

    const config = getRendererRuntimeConfig();
    expect(config.features.gpuGeometryPass).toBe(false);
    expect(config.features.incrementalPipeline).toBe(false);
    expect(config.features.enableHslPass).toBe(false);
    expect(config.features.enableCurvePass).toBe(true);
    expect(config.features.enableDetailPass).toBe(false);
    expect(config.features.enableFilmPass).toBe(true);
    expect(config.features.enableOpticsPass).toBe(false);
    expect(config.features.keepLastPreviewFrameOnError).toBe(false);
    expect(config.diagnostics.renderTimings).toBe(true);
    expect(config.diagnostics.verboseRenderTimings).toBe(true);
    expect(config.export.defaultConcurrency).toBe(3);
    expect(resolveExportConcurrency()).toBe(3);
  });
});
