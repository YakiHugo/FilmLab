import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./PipelineRenderer", () => {
  class MockPipelineRenderer {
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
    isWebGL2 = true;
    isContextLost = false;
    maxTextureSize = 8192;
    disposed = false;

    constructor(canvas: HTMLCanvasElement, width: number, height: number) {
      this.canvas = canvas;
      this.width = width;
      this.height = height;
    }

    dispose() {
      this.disposed = true;
    }
  }

  return {
    PipelineRenderer: MockPipelineRenderer,
  };
});

import { RenderManager } from "./RenderManager";

describe("RenderManager", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
      })),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("releases all preview renderers and frame state that share a slot prefix", () => {
    const manager = new RenderManager();
    const mainRenderer = manager.getRenderer("preview", 400, 300, "preview:doc-a:main") as unknown as {
      disposed: boolean;
    };
    const layerRenderer = manager.getRenderer(
      "preview",
      400,
      300,
      "preview:doc-a:layer:base"
    ) as unknown as { disposed: boolean };
    const otherRenderer = manager.getRenderer("preview", 400, 300, "preview:doc-b:main") as unknown as {
      disposed: boolean;
    };

    const layerState = manager.getFrameState("preview", "preview:doc-a:layer:base");
    layerState.sourceKey = "layer";
    layerState.geometryKey = "geometry";

    manager.disposeBySlotPrefix("preview", "preview:doc-a");

    expect(mainRenderer.disposed).toBe(true);
    expect(layerRenderer.disposed).toBe(true);
    expect(otherRenderer.disposed).toBe(false);

    const recreatedLayerRenderer = manager.getRenderer(
      "preview",
      400,
      300,
      "preview:doc-a:layer:base"
    );
    expect(recreatedLayerRenderer).not.toBe(layerRenderer);
    expect(manager.getFrameState("preview", "preview:doc-a:layer:base").sourceKey).toBeNull();
    expect(manager.getFrameState("preview", "preview:doc-a:layer:base").geometryKey).toBeNull();
  });
});
