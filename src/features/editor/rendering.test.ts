import { describe, expect, it } from "vitest";
import { requiresLayerComposite, resolveSingleRenderableLayerEntry } from "./rendering";

describe("rendering helpers", () => {
  it("requires compositing for masked or translucent layers", () => {
    expect(
      requiresLayerComposite({
        blendMode: "normal",
        layer: {
          id: "layer-a",
          name: "Layer A",
          type: "base",
          visible: true,
          opacity: 100,
          blendMode: "normal",
          mask: {
            mode: "radial",
            inverted: false,
            data: {
              mode: "radial",
              centerX: 0.5,
              centerY: 0.5,
              radiusX: 0.25,
              radiusY: 0.25,
              feather: 0.4,
            },
          },
        },
        opacity: 1,
      })
    ).toBe(true);

    expect(
      requiresLayerComposite({
        blendMode: "normal",
        layer: {
          id: "layer-b",
          name: "Layer B",
          type: "base",
          visible: true,
          opacity: 80,
          blendMode: "normal",
        },
        opacity: 0.8,
      })
    ).toBe(true);
  });

  it("returns the only renderable layer entry when exactly one exists", () => {
    const entry = {
      blendMode: "normal" as const,
      layer: {
        id: "layer-a",
        name: "Layer A",
        type: "base" as const,
        visible: true,
        opacity: 100,
        blendMode: "normal" as const,
      },
      opacity: 1,
    };

    expect(resolveSingleRenderableLayerEntry([entry])).toBe(entry);
    expect(resolveSingleRenderableLayerEntry([])).toBeNull();
    expect(resolveSingleRenderableLayerEntry([entry, entry])).toBeNull();
  });
});
