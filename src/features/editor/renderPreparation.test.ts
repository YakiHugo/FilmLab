import { describe, expect, it } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { buildEditorLayerRenderEntries } from "./renderPreparation";

describe("renderPreparation", () => {
  it("applies per-layer adjustment visibility to render entries", () => {
    const defaults = createDefaultAdjustments();
    const documentAsset = {
      id: "asset-1",
      name: "asset.jpg",
      type: "image/jpeg" as const,
      size: 1,
      createdAt: "2026-03-15T00:00:00.000Z",
      objectUrl: "blob:asset-1",
      adjustments: defaults,
    };

    const layers = [
      {
        id: "adjustment-1",
        name: "Adjustment 1",
        type: "adjustment" as const,
        visible: true,
        opacity: 100,
        blendMode: "normal" as const,
        adjustments: {
          ...defaults,
          exposure: 18,
          hsl: {
            ...defaults.hsl,
            red: {
              ...defaults.hsl.red,
              hue: 8,
            },
          },
        },
        adjustmentVisibility: {
          basic: false,
          effects: true,
          detail: true,
        },
      },
    ];

    const entries = buildEditorLayerRenderEntries({
      assetById: new Map([[documentAsset.id, documentAsset]]),
      documentAsset,
      layers,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.adjustments.exposure).toBe(defaults.exposure);
    expect(entries[0]?.adjustments.hsl.red.hue).toBe(8);
  });
});
