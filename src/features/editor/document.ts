import { buildEditorLayerRenderEntries, type EditorLayerRenderEntry } from "./renderPreparation";
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
  assetById: Map<string, Asset>;
  layers: EditorLayer[];
  selectedLayer: EditorLayer | null;
  selectedLayerAdjustments: EditingAdjustments | null;
  selectedLayerAdjustmentVisibility: EditorAdjustmentGroupVisibility;
  localAdjustments: LocalAdjustment[];
  selectedLocalAdjustmentId: string | null;
  selectedLocalAdjustment: LocalAdjustment | null;
}

export interface RenderDocument {
  key: string;
  documentKey: string;
  sourceAsset: Asset;
  sourceAssetId: string;
  adjustments: EditingAdjustments;
  filmProfile: Asset["filmProfile"] | null | undefined;
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

  return {
    key: `editor:${selectedAsset.id}`,
    documentKey: `editor:${selectedAsset.id}`,
    asset: selectedAsset,
    assetById,
    layers,
    selectedLayer,
    selectedLayerAdjustments,
    selectedLayerAdjustmentVisibility,
    localAdjustments,
    selectedLocalAdjustmentId,
    selectedLocalAdjustment: resolveSelectedLocalAdjustment(
      localAdjustments,
      selectedLocalAdjustmentId
    ),
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
}

export const createRenderDocument = ({
  key,
  assetById,
  documentAsset,
  layers,
  adjustments,
  filmProfile,
  showOriginal = false,
}: CreateRenderDocumentInput): RenderDocument => ({
  key,
  documentKey: key,
  sourceAsset: documentAsset,
  sourceAssetId: documentAsset.id,
  adjustments,
  filmProfile,
  layerEntries: buildEditorLayerRenderEntries({
    assetById,
    documentAsset,
    layers,
  }),
  showOriginal,
});
