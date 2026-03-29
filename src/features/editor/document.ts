import { buildEditorLayerRenderEntries, type EditorLayerRenderEntry } from "./renderPreparation";
import { buildRenderDocumentDependencyKey } from "./renderDependencies";
import {
  buildRenderDocumentDirtyKeys,
  buildRenderGraph,
  resolveDirtyReasons,
  type DirtyKeyMap,
  type DirtyReason,
  type RenderGraph,
} from "./renderGraph";
import type { Asset, EditingAdjustments, EditorLayer } from "@/types";

export interface RenderDocument {
  key: string;
  documentKey: string;
  sourceAsset: Asset;
  sourceAssetId: string;
  layerStack: EditorLayer[];
  adjustments: EditingAdjustments;
  filmProfile: Asset["filmProfile"] | null | undefined;
  renderGraph: RenderGraph;
  dirtyKeys: DirtyKeyMap;
  dirtyReasons: DirtyReason[];
  layerEntries: EditorLayerRenderEntry[];
  showOriginal: boolean;
}

interface CreateRenderDocumentInput {
  key: string;
  assetById: Map<string, Asset>;
  documentAsset: Asset;
  layers: EditorLayer[];
  adjustments: EditingAdjustments;
  filmProfile: Asset["filmProfile"] | null | undefined;
  showOriginal?: boolean;
  previousDocument?: RenderDocument | null;
}

export const createRenderDocument = ({
  key,
  assetById,
  documentAsset,
  layers,
  adjustments,
  filmProfile,
  showOriginal = false,
  previousDocument = null,
}: CreateRenderDocumentInput): RenderDocument => {
  const documentKey = buildRenderDocumentDependencyKey(key, assetById, layers);
  const layerEntries = buildEditorLayerRenderEntries({
    assetById,
    documentAsset,
    documentAdjustments: adjustments,
    layers,
  });
  const renderGraph = buildRenderGraph({
    documentKey,
    sourceAsset: documentAsset,
    filmProfile,
    layerEntries,
    showOriginal,
  });
  const dirtyKeys = buildRenderDocumentDirtyKeys({
    documentKey,
    sourceAsset: documentAsset,
    adjustments,
    filmProfile,
    showOriginal,
    renderGraph,
  });

  return {
    key,
    documentKey,
    sourceAsset: documentAsset,
    sourceAssetId: documentAsset.id,
    layerStack: [...layers],
    adjustments,
    filmProfile,
    renderGraph,
    dirtyKeys,
    dirtyReasons: resolveDirtyReasons(previousDocument?.dirtyKeys, dirtyKeys),
    layerEntries,
    showOriginal,
  };
};
