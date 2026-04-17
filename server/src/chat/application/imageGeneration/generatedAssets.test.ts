import { describe, expect, it, vi } from "vitest";
import { commitGeneratedAssets } from "./generatedAssets";
import type { AssetService } from "../../../assets/service";
import type { NormalizedGeneratedImageEntry } from "./imageNormalization";
import type { ParsedImageGenerationRequest } from "../../../shared/imageGenerationSchema";
import type { PersistedPromptSnapshot } from "../../persistence/models";

const createNormalizedImage = (index: number): NormalizedGeneratedImageEntry => ({
  buffer: Buffer.from([index]),
  mimeType: "image/png",
  revisedPrompt: null,
  provider: "dashscope",
  model: "qwen-image-2.0-pro",
  index,
});

const createAssetServiceMock = (
  overrides: Partial<AssetService> = {}
): AssetService =>
  ({
    createGeneratedAsset: vi.fn().mockImplementation(async ({ name }: { name: string }) => ({
      assetId: `asset-${name}`,
      objectUrl: `https://example.com/${name}`,
      thumbnailUrl: `https://example.com/${name}-thumb`,
      created: true,
      type: "image/png",
    })),
    createAssetEdges: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as AssetService;

const baseInput = () => ({
  userId: "user-1",
  conversationId: "conv-1",
  turnId: "turn-1",
  runId: "run-1",
  completedAt: "2026-04-17T00:00:00.000Z",
  effectivePayload: {
    operation: "image.generate",
    inputAssets: [],
  } as unknown as ParsedImageGenerationRequest,
  completedPrompt: {} as PersistedPromptSnapshot,
});

describe("commitGeneratedAssets", () => {
  it("surfaces partial asset IDs when createGeneratedAsset fails mid-loop", async () => {
    const createdGeneratedAssetIds: string[] = [];
    const createdAssetEdgeIds: string[] = [];

    const assetService = createAssetServiceMock({
      createGeneratedAsset: vi
        .fn()
        .mockResolvedValueOnce({
          assetId: "asset-1",
          objectUrl: "https://example.com/1",
          thumbnailUrl: "https://example.com/1-thumb",
          created: true,
          type: "image/png",
        })
        .mockRejectedValueOnce(new Error("storage offline")),
    } as Partial<AssetService>);

    await expect(
      commitGeneratedAssets(assetService, {
        ...baseInput(),
        normalizedImages: [createNormalizedImage(0), createNormalizedImage(1)],
        createdGeneratedAssetIds,
        createdAssetEdgeIds,
      })
    ).rejects.toThrow("storage offline");

    expect(createdGeneratedAssetIds).toEqual(["asset-1"]);
    expect(createdAssetEdgeIds).toEqual([]);
  });

  it("does not record edge IDs when createAssetEdges throws", async () => {
    const createdGeneratedAssetIds: string[] = [];
    const createdAssetEdgeIds: string[] = [];

    const assetService = createAssetServiceMock({
      createAssetEdges: vi.fn().mockRejectedValue(new Error("edge tx rolled back")),
    });

    await expect(
      commitGeneratedAssets(assetService, {
        ...baseInput(),
        normalizedImages: [createNormalizedImage(0)],
        effectivePayload: {
          operation: "image.edit",
          inputAssets: [{ assetId: "ref-1", binding: "guide" }],
        } as unknown as ParsedImageGenerationRequest,
        createdGeneratedAssetIds,
        createdAssetEdgeIds,
      })
    ).rejects.toThrow("edge tx rolled back");

    expect(createdGeneratedAssetIds).toEqual(["asset-generated-turn-1-1"]);
    expect(createdAssetEdgeIds).toEqual([]);
  });

  it("populates both accumulators on successful commit", async () => {
    const createdGeneratedAssetIds: string[] = [];
    const createdAssetEdgeIds: string[] = [];
    const assetService = createAssetServiceMock();

    const result = await commitGeneratedAssets(assetService, {
      ...baseInput(),
      normalizedImages: [createNormalizedImage(0), createNormalizedImage(1)],
      effectivePayload: {
        operation: "image.edit",
        inputAssets: [{ assetId: "ref-1", binding: "guide" }],
      } as unknown as ParsedImageGenerationRequest,
      createdGeneratedAssetIds,
      createdAssetEdgeIds,
    });

    expect(createdGeneratedAssetIds).toEqual([
      "asset-generated-turn-1-1",
      "asset-generated-turn-1-2",
    ]);
    expect(createdAssetEdgeIds).toHaveLength(2);
    expect(result.assetEdges).toHaveLength(2);
  });
});
