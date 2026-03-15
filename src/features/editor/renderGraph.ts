import type { EditorLayerRenderEntry } from "./renderPreparation";
import type { Asset, EditingAdjustments, LocalAdjustment } from "@/types";

export const RENDER_GRAPH_PHASES = ["develop", "film", "fx", "output"] as const;

export type RenderGraphPhase = (typeof RENDER_GRAPH_PHASES)[number];

export const DIRTY_REASONS = [
  "source",
  "layer-stack",
  "layer-adjustments",
  "layer-mask",
  "document-adjustments",
  "film-profile",
  "local-adjustments",
  "roi",
] as const;

export type DirtyReason = (typeof DIRTY_REASONS)[number];

export type DirtyKeyMap = Record<DirtyReason, string>;

export interface ScopedLocalAdjustmentNode {
  id: string;
  key: string;
  phase: "develop";
  enabled: boolean;
  amount: number;
  mask: LocalAdjustment["mask"];
  adjustments: LocalAdjustment["adjustments"];
}

export interface RenderLayerNode {
  id: string;
  key: string;
  layer: EditorLayerRenderEntry["layer"];
  sourceAsset: Asset;
  sourceAssetId: string;
  opacity: number;
  blendMode: EditorLayerRenderEntry["blendMode"];
  adjustments: EditingAdjustments;
  mask: EditorLayerRenderEntry["layer"]["mask"];
  scopedLocalAdjustments: ScopedLocalAdjustmentNode[];
  phaseKeys: Record<RenderGraphPhase, string>;
}

export interface RenderGraph {
  key: string;
  documentKey: string;
  phases: typeof RENDER_GRAPH_PHASES;
  sourceAsset: Asset;
  sourceAssetId: string;
  showOriginal: boolean;
  layers: RenderLayerNode[];
}

interface BuildRenderGraphOptions {
  documentKey: string;
  sourceAsset: Asset;
  filmProfile: Asset["filmProfile"] | null | undefined;
  layerEntries: EditorLayerRenderEntry[];
  showOriginal: boolean;
}

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const serialize = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
};

const stripLocalAdjustments = (adjustments: EditingAdjustments): EditingAdjustments => ({
  ...adjustments,
  localAdjustments: [],
});

const hashSerialized = (value: unknown) => hashString(serialize(value));

const resolveLocalAdjustmentNodes = (
  localAdjustments: LocalAdjustment[] | undefined
): ScopedLocalAdjustmentNode[] =>
  (localAdjustments ?? []).map((local, index) => ({
    id: local.id || `local-${index}`,
    key: hashSerialized({
      id: local.id || index,
      enabled: local.enabled,
      amount: local.amount,
      mask: local.mask,
      adjustments: local.adjustments,
    }),
    phase: "develop",
    enabled: local.enabled,
    amount: local.amount,
    mask: local.mask,
    adjustments: local.adjustments,
  }));

const resolveLayerFilmProfile = (
  sourceAsset: Asset,
  sourceAssetId: string,
  filmProfile: Asset["filmProfile"] | null | undefined
) => (sourceAsset.id === sourceAssetId ? filmProfile ?? undefined : sourceAsset.filmProfile ?? undefined);

const buildLayerNode = (
  entry: EditorLayerRenderEntry,
  sourceAssetId: string,
  filmProfile: Asset["filmProfile"] | null | undefined
): RenderLayerNode => {
  const scopedLocalAdjustments = resolveLocalAdjustmentNodes(entry.adjustments.localAdjustments);
  const baseAdjustments = stripLocalAdjustments(entry.adjustments);
  const resolvedFilmProfile = resolveLayerFilmProfile(entry.sourceAsset, sourceAssetId, filmProfile);
  const sourceFingerprint = hashSerialized({
    assetId: entry.sourceAsset.id,
    objectUrl: entry.sourceAsset.objectUrl,
    contentHash: entry.sourceAsset.contentHash ?? "",
    size: entry.sourceAsset.size,
  });
  const developKey = hashSerialized({
    layerId: entry.layer.id,
    adjustments: baseAdjustments,
    scopedLocalAdjustments: scopedLocalAdjustments.map((local) => ({
      id: local.id,
      key: local.key,
      phase: local.phase,
    })),
  });
  const filmKey = hashSerialized({
    layerId: entry.layer.id,
    filmProfileId: entry.sourceAsset.id === sourceAssetId ? "document-film" : entry.sourceAsset.filmProfileId,
    filmProfile: resolvedFilmProfile ?? null,
  });
  const fxKey = hashSerialized({
    layerId: entry.layer.id,
    mask: entry.layer.mask ?? null,
    opacity: entry.opacity,
    blendMode: entry.blendMode,
  });

  return {
    id: entry.layer.id,
    key: hashSerialized({
      layerId: entry.layer.id,
      sourceFingerprint,
      developKey,
      filmKey,
      fxKey,
    }),
    layer: entry.layer,
    sourceAsset: entry.sourceAsset,
    sourceAssetId: entry.sourceAsset.id,
    opacity: entry.opacity,
    blendMode: entry.blendMode,
    adjustments: entry.adjustments,
    mask: entry.layer.mask,
    scopedLocalAdjustments,
    phaseKeys: {
      develop: developKey,
      film: filmKey,
      fx: fxKey,
      output: hashSerialized({
        layerId: entry.layer.id,
        sourceFingerprint,
      }),
    },
  };
};

