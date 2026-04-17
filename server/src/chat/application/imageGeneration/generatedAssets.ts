import type { AssetService } from "../../../assets/service";
import { createId } from "../../../../../shared/createId";
import type { ImageProviderId } from "../../../../../shared/imageGeneration";
import type {
  PersistedAssetEdgeRecord,
  PersistedAssetRecord,
  PersistedPromptSnapshot,
} from "../../persistence/models";
import type { ParsedImageGenerationRequest } from "../../../shared/imageGenerationSchema";
import { resolveEdgeType } from "./helpers";
import type { NormalizedGeneratedImageEntry } from "./imageNormalization";

export type AssetizedImage = {
  resultId: string;
  assetId: string;
  imageUrl: string;
  thumbnailUrl: string;
  created: boolean;
  provider: ImageProviderId;
  model: string;
  mimeType?: string;
  revisedPrompt: string | null;
  index: number;
};

export type CommitGeneratedAssetsInput = {
  userId: string;
  conversationId: string;
  turnId: string;
  runId: string;
  completedAt: string;
  normalizedImages: NormalizedGeneratedImageEntry[];
  effectivePayload: ParsedImageGenerationRequest;
  completedPrompt: PersistedPromptSnapshot;
  // Mutable accumulators so the caller can clean up partial state if this
  // helper throws mid-loop (asset creation is not transactional).
  createdGeneratedAssetIds: string[];
  createdAssetEdgeIds: string[];
};

export type CommitGeneratedAssetsResult = {
  assetizedImages: AssetizedImage[];
  assets: PersistedAssetRecord[];
  assetEdges: PersistedAssetEdgeRecord[];
};

export const commitGeneratedAssets = async (
  assetService: AssetService,
  input: CommitGeneratedAssetsInput
): Promise<CommitGeneratedAssetsResult> => {
  const { userId, conversationId, turnId, runId, completedAt, createdGeneratedAssetIds, createdAssetEdgeIds } = input;
  const assetizedImages: AssetizedImage[] = [];

  for (const [index, image] of input.normalizedImages.entries()) {
    const createdAsset = await assetService.createGeneratedAsset({
      userId,
      name: `generated-${turnId}-${index + 1}`,
      mimeType: image.mimeType ?? "image/png",
      buffer: image.buffer,
      createdAt: completedAt,
      source: "ai-generated",
      origin: "ai",
      metadata: {
        runtimeProvider: image.provider,
        providerModel: image.model,
        revisedPrompt: image.revisedPrompt ?? null,
        index,
      },
    });
    if (createdAsset.created) {
      createdGeneratedAssetIds.push(createdAsset.assetId);
    }

    assetizedImages.push({
      resultId: createId("chat-result"),
      assetId: createdAsset.assetId,
      imageUrl: createdAsset.objectUrl,
      thumbnailUrl: createdAsset.thumbnailUrl,
      created: createdAsset.created,
      provider: image.provider,
      model: image.model,
      mimeType: createdAsset.type,
      revisedPrompt: image.revisedPrompt,
      index: image.index,
    });
  }

  const assets: PersistedAssetRecord[] = assetizedImages.map((image, index) => ({
    id: image.assetId,
    turnId,
    runId,
    assetType: "image" as const,
    label: `Generated image ${index + 1}`,
    metadata: {
      imageUrl: image.imageUrl,
      thumbnailUrl: image.thumbnailUrl,
      mimeType: image.mimeType ?? null,
      runtimeProvider: image.provider,
      providerModel: image.model,
      index,
      revisedPrompt: image.revisedPrompt ?? null,
    },
    locators: [
      {
        id: createId("thread-locator"),
        assetId: image.assetId,
        locatorType: "remote_url" as const,
        locatorValue: image.imageUrl,
        mimeType: image.mimeType,
        expiresAt: null,
      },
    ],
    createdAt: completedAt,
  }));

  const assetEdges: PersistedAssetEdgeRecord[] = (input.effectivePayload.inputAssets ?? []).flatMap(
    (inputAsset) =>
      assets.map((asset) => ({
        id: createId("thread-edge"),
        sourceAssetId: inputAsset.assetId,
        targetAssetId: asset.id,
        edgeType: resolveEdgeType(inputAsset, input.effectivePayload.operation, input.completedPrompt),
        turnId,
        runId,
        createdAt: completedAt,
      }))
  );

  await assetService.createAssetEdges(
    assetEdges.map((edge) => ({
      ...edge,
      conversationId,
    }))
  );
  // createAssetEdges commits all rows in one transaction, so edge IDs only
  // become rollback-candidates after the call returns successfully.
  for (const edge of assetEdges) {
    createdAssetEdgeIds.push(edge.id);
  }

  return {
    assetizedImages,
    assets,
    assetEdges,
  };
};
