import type { Asset, EditingAdjustments } from "@/types";
import {
  buildRenderGraph,
  withRenderGraphLayerAdjustments,
  type RenderGraph,
} from "../renderGraph";
import type { LayerPreviewEntry } from "./contracts";

export const applySelectedLayerPreviewAdjustments = (
  renderGraph: RenderGraph,
  selectedLayerId: string | null,
  adjustments: EditingAdjustments | null,
  filmProfile: Asset["filmProfile"] | null | undefined
) => {
  if (!selectedLayerId || !adjustments) {
    return renderGraph;
  }

  return withRenderGraphLayerAdjustments(
    renderGraph,
    selectedLayerId,
    adjustments,
    filmProfile
  );
};

export const renderGraphToLayerPreviewEntries = (
  renderGraph: RenderGraph
): LayerPreviewEntry[] =>
  renderGraph.layers.map((layer) => ({
    layer: layer.layer,
    sourceAsset: layer.sourceAsset,
    adjustments: layer.adjustments,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
  }));

export const buildPreviewRenderGraph = ({
  baseRenderGraph,
  selectedLayerId,
  adjustments,
  filmProfile,
}: {
  baseRenderGraph: RenderGraph;
  selectedLayerId: string | null;
  adjustments: EditingAdjustments | null;
  filmProfile: Asset["filmProfile"] | null | undefined;
}) =>
  applySelectedLayerPreviewAdjustments(
    buildRenderGraph({
      documentKey: baseRenderGraph.documentKey,
      sourceAsset: baseRenderGraph.sourceAsset,
      filmProfile,
      layerEntries: renderGraphToLayerPreviewEntries(baseRenderGraph),
      showOriginal: baseRenderGraph.showOriginal,
    }),
    selectedLayerId,
    adjustments,
    filmProfile
  );
