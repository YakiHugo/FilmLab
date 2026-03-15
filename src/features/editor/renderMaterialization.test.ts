import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { createRenderDocument } from "./document";
import {
  createFlattenMaterializationPlan,
  createMergeDownMaterializationPlan,
  executeRenderMaterialization,
  isRenderMaterializationPlanCurrent,
  resolveRenderMaterialization,
} from "./renderMaterialization";

vi.mock("./renderDocumentCanvas", () => ({
  renderDocumentToCanvas: vi.fn(async ({ canvas, targetSize }) => {
    canvas.width = targetSize?.width ?? 1;
    canvas.height = targetSize?.height ?? 1;
  }),
}));

vi.mock("@/lib/assetMetadata", () => ({
  prepareAssetPayload: vi.fn(async () => ({
    metadata: { width: 1, height: 1 },
    thumbnailBlob: new Blob(["thumb"], { type: "image/jpeg" }),
  })),
}));

vi.mock("@/lib/hash", () => ({
  sha256FromBlob: vi.fn(async () => "hash-rendered"),
}));

const createMockCanvas = () =>
  ({
    width: 0,
    height: 0,
    toBlob: (
      callback: BlobCallback,
      type?: string
    ) => callback(new Blob(["rendered"], { type: type ?? "image/png" })),
  }) as unknown as HTMLCanvasElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("document", {
    createElement: vi.fn(() => createMockCanvas()),
  });
});

const createAsset = (id: string) => ({
  id,
  name: `${id}.jpg`,
  type: "image/jpeg" as const,
  size: 1024,
  createdAt: "2026-03-15T00:00:00.000Z",
  objectUrl: `blob:${id}`,
  metadata: {
    width: 4000,
    height: 2000,
  },
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

  it("resolves flatten into a single reset base layer", () => {
    const asset = createAsset("asset-a");
    const resolved = resolveRenderMaterialization({
      asset,
      assets: [asset],
      intent: "flatten",
    });

    expect(resolved.supported).toBe(true);
    if (!resolved.supported) {
      return;
    }

    expect(resolved.value.nextLayers).toHaveLength(1);
    expect(resolved.value.nextLayers[0]).toMatchObject({
      type: "base",
      blendMode: "normal",
      opacity: 100,
      visible: true,
    });
    expect(resolved.value.plan.intent).toBe("flatten");
  });

  it("only supports merge-down when the target layer is the base layer", () => {
    const asset = createAsset("asset-a");
    const layers = [
      {
        id: "top",
        name: "Top",
        type: "adjustment" as const,
        visible: true,
        opacity: 100,
        blendMode: "normal" as const,
        adjustments: createDefaultAdjustments(),
      },
      {
        id: "middle",
        name: "Middle",
        type: "duplicate" as const,
        visible: true,
        opacity: 100,
        blendMode: "normal" as const,
        adjustments: createDefaultAdjustments(),
      },
      {
        id: "base",
        name: "Base",
        type: "base" as const,
        visible: true,
        opacity: 100,
        blendMode: "normal" as const,
        adjustments: createDefaultAdjustments(),
      },
    ];

    const unsupported = resolveRenderMaterialization({
      asset: {
        ...asset,
        layers,
      },
      assets: [
        {
          ...asset,
          layers,
        },
      ],
      intent: "merge-down",
      layerId: "top",
    });

    expect(unsupported).toEqual({
      supported: false,
      reason: "target-not-base",
    });

    const supported = resolveRenderMaterialization({
      asset: {
        ...asset,
        layers: [layers[1]!, layers[2]!],
      },
      assets: [
        {
          ...asset,
          layers: [layers[1]!, layers[2]!],
        },
      ],
      intent: "merge-down",
      layerId: "middle",
    });

    expect(supported.supported).toBe(true);
    if (!supported.supported) {
      return;
    }

    expect(supported.value.plan.layerIds).toEqual(["middle", "base"]);
    expect(supported.value.nextLayers.map((layer) => layer.id)).toEqual(["base"]);
  });

  it("invalidates the materialization plan when the layer stack changes", () => {
    const asset = createAsset("asset-a");
    const initialAsset = {
      ...asset,
      layers: [
        {
          id: "layer-a",
          name: "Layer A",
          type: "adjustment" as const,
          visible: true,
          opacity: 100,
          blendMode: "normal" as const,
          adjustments: createDefaultAdjustments(),
        },
        {
          id: "base",
          name: "Base",
          type: "base" as const,
          visible: true,
          opacity: 100,
          blendMode: "normal" as const,
          adjustments: createDefaultAdjustments(),
        },
      ],
    };
    const resolved = resolveRenderMaterialization({
      asset: initialAsset,
      assets: [initialAsset],
      intent: "merge-down",
      layerId: "layer-a",
    });

    expect(resolved.supported).toBe(true);
    if (!resolved.supported) {
      return;
    }

    const changedAsset = {
      ...initialAsset,
      layers: [
        {
          ...initialAsset.layers![0]!,
          opacity: 80,
        },
        initialAsset.layers![1]!,
      ],
    };

    expect(
      isRenderMaterializationPlanCurrent(resolved.value.plan, {
        asset: changedAsset,
        assets: [changedAsset],
        intent: "merge-down",
        layerId: "layer-a",
      })
    ).toBe(false);
  });

  it("renders a materialized output with the resolved crop size and encoded metadata", async () => {
    const asset = {
      ...createAsset("asset-a"),
      adjustments: {
        ...createDefaultAdjustments(),
        aspectRatio: "1:1" as const,
      },
    };
    const resolved = resolveRenderMaterialization({
      asset,
      assets: [asset],
      intent: "flatten",
    });

    expect(resolved.supported).toBe(true);
    if (!resolved.supported) {
      return;
    }

    const result = await executeRenderMaterialization({
      asset,
      resolved: resolved.value,
    });

    expect(result.contentHash).toBe("hash-rendered");
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("asset-a.jpg");
    expect(result.metadata.width).toBe(2000);
    expect(result.metadata.height).toBe(2000);
    expect(result.thumbnailBlob).toBeInstanceOf(Blob);
  });
});
