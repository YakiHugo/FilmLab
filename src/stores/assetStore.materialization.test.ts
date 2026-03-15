import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { createEditorAssetSnapshot } from "@/features/editor/history";
import type { RenderMaterializationOutput } from "@/features/editor/renderMaterialization";
import type { Asset } from "@/types";

const resolveRenderMaterializationMock = vi.fn();
const executeRenderMaterializationMock = vi.fn();
const isRenderMaterializationPlanCurrentMock = vi.fn();

vi.mock("@/features/editor/renderMaterialization", () => ({
  describeRenderMaterializationUnsupportedReason: vi.fn(() => "unsupported"),
  executeRenderMaterialization: (...args: unknown[]) =>
    executeRenderMaterializationMock(...args),
  isRenderMaterializationPlanCurrent: (...args: unknown[]) =>
    isRenderMaterializationPlanCurrentMock(...args),
  resolveRenderMaterialization: (...args: unknown[]) =>
    resolveRenderMaterializationMock(...args),
}));

vi.mock("@/lib/assetSyncApi", () => ({
  completeAssetUpload: vi.fn(),
  fetchAssetChanges: vi.fn(async () => []),
  deleteRemoteAsset: vi.fn(),
  presignAssetUpload: vi.fn(),
  uploadToPresignedTarget: vi.fn(),
}));

vi.mock("@/lib/authToken", () => ({
  getCurrentUserId: vi.fn(() => "user-1"),
}));

vi.mock("@/lib/db", () => ({
  clearAssets: vi.fn(async () => undefined),
  clearCanvasDocuments: vi.fn(async () => undefined),
  deleteAsset: vi.fn(async () => undefined),
  deleteAssetSyncJob: vi.fn(async () => undefined),
  deleteAssetSyncJobsByAssetId: vi.fn(async () => undefined),
  loadAssetSyncJobs: vi.fn(async () => []),
  loadAssets: vi.fn(async () => []),
  loadProject: vi.fn(async () => null),
  saveAsset: vi.fn(async () => undefined),
  saveAssetSyncJob: vi.fn(async () => undefined),
  saveAssetSyncJobs: vi.fn(async () => undefined),
  saveProject: vi.fn(async () => undefined),
}));

vi.mock("@/features/editor/thumbnail", () => ({
  createRenderedThumbnailBlob: vi.fn(async () => null),
}));

vi.mock("@/features/editor/renderDependencies", () => ({
  findAssetsReferencingTextureAsset: vi.fn(() => []),
}));

vi.mock("@/lib/storeEvents", () => ({
  emit: vi.fn(),
  on: vi.fn(),
}));

vi.mock("@/features/editor/presetUtils", () => ({
  loadCustomPresets: vi.fn(() => []),
}));

vi.mock("./project/persistence", () => ({
  cancelPendingPersists: vi.fn(),
  ensurePersistFlushOnUnload: vi.fn(),
  flushPendingPersists: vi.fn(async () => undefined),
  normalizeAssetUpdate: vi.fn((update) => update),
  persistAsset: vi.fn(),
  toStoredAsset: vi.fn(),
}));

vi.mock("./project/runtimeAsset", () => ({
  materializeStoredAsset: vi.fn(),
}));

vi.mock("./project/sync", () => ({
  MAX_SYNC_ATTEMPTS: 3,
  createSyncJob: vi.fn(({ localAssetId, op, nextRetryAt }) => ({
    jobId: `job-${localAssetId}-${op}`,
    localAssetId,
    op,
    attempts: 0,
    nextRetryAt,
    createdAt: nextRetryAt,
    updatedAt: nextRetryAt,
  })),
  isSyncJobReady: vi.fn(() => true),
  withSyncJobFailure: vi.fn((job, message) => ({
    ...job,
    attempts: (job.attempts ?? 0) + 1,
    lastError: message,
  })),
}));

