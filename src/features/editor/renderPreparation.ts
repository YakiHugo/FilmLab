import { applyAdjustmentGroupVisibility } from "@/lib/editorAdjustmentVisibility";
import { resolveLayerAdjustments } from "@/lib/editorLayers";
import type { Asset, EditingAdjustments, EditorLayer, EditorLayerBlendMode } from "@/types";

export interface EditorLayerRenderEntry {
  layer: EditorLayer;
  sourceAsset: Asset;
  adjustments: EditingAdjustments;
  opacity: number;
  blendMode: EditorLayerBlendMode;
}

interface BuildEditorLayerRenderEntriesOptions {
  assetById: Map<string, Asset>;
  documentAsset: Asset;
  layers: EditorLayer[];
}

export const buildEditorLayerRenderEntries = ({
  assetById,
  documentAsset,
  layers,
}: BuildEditorLayerRenderEntriesOptions): EditorLayerRenderEntry[] =>
  layers
    .map((layer) => {
      const sourceAsset =
        layer.type === "texture" && layer.textureAssetId
          ? assetById.get(layer.textureAssetId) ?? null
          : documentAsset;
      if (!sourceAsset || !layer.visible) {
        return null;
      }
      const opacity = Math.max(0, Math.min(1, layer.opacity / 100));
      if (opacity <= 0.0001) {
        return null;
      }
      return {
        layer,
        sourceAsset,
        opacity,
        blendMode: layer.blendMode,
        adjustments: applyAdjustmentGroupVisibility(
          resolveLayerAdjustments(layer, documentAsset.adjustments),
          layer.adjustmentVisibility
        ),
      };
    })
    .filter((entry): entry is EditorLayerRenderEntry => Boolean(entry));
