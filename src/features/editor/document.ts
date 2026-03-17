import { createDefaultAdjustments } from "@/lib/adjustments";
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
import { resolveSelectedLocalAdjustment } from "./localAdjustments";
import type { RenderIntent as EditorRenderIntent } from "@/lib/renderIntent";
import type {
  Asset,
  EditingAdjustments,
  EditorAdjustmentGroupVisibility,
  EditorLayer,
  LocalAdjustment,
} from "@/types";

export type RenderIntent = EditorRenderIntent;

export interface EditorDocument {
  key: string;
  documentKey: string;
  asset: Asset;
  sourceAsset: Asset;
  sourceAssetId: string;
  assetById: Map<string, Asset>;
  layers: EditorLayer[];
  selectedLayer: EditorLayer | null;
  selectedLayerId: string | null;
  selectedLayerAdjustments: EditingAdjustments | null;
  selectedLayerAdjustmentVisibility: EditorAdjustmentGroupVisibility;
  localAdjustments: LocalAdjustment[];
  selectedLocalAdjustmentId: string | null;
  selectedLocalAdjustment: LocalAdjustment | null;
  dependencyKeys: Omit<DirtyKeyMap, "roi">;
}

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

interface CreateEditorDocumentInput {
  assets: Asset[];
  selectedAsset: Asset;
  layers: EditorLayer[];
  selectedLayer: EditorLayer | null;
  selectedLayerAdjustments: EditingAdjustments | null;
  selectedLayerAdjustmentVisibility: EditorAdjustmentGroupVisibility;
  selectedLocalAdjustmentId: string | null;
}

export const createEditorDocument = ({
  assets,
  selectedAsset,
  layers,
  selectedLayer,
  selectedLayerAdjustments,
  selectedLayerAdjustmentVisibility,
  selectedLocalAdjustmentId,
}: CreateEditorDocumentInput): EditorDocument => {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const localAdjustments = selectedLayerAdjustments?.localAdjustments ?? [];
  const documentKey = `editor:${selectedAsset.id}`;
  const layerEntries = buildEditorLayerRenderEntries({
    assetById,
    documentAsset: selectedAsset,
    layers,
  });
  const renderGraph = buildRenderGraph({
    documentKey,
    sourceAsset: selectedAsset,
    filmProfile: selectedAsset.filmProfile ?? undefined,
    layerEntries,
    showOriginal: false,
  });
  const dependencyKeys = buildRenderDocumentDirtyKeys({
    documentKey,
    sourceAsset: selectedAsset,
    adjustments:
      selectedLayerAdjustments ?? selectedAsset.adjustments ?? createDefaultAdjustments(),
    filmProfile: selectedAsset.filmProfile ?? undefined,
    showOriginal: false,
    renderGraph,
  });

  return {
    key: documentKey,
    documentKey,
    asset: selectedAsset,
    sourceAsset: selectedAsset,
    sourceAssetId: selectedAsset.id,
    assetById,
    layers,
    selectedLayer,
    selectedLayerId: selectedLayer?.id ?? null,
    selectedLayerAdjustments,
    selectedLayerAdjustmentVisibility,
    localAdjustments,
    selectedLocalAdjustmentId,
    selectedLocalAdjustment: resolveSelectedLocalAdjustment(
      localAdjustments,
      selectedLocalAdjustmentId
    ),
    dependencyKeys: {
      source: dependencyKeys.source,
      "layer-stack": dependencyKeys["layer-stack"],
      "layer-adjustments": dependencyKeys["layer-adjustments"],
      "layer-mask": dependencyKeys["layer-mask"],
      "document-adjustments": dependencyKeys["document-adjustments"],
      "film-profile": dependencyKeys["film-profile"],
      "local-adjustments": dependencyKeys["local-adjustments"],
    },
  };
};

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