const createAsset = (): Asset => ({
  id: "asset-1",
  name: "asset-1.jpg",
  type: "image/jpeg",
  size: 1024,
  createdAt: "2026-03-15T00:00:00.000Z",
  objectUrl: "blob:asset-1-original",
  adjustments: createDefaultAdjustments(),
  layers: [
    {
      id: "layer-top",
      name: "Top",
      type: "adjustment",
      visible: true,
      opacity: 100,
      blendMode: "normal",
      adjustments: createDefaultAdjustments(),
    },
    {
      id: "base-asset-1",
      name: "Background",
      type: "base",
      visible: true,
      opacity: 100,
      blendMode: "normal",
      adjustments: createDefaultAdjustments(),
    },
  ],
});

const createMaterializationOutput = (): RenderMaterializationOutput => ({
  blob: new Blob(["rendered"], { type: "image/jpeg" }),
  contentHash: "hash-rendered",
  metadata: {
    width: 100,
    height: 100,
  },
  thumbnailBlob: new Blob(["thumb"], { type: "image/jpeg" }),
  type: "image/jpeg",
  extension: "jpg",
});

describe("assetStore render materialization", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "URL",
      Object.assign(globalThis.URL, {
        createObjectURL: vi.fn((value: Blob) => `blob:${value.size}:${value.type}`),
        revokeObjectURL: vi.fn(),
      })
    );

    const { useAssetStore } = await import("./assetStore");
    const { useEditorStore } = await import("./editorStore");

    useAssetStore.setState({
      project: null,
      assets: [createAsset()],
      isLoading: false,
      isImporting: false,
      importProgress: null,
      selectedAssetIds: [],
    });
    useEditorStore.setState({
      selectedAssetId: "asset-1",
      selectedLayerId: "layer-top",
      historyByAssetId: {},
    });

    isRenderMaterializationPlanCurrentMock.mockReturnValue(true);
    resolveRenderMaterializationMock.mockImplementation(({ asset }: { asset: Asset }) => ({
      supported: true,
      value: {
        plan: {
          intent: "flatten",
          assetId: asset.id,
          documentKey: `materialize:flatten:${asset.id}`,
          renderGraphKey: "graph-1",
          layerIds: asset.layers?.map((layer) => layer.id) ?? [],
          targetLayerId: null,
        },
        document: {} as never,
        nextLayers: [
          {
            id: "base-asset-1",
            name: "Background",
            type: "base" as const,
            visible: true,
            opacity: 100,
            blendMode: "normal" as const,
            adjustments: createDefaultAdjustments(),
          },
        ],
      },
    }));
    executeRenderMaterializationMock.mockResolvedValue(createMaterializationOutput());
  });

  it("clears editor history after a successful flatten materialization", async () => {
    const { useAssetStore } = await import("./assetStore");
    const { useEditorStore } = await import("./editorStore");

    useEditorStore
      .getState()
      .pushHistory("asset-1", createEditorAssetSnapshot(createAsset()));

    expect(useEditorStore.getState().historyByAssetId["asset-1"]?.past).toHaveLength(1);

    const result = await useAssetStore.getState().flattenLayers("asset-1");

    expect(result).toBe(true);
    expect(useEditorStore.getState().historyByAssetId["asset-1"]).toBeUndefined();
  });

  it("abandons materialization if authoring state changes while render is in flight", async () => {
    const { useAssetStore } = await import("./assetStore");

    const deferred: {
      resolve?: (value: RenderMaterializationOutput) => void;
    } = {};
    executeRenderMaterializationMock.mockImplementation(
      () =>
        new Promise<RenderMaterializationOutput>((resolve) => {
          deferred.resolve = resolve;
        })
    );

    const pending = useAssetStore.getState().flattenLayers("asset-1");

    useAssetStore.setState((state) => ({
      assets: state.assets.map((asset) =>
        asset.id === "asset-1"
          ? {
              ...asset,
              layers: asset.layers?.map((layer) =>
                layer.id === "base-asset-1"
                  ? {
                      ...layer,
                      name: "Renamed Background",
                    }
                  : layer
              ),
            }
          : asset
      ),
    }));

    if (!deferred.resolve) {
      throw new Error("Expected materialization render to be pending.");
    }
    deferred.resolve(createMaterializationOutput());

    const result = await pending;

    expect(result).toBe(false);
    expect(useAssetStore.getState().assets[0]?.layers?.[1]?.name).toBe("Renamed Background");
  });
});
