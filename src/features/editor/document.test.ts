import { createDefaultAdjustments } from "@/lib/adjustments";
import type { Asset } from "@/types";
import { describe, expect, it } from "vitest";
import { createRenderDocument } from "./document";

describe("editor document helpers", () => {
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
    expect(document.renderGraph.documentKey).toBe("editor:asset-1:export");
    expect(document.dirtyReasons).toContain("document-adjustments");
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

  it("derives dirty reasons from the previous render document", () => {
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
    const baseAdjustments = createDefaultAdjustments();
    const previous = createRenderDocument({
      key: "editor:asset-1",
      assetById: new Map([[asset.id, asset]]),
      documentAsset: asset,
      layers: [],
      adjustments: baseAdjustments,
      filmProfile: undefined,
      showOriginal: false,
    });

    const nextAdjustments = {
      ...baseAdjustments,
      exposure: 12,
    };

    const next = createRenderDocument({
      key: "editor:asset-1",
      assetById: new Map([[asset.id, asset]]),
      documentAsset: asset,
      layers: [],
      adjustments: nextAdjustments,
      filmProfile: undefined,
      showOriginal: false,
      previousDocument: previous,
    });

    expect(next.dirtyReasons).toEqual(["document-adjustments"]);
  });
});
