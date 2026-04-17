import type { ConversationCreativeState } from "../../domain/prompt";
import type {
  PersistedAssetEdgeRecord,
  PersistedAssetRecord,
  PersistedGenerationTurn,
  PersistedThreadCreativeBrief,
} from "../persistence/models";

export const buildCreativeBrief = (
  turns: PersistedGenerationTurn[],
  promptState: ConversationCreativeState
): PersistedThreadCreativeBrief => {
  const latestTurn = turns[0] ?? null;
  return {
    latestPrompt: latestTurn?.prompt ?? null,
    latestModelId: latestTurn?.modelId ?? null,
    acceptedAssetId: promptState.baseAssetId ?? null,
    selectedAssetIds: latestTurn?.primaryAssetIds ?? [],
    recentAssetRefIds: latestTurn?.referencedAssetIds ?? [],
  };
};

export const filterAssetsByVisibleScope = (
  assets: PersistedAssetRecord[],
  visibleTurnIds: ReadonlySet<string>,
  visibleRunIds: ReadonlySet<string>
): PersistedAssetRecord[] =>
  assets.filter(
    (asset) =>
      (asset.turnId ? visibleTurnIds.has(asset.turnId) : false) ||
      (asset.runId ? visibleRunIds.has(asset.runId) : false)
  );

export const filterAssetEdgesByVisibleAssets = (
  edges: PersistedAssetEdgeRecord[],
  visibleAssetIds: ReadonlySet<string>
): PersistedAssetEdgeRecord[] =>
  edges.filter(
    (edge) =>
      visibleAssetIds.has(edge.sourceAssetId) && visibleAssetIds.has(edge.targetAssetId)
  );
