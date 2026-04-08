import { createDefaultAdjustments } from "@/lib/adjustments";
import { describe, expect, it } from "vitest";
import {
  buildRenderDocumentDependencyKey,
  findAssetsReferencingTextureAsset,
  resolveReferencedTextureAssetIds,
} from "./renderDependencies";

const createAsset = (id: string, overrides?: Record<string, unknown>) => ({
  id,
  name: `${id}.jpg`,
  type: "image/jpeg" as const,
  size: 1024,
  createdAt: "2026-03-15T00:00:00.000Z",
  objectUrl: `blob:${id}`,
  adjustments: createDefaultAdjustments(),
  ...overrides,
});

describe("renderDependencies", () => {
  it("collects unique referenced texture assets", () => {
    expect(
      resolveReferencedTextureAssetIds([
        {
          id: "layer-a",
          name: "Layer A",
          type: "texture",
          visible: true,
          opacity: 100,
          blendMode: "normal",
          textureAssetId: "texture-a",
        },
        {
          id: "layer-b",
          name: "Layer B",
          type: "texture",
          visible: true,
          opacity: 100,
          blendMode: "normal",
          textureAssetId: "texture-a",
        },
      ])
    ).toEqual(["texture-a"]);
  });

  it("changes the dependency key when a referenced texture asset render state changes", () => {
    const baseKey = "editor:asset-a";
    const layers = [
      {
        id: "texture-layer",
        name: "Texture",
        type: "texture" as const,
        visible: true,
        opacity: 100,
        blendMode: "normal" as const,
        textureAssetId: "texture-a",
      },
    ];
    const before = buildRenderDocumentDependencyKey(
      baseKey,
      new Map([
        ["texture-a", createAsset("texture-a", { filmProfileId: "film-a" })],
      ]),
      layers
    );
    const after = buildRenderDocumentDependencyKey(
      baseKey,
      new Map([
        ["texture-a", createAsset("texture-a", { filmProfileId: "film-b" })],
      ]),
      layers
    );

    expect(before).not.toBe(baseKey);
    expect(after).not.toBe(before);
  });

  it("finds visible texture dependents for thumbnail refresh", () => {
    const assets = [
      createAsset("asset-a", {
        layers: [
          {
            id: "texture-layer",
            name: "Texture",
            type: "texture",
            visible: true,
            opacity: 100,
            blendMode: "normal",
            textureAssetId: "texture-a",
          },
        ],
      }),
      createAsset("asset-b", {
        layers: [
          {
            id: "hidden-texture",
            name: "Hidden Texture",
            type: "texture",
            visible: false,
            opacity: 100,
            blendMode: "normal",
            textureAssetId: "texture-a",
          },
        ],
      }),
      createAsset("texture-a"),
    ];

    expect(findAssetsReferencingTextureAsset(assets, "texture-a")).toEqual(["asset-a"]);
  });
});
