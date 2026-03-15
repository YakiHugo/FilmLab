import { createDefaultAdjustments } from "@/lib/adjustments";
import { describe, expect, it } from "vitest";
import { createRenderDocument } from "./document";
import {
  createFlattenMaterializationPlan,
  createMergeDownMaterializationPlan,
} from "./renderMaterialization";

const createAsset = (id: string) => ({
  id,
  name: `${id}.jpg`,
  type: "image/jpeg" as const,
  size: 1024,
  createdAt: "2026-03-15T00:00:00.000Z",
  objectUrl: `blob:${id}`,
  adjustments: createDefaultAdjustments(),
  layers: [],
});

describe("renderMaterialization", () => {
  it("creates a flatten plan from the active render graph", () => {
    const asset = createAsset("asset-a");
    const document = createRenderDocument({
      key: "editor:asset-a",
      assetById: new Map([[asset.id, asset]]),
      documentAsset: asset,
      layers: [
        {
          id: "top",
          name: "Top",
          type: "adjustment",
          visible: true,
          opacity: 100,
          blendMode: "normal",
          adjustments: createDefaultAdjustments(),
        },
        {
          id: "base",
          name: "Base",
          type: "base",
          visible: true,
          opacity: 100,
          blendMode: "normal",
          adjustments: createDefaultAdjustments(),
        },
      ],
      adjustments: createDefaultAdjustments(),
      filmProfile: undefined,
      showOriginal: false,
    });

    expect(createFlattenMaterializationPlan(document)).toEqual({
      intent: "flatten",
      assetId: "asset-a",
      documentKey: document.documentKey,
      renderGraphKey: document.renderGraph.key,
      layerIds: ["top", "base"],
      targetLayerId: null,
    });
  });

  it("creates a merge-down plan against the layer below", () => {
    const asset = createAsset("asset-a");
    const document = createRenderDocument({
      key: "editor:asset-a",
      assetById: new Map([[asset.id, asset]]),
      documentAsset: asset,
      layers: [
        {
          id: "top",
          name: "Top",
          type: "adjustment",
          visible: true,
          opacity: 100,
          blendMode: "normal",
          adjustments: createDefaultAdjustments(),
        },
        {
          id: "base",
          name: "Base",
          type: "base",
          visible: true,
          opacity: 100,
          blendMode: "normal",
          adjustments: createDefaultAdjustments(),
        },
      ],
      adjustments: createDefaultAdjustments(),
      filmProfile: undefined,
      showOriginal: false,
    });

    expect(createMergeDownMaterializationPlan(document, "top")).toEqual({
      intent: "merge-down",
      assetId: "asset-a",
      documentKey: document.documentKey,
      renderGraphKey: document.renderGraph.key,
      layerIds: ["top", "base"],
      targetLayerId: "base",
    });
    expect(createMergeDownMaterializationPlan(document, "base")).toBeNull();
  });
});
