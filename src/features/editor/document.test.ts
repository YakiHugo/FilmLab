import { createDefaultAdjustments } from "@/lib/adjustments";
import type { Asset } from "@/types";
import { describe, expect, it } from "vitest";
import { createEditorDocument, createRenderDocument } from "./document";

describe("editor document helpers", () => {
  it("builds an editor document with a resolved local selection", () => {
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
        adjustments: { exposure: 18 },
      },
    ];
    const asset: Asset = {
      id: "asset-1",
      name: "asset.jpg",
      type: "image/jpeg" as const,
      size: 10,
      createdAt: "2026-03-15T00:00:00.000Z",
      objectUrl: "blob:asset-1",
      adjustments,
      layers: [],
    };

    const document = createEditorDocument({
      assets: [asset],
      selectedAsset: asset,
      layers: [],
      selectedLayer: null,
      selectedLayerAdjustments: adjustments,
      selectedLayerAdjustmentVisibility: {
        basic: true,
        effects: true,
        detail: true,
      },
      selectedLocalAdjustmentId: "local-1",
    });

    expect(document.documentKey).toBe("editor:asset-1");
    expect(document.selectedLocalAdjustment?.id).toBe("local-1");
  });

  it("builds a render document with a stable document key", () => {
    const asset = {
      id: "asset-1",
      name: "asset.jpg",
      type: "image/jpeg" as const,
      size: 10,
      createdAt: "2026-03-15T00:00:00.000Z",
      objectUrl: "blob:asset-1",
      adjustments: createDefaultAdjustments(),
      layers: [],
    };

    const document = createRenderDocument({
      key: "editor:asset-1:export",
      assetById: new Map([[asset.id, asset]]),
      documentAsset: asset,
      layers: [],
      adjustments: createDefaultAdjustments(),
      filmProfile: undefined,
      showOriginal: false,
    });

    expect(document.documentKey).toBe("editor:asset-1:export");
    expect(document.sourceAssetId).toBe(asset.id);
    expect(document.layerEntries).toEqual([]);
  });

  it("folds referenced texture assets into the render document key", () => {
    const asset = {
      id: "asset-1",
      name: "asset.jpg",
      type: "image/jpeg" as const,
      size: 10,
      createdAt: "2026-03-15T00:00:00.000Z",
      objectUrl: "blob:asset-1",
      adjustments: createDefaultAdjustments(),
      layers: [],
    };
    const textureAsset: Asset = {
      id: "texture-1",
      name: "texture.jpg",
      type: "image/jpeg" as const,
      size: 10,
      createdAt: "2026-03-15T00:00:00.000Z",
      objectUrl: "blob:texture-1",
      filmProfileId: "film-a",
      adjustments: createDefaultAdjustments(),
      layers: [],
    };
    const textureAssetWithUpdatedFilm: Asset = {
      ...textureAsset,
      filmProfileId: "film-b",
    };

    const firstDocument = createRenderDocument({
      key: "editor:asset-1",
      assetById: new Map<string, Asset>([
        [asset.id, asset],
        [textureAsset.id, textureAsset],
      ]),
      documentAsset: asset,
      layers: [
        {
          id: "texture-layer",
          name: "Texture",
          type: "texture",
          visible: true,
          opacity: 100,
          blendMode: "normal",
          textureAssetId: textureAsset.id,
        },
      ],
      adjustments: createDefaultAdjustments(),
      filmProfile: undefined,
      showOriginal: false,
    });

    const secondDocument = createRenderDocument({
      key: "editor:asset-1",
      assetById: new Map<string, Asset>([
        [asset.id, asset],
        [textureAsset.id, textureAssetWithUpdatedFilm],
      ]),
      documentAsset: asset,
      layers: [
        {
          id: "texture-layer",
          name: "Texture",
          type: "texture",
          visible: true,
          opacity: 100,
          blendMode: "normal",
          textureAssetId: textureAsset.id,
        },
      ],
      adjustments: createDefaultAdjustments(),
      filmProfile: undefined,
      showOriginal: false,
    });

    expect(firstDocument.documentKey).not.toBe("editor:asset-1");
    expect(secondDocument.documentKey).not.toBe(firstDocument.documentKey);
  });
});
