import { describe, expect, it } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { ensureAssetLayers } from "./editorLayers";

describe("editorLayers", () => {
  it("normalizes missing layer adjustment visibility to all visible", () => {
    const adjustments = createDefaultAdjustments();
    const layers = ensureAssetLayers({
      id: "asset-1",
      adjustments,
      layers: [
        {
          id: "base-1",
          name: "Background",
          type: "base",
          visible: true,
          opacity: 100,
          blendMode: "normal",
          adjustments,
        },
      ],
    });

    expect(layers[0]?.adjustmentVisibility).toEqual({
      basic: true,
      effects: true,
      detail: true,
    });
  });
});