export const buildRenderGraph = ({
  documentKey,
  sourceAsset,
  filmProfile,
  layerEntries,
  showOriginal,
}: BuildRenderGraphOptions): RenderGraph => {
  const layers = layerEntries.map((entry) =>
    buildLayerNode(entry, sourceAsset.id, showOriginal ? undefined : filmProfile)
  );

  return {
    key: hashSerialized({
      documentKey,
      showOriginal,
      layers: layers.map((layer) => ({
        id: layer.id,
        key: layer.key,
      })),
    }),
    documentKey,
    phases: RENDER_GRAPH_PHASES,
    sourceAsset,
    sourceAssetId: sourceAsset.id,
    showOriginal,
    layers,
  };
};

interface BuildRenderDocumentDirtyKeysOptions {
  documentKey: string;
  sourceAsset: Asset;
  adjustments: EditingAdjustments;
  filmProfile: Asset["filmProfile"] | null | undefined;
  showOriginal: boolean;
  renderGraph: RenderGraph;
}

const createEmptyDirtyKeyMap = (): DirtyKeyMap => ({
  source: "",
  "layer-stack": "",
  "layer-adjustments": "",
  "layer-mask": "",
  "document-adjustments": "",
  "film-profile": "",
  "local-adjustments": "",
  roi: "",
});

export const buildRenderDocumentDirtyKeys = ({
  documentKey,
  sourceAsset,
  adjustments,
  filmProfile,
  showOriginal,
  renderGraph,
}: BuildRenderDocumentDirtyKeysOptions): DirtyKeyMap => {
  const dirtyKeys = createEmptyDirtyKeyMap();
  const layerStackFingerprint = renderGraph.layers.map((layer) => ({
    id: layer.id,
    sourceAssetId: layer.sourceAssetId,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
  }));
  const layerAdjustmentFingerprint = renderGraph.layers.map((layer) => ({
    id: layer.id,
    adjustments: stripLocalAdjustments(layer.adjustments),
  }));
  const layerMaskFingerprint = renderGraph.layers.map((layer) => ({
    id: layer.id,
    mask: layer.mask ?? null,
  }));
  const localAdjustmentFingerprint = renderGraph.layers.map((layer) => ({
    id: layer.id,
    localAdjustments: layer.scopedLocalAdjustments.map((local) => ({
      id: local.id,
      key: local.key,
    })),
  }));
  const filmProfileFingerprint = renderGraph.layers.map((layer) => ({
    id: layer.id,
    filmProfileId: layer.sourceAsset.filmProfileId ?? null,
    filmProfile:
      layer.sourceAsset.id === sourceAsset.id
        ? showOriginal
          ? null
          : filmProfile ?? null
        : layer.sourceAsset.filmProfile ?? null,
  }));

  dirtyKeys.source = hashSerialized({
    documentKey,
    sourceAssetId: sourceAsset.id,
    objectUrl: sourceAsset.objectUrl,
    contentHash: sourceAsset.contentHash ?? "",
    size: sourceAsset.size,
    layers: renderGraph.layers.map((layer) => ({
      id: layer.id,
      sourceAssetId: layer.sourceAssetId,
      sourceObjectUrl: layer.sourceAsset.objectUrl,
      sourceContentHash: layer.sourceAsset.contentHash ?? "",
      sourceSize: layer.sourceAsset.size,
    })),
  });
  dirtyKeys["layer-stack"] = hashSerialized(layerStackFingerprint);
  dirtyKeys["layer-adjustments"] = hashSerialized(layerAdjustmentFingerprint);
  dirtyKeys["layer-mask"] = hashSerialized(layerMaskFingerprint);
  dirtyKeys["document-adjustments"] = hashSerialized({
    showOriginal,
    adjustments: stripLocalAdjustments(adjustments),
  });
  dirtyKeys["film-profile"] = hashSerialized(filmProfileFingerprint);
  dirtyKeys["local-adjustments"] = hashSerialized(localAdjustmentFingerprint);

  return dirtyKeys;
};

export const resolveDirtyReasons = (
  previousDirtyKeys: Partial<DirtyKeyMap> | null | undefined,
  nextDirtyKeys: DirtyKeyMap
): DirtyReason[] =>
  DIRTY_REASONS.filter((reason) => {
    const nextKey = nextDirtyKeys[reason];
    if (!nextKey) {
      return false;
    }
    if (!previousDirtyKeys) {
      return true;
    }
    return previousDirtyKeys[reason] !== nextKey;
  });

export const buildViewportRoiDirtyKey = (
  viewportRoi:
    | {
        x: number;
        y: number;
        width: number;
        height: number;
      }
    | null
) => hashSerialized(viewportRoi ?? null);
