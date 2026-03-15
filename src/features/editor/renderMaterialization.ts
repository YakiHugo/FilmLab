import type { RenderDocument } from "./document";

export type RenderMaterializationIntent = "flatten" | "merge-down";

export interface RenderMaterializationPlan {
  intent: RenderMaterializationIntent;
  assetId: string;
  documentKey: string;
  renderGraphKey: string;
  layerIds: string[];
  targetLayerId: string | null;
}

export const createFlattenMaterializationPlan = (
  document: RenderDocument
): RenderMaterializationPlan => ({
  intent: "flatten",
  assetId: document.sourceAssetId,
  documentKey: document.documentKey,
  renderGraphKey: document.renderGraph.key,
  layerIds: document.renderGraph.layers.map((layer) => layer.id),
  targetLayerId: null,
});

export const createMergeDownMaterializationPlan = (
  document: RenderDocument,
  layerId: string
): RenderMaterializationPlan | null => {
  const layerIndex = document.renderGraph.layers.findIndex((layer) => layer.id === layerId);
  if (layerIndex < 0) {
    return null;
  }
  const targetLayer = document.renderGraph.layers[layerIndex + 1] ?? null;
  if (!targetLayer) {
    return null;
  }

  return {
    intent: "merge-down",
    assetId: document.sourceAssetId,
    documentKey: document.documentKey,
    renderGraphKey: document.renderGraph.key,
    layerIds: [layerId, targetLayer.id],
    targetLayerId: targetLayer.id,
  };
};
