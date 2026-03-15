import { createDefaultAdjustments } from "@/lib/adjustments";
import { buildRenderGraph } from "../renderGraph";
import { describe, expect, it } from "vitest";
import { applySelectedLayerPreviewAdjustments } from "./layerPreviewEntries";

describe("layerPreviewEntries helpers", () => {
  it("applies preview-only adjustments to the selected layer node", () => {
    const baseAdjustments = createDefaultAdjustments();
    const previewAdjustments = {
      ...baseAdjustments,
      horizontal: 12,
    };
    const entries = [
      {
        layer: {
          id: "layer-a",
          name: "Layer A",
          type: "base" as const,
          visible: true,
          opacity: 100,
          blendMode: "normal" as const,
        },
        sourceAsset: {
          id: "asset-a",
          name: "asset-a.jpg",
          type: "image/jpeg" as const,
          size: 1,
          createdAt: "2026-03-15T00:00:00.000Z",
          objectUrl: "blob:asset-a",
        },
        adjustments: baseAdjustments,
        opacity: 1,
        blendMode: "normal" as const,
      },
      {
        layer: {
          id: "layer-b",
          name: "Layer B",
          type: "texture" as const,
          visible: true,
          opacity: 100,
          blendMode: "normal" as const,
          textureAssetId: "texture-a",
        },
        sourceAsset: {
          id: "texture-a",
          name: "texture-a.jpg",
          type: "image/jpeg" as const,
          size: 1,
          createdAt: "2026-03-15T00:00:00.000Z",
          objectUrl: "blob:texture-a",
        },
        adjustments: baseAdjustments,
        opacity: 1,
        blendMode: "normal" as const,
      },
    ];

    const renderGraph = buildRenderGraph({
      documentKey: "editor:asset-a",
      sourceAsset: entries[0]!.sourceAsset,
      filmProfile: undefined,
      layerEntries: entries,
      showOriginal: false,
    });

    const nextRenderGraph = applySelectedLayerPreviewAdjustments(
      renderGraph,
      "layer-b",
      previewAdjustments,
      undefined
    );

    expect(nextRenderGraph.layers[0]).toBe(renderGraph.layers[0]);
    expect(nextRenderGraph.layers[1]?.adjustments).toBe(previewAdjustments);
  });
});
