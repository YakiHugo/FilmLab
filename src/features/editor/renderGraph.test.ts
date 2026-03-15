import { createDefaultAdjustments } from "@/lib/adjustments";
import { describe, expect, it } from "vitest";
import {
  buildRenderDocumentDirtyKeys,
  buildRenderGraph,
  buildViewportRoiDirtyKey,
  resolveDirtyReasons,
} from "./renderGraph";
import type { EditorLayerRenderEntry } from "./renderPreparation";

const createEntry = (
  overrides?: Partial<EditorLayerRenderEntry>
): EditorLayerRenderEntry => {
  const adjustments = createDefaultAdjustments();
  adjustments.localAdjustments = [
    {
      id: "local-1",
      enabled: true,
      amount: 100,
      mask: {
        mode: "radial",
        centerX: 0.5,
        centerY: 0.5,
        radiusX: 0.25,
        radiusY: 0.25,
        feather: 0.4,
      },
      adjustments: { exposure: 12 },
    },
  ];

  return {
    layer: {
      id: "layer-1",
      name: "Layer 1",
      type: "adjustment",
      visible: true,
      opacity: 80,
      blendMode: "screen",
      mask: {
        mode: "radial",
        inverted: false,
        data: {
          mode: "radial",
          centerX: 0.5,
          centerY: 0.5,
          radiusX: 0.35,
          radiusY: 0.35,
          feather: 0.4,
        },
      },
    },
    sourceAsset: {
      id: "asset-1",
      name: "asset.jpg",
      type: "image/jpeg",
      size: 1024,
      createdAt: "2026-03-15T00:00:00.000Z",
      objectUrl: "blob:asset-1",
      adjustments: createDefaultAdjustments(),
      layers: [],
    },
    adjustments,
    opacity: 0.8,
    blendMode: "screen",
    ...overrides,
  };
};

describe("renderGraph", () => {
  it("materializes scoped local adjustments on each layer node", () => {
    const entry = createEntry();
    const graph = buildRenderGraph({
      documentKey: "editor:asset-1",
      sourceAsset: entry.sourceAsset,
      filmProfile: undefined,
      layerEntries: [entry],
      showOriginal: false,
    });

    expect(graph.layers).toHaveLength(1);
    expect(graph.layers[0]?.scopedLocalAdjustments).toHaveLength(1);
    expect(graph.layers[0]?.scopedLocalAdjustments[0]?.phase).toBe("develop");
  });

  it("splits dirty keys for layer adjustments, masks, locals, and roi", () => {
    const entry = createEntry();
    const graph = buildRenderGraph({
      documentKey: "editor:asset-1",
      sourceAsset: entry.sourceAsset,
      filmProfile: undefined,
      layerEntries: [entry],
      showOriginal: false,
    });
    const baseKeys = buildRenderDocumentDirtyKeys({
      documentKey: "editor:asset-1",
      sourceAsset: entry.sourceAsset,
      adjustments: entry.adjustments,
      filmProfile: undefined,
      showOriginal: false,
      renderGraph: graph,
    });
    const nextKeys = {
      ...baseKeys,
      roi: buildViewportRoiDirtyKey({ x: 0, y: 0, width: 320, height: 180 }),
    };

    expect(baseKeys["layer-adjustments"]).not.toBe("");
    expect(baseKeys["layer-mask"]).not.toBe("");
    expect(baseKeys["local-adjustments"]).not.toBe("");
    expect(nextKeys.roi).not.toBe(baseKeys.roi);
    expect(resolveDirtyReasons(baseKeys, nextKeys)).toEqual(["roi"]);
  });
});
