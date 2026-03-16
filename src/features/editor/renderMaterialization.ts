import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import { DEFAULT_EDITOR_ADJUSTMENT_GROUP_VISIBILITY } from "@/lib/editorAdjustmentVisibility";
import { ensureAssetLayers, resolveBaseLayer } from "@/lib/editorLayers";
import { sha256FromBlob } from "@/lib/hash";
import { resolveAspectRatio } from "@/lib/imageProcessing";
import { resolveAssetTimestampText } from "@/lib/timestamp";
import type { Asset, EditorLayer } from "@/types";
import { createRenderDocument, type RenderDocument } from "./document";
import { renderDocumentToCanvas } from "./renderDocumentCanvas";

export type RenderMaterializationIntent = "flatten" | "merge-down";

export interface RenderMaterializationPlan {
  intent: RenderMaterializationIntent;
  assetId: string;
  documentKey: string;
  renderGraphKey: string;
  layerIds: string[];
  targetLayerId: string | null;
}

export type RenderMaterializationUnsupportedReason =
  | "missing-layer"
  | "missing-target-layer"
  | "target-not-base";

export interface ResolvedRenderMaterialization {
  plan: RenderMaterializationPlan;
  document: RenderDocument;
  nextLayers: EditorLayer[];
}

export interface RenderMaterializationOutput {
  blob: Blob;
  contentHash: string;
  metadata: NonNullable<Asset["metadata"]>;
  thumbnailBlob?: Blob;
  type: Asset["type"];
  extension: string;
}

interface ResolveRenderMaterializationOptions {
  asset: Asset;
  assets: Asset[];
  intent: RenderMaterializationIntent;
  layerId?: string;
}

interface ExecuteRenderMaterializationOptions {
  asset: Asset;
  resolved: ResolvedRenderMaterialization;
}

const MATERIALIZATION_INTENT = "export-full" as const;
const MATERIALIZATION_KEY_PREFIX = "materialize";
const MATERIALIZATION_OUTPUT_QUALITY = 0.95;
const FALLBACK_OUTPUT_TYPE = "image/png";
const THUMBNAIL_MAX_DIMENSION = 480;
const THUMBNAIL_TYPE = "image/jpeg";
const THUMBNAIL_QUALITY = 0.82;

const MATERIALIZATION_OUTPUTS = {
  "image/jpeg": { extension: "jpg", quality: MATERIALIZATION_OUTPUT_QUALITY },
  "image/png": { extension: "png", quality: undefined },
  "image/webp": { extension: "webp", quality: MATERIALIZATION_OUTPUT_QUALITY },
} as const satisfies Partial<
  Record<Asset["type"], { extension: string; quality: number | undefined }>
>;

const buildMaterializationDocumentKey = (
  intent: RenderMaterializationIntent,
  assetId: string,
  layerId?: string
) =>
  [
    MATERIALIZATION_KEY_PREFIX,
    intent,
    assetId,
    layerId ? `layer:${layerId}` : null,
  ]
    .filter(Boolean)
    .join(":");

const resolveMaterializationOutput = (asset: Asset) =>
  (MATERIALIZATION_OUTPUTS[asset.type as keyof typeof MATERIALIZATION_OUTPUTS]
    ? {
        ...MATERIALIZATION_OUTPUTS[asset.type as keyof typeof MATERIALIZATION_OUTPUTS],
        type: undefined,
      }
    : {
        extension: "png",
        quality: undefined,
        type: FALLBACK_OUTPUT_TYPE,
      }) satisfies {
    extension: string;
    quality: number | undefined;
    type: Asset["type"] | undefined;
  };

const createMaterializedBaseLayer = (
  assetId: string,
  existingBase?: EditorLayer | null
): EditorLayer => ({
  id: existingBase?.id ?? `base-${assetId}`,
  name: existingBase?.name ?? "Background",
  type: "base",
  visible: true,
  opacity: 100,
  blendMode: "normal",
  adjustments: createDefaultAdjustments(),
  adjustmentVisibility: { ...DEFAULT_EDITOR_ADJUSTMENT_GROUP_VISIBILITY },
});

const createAssetRenderDocument = ({
  asset,
  assets,
  key,
  layers,
}: {
  asset: Asset;
  assets: Asset[];
  key: string;
  layers?: EditorLayer[];
}) =>
  createRenderDocument({
    key,
    assetById: new Map(assets.map((entry) => [entry.id, entry])),
    documentAsset: asset,
    layers: layers ?? ensureAssetLayers(asset),
    adjustments: normalizeAdjustments(asset.adjustments ?? createDefaultAdjustments()),
    filmProfile: asset.filmProfile ?? undefined,
    showOriginal: false,
  });

const resolveQuarterTurns = (rightAngleRotation: number) => {
  const quarterTurns = Math.round(rightAngleRotation / 90);
  return ((quarterTurns % 4) + 4) % 4;
};

const resolveSourceSize = async (asset: Asset) => {
  const metadataWidth = asset.metadata?.width ?? 0;
  const metadataHeight = asset.metadata?.height ?? 0;
  if (metadataWidth > 0 && metadataHeight > 0) {
    return {
      width: metadataWidth,
      height: metadataHeight,
    };
  }

  if (typeof createImageBitmap !== "function") {
    return {
      width: Math.max(1, metadataWidth || 1),
      height: Math.max(1, metadataHeight || 1),
    };
  }

  const sourceBlob: Blob = asset.blob
    ? asset.blob
    : await fetch(asset.objectUrl).then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load source asset for render-backed materialization.");
        }
        return response.blob();
      });

  const bitmap = await createImageBitmap(sourceBlob, {
    imageOrientation: "from-image",
  });
  try {
    return {
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
};

const resolveMaterializationTargetSize = async (asset: Asset) => {
  const adjustments = normalizeAdjustments(asset.adjustments ?? createDefaultAdjustments());
  const sourceSize = await resolveSourceSize(asset);
  const quarterTurns = resolveQuarterTurns(adjustments.rightAngleRotation);
  const orientedWidth = quarterTurns % 2 === 1 ? sourceSize.height : sourceSize.width;
  const orientedHeight = quarterTurns % 2 === 1 ? sourceSize.width : sourceSize.height;
  const fallbackRatio = orientedWidth / Math.max(1, orientedHeight);
  const targetRatio = resolveAspectRatio(
    adjustments.aspectRatio,
    adjustments.customAspectRatio,
    fallbackRatio
  );
  const sourceRatio = orientedWidth / Math.max(1, orientedHeight);

  let cropWidth = orientedWidth;
  let cropHeight = orientedHeight;
  if (Math.abs(sourceRatio - targetRatio) > 0.001) {
    if (sourceRatio > targetRatio) {
      cropWidth = orientedHeight * targetRatio;
    } else {
      cropHeight = orientedWidth / targetRatio;
    }
  }

  return {
    width: Math.max(1, Math.round(cropWidth)),
    height: Math.max(1, Math.round(cropHeight)),
  };
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode render-backed materialization."));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });

const createThumbnailBlobFromCanvas = async (sourceCanvas: HTMLCanvasElement) => {
  const maxDimension = Math.max(sourceCanvas.width, sourceCanvas.height);
  const scale =
    maxDimension > THUMBNAIL_MAX_DIMENSION
      ? THUMBNAIL_MAX_DIMENSION / Math.max(1, maxDimension)
      : 1;
  const thumbnailCanvas = globalThis.document.createElement("canvas");
  thumbnailCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  thumbnailCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));

  try {
    const context = thumbnailCanvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to acquire thumbnail canvas context.");
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(sourceCanvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
    return await canvasToBlob(thumbnailCanvas, THUMBNAIL_TYPE, THUMBNAIL_QUALITY);
  } finally {
    thumbnailCanvas.width = 0;
    thumbnailCanvas.height = 0;
  }
};

export const createFlattenMaterializationPlan = (
  document: RenderDocument
): RenderMaterializationPlan => ({
  intent: "flatten",
  assetId: document.sourceAssetId,
  documentKey: document.documentKey,
  renderGraphKey: document.renderGraph.key,
  layerIds: document.layerStack.map((layer) => layer.id),
  targetLayerId: null,
});

export const createMergeDownMaterializationPlan = (
  document: RenderDocument,
  layerId: string
): RenderMaterializationPlan | null => {
  const layerIndex = document.layerStack.findIndex((layer) => layer.id === layerId);
  if (layerIndex < 0) {
    return null;
  }
  const targetLayer = document.layerStack[layerIndex + 1] ?? null;
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

export const resolveRenderMaterialization = ({
  asset,
  assets,
  intent,
  layerId,
}: ResolveRenderMaterializationOptions):
  | { supported: true; value: ResolvedRenderMaterialization }
  | { supported: false; reason: RenderMaterializationUnsupportedReason } => {
  const layers = ensureAssetLayers(asset);
  const baseLayer = resolveBaseLayer(layers);

  if (intent === "flatten") {
    const document = createAssetRenderDocument({
      asset,
      assets,
      key: buildMaterializationDocumentKey(intent, asset.id),
    });

    return {
      supported: true,
      value: {
        plan: createFlattenMaterializationPlan(document),
        document,
        nextLayers: [createMaterializedBaseLayer(asset.id, baseLayer)],
      },
    };
  }

  if (!layerId) {
    return {
      supported: false,
      reason: "missing-layer",
    };
  }

  const fullDocument = createAssetRenderDocument({
    asset,
    assets,
    key: buildMaterializationDocumentKey(intent, asset.id, layerId),
  });
  const plan = createMergeDownMaterializationPlan(fullDocument, layerId);
  if (!plan) {
    return {
      supported: false,
      reason: "missing-target-layer",
    };
  }

  const targetLayer = layers.find((layer) => layer.id === plan.targetLayerId) ?? null;
  const selectedLayer = layers.find((layer) => layer.id === layerId) ?? null;
  if (!selectedLayer) {
    return {
      supported: false,
      reason: "missing-layer",
    };
  }
  if (!targetLayer) {
    return {
      supported: false,
      reason: "missing-target-layer",
    };
  }
  if (targetLayer.type !== "base") {
    return {
      supported: false,
      reason: "target-not-base",
    };
  }

  const mergeDocument = createAssetRenderDocument({
    asset,
    assets,
    key: `${buildMaterializationDocumentKey(intent, asset.id, layerId)}:pair`,
    layers: [selectedLayer, targetLayer],
  });

  return {
    supported: true,
    value: {
      plan,
      document: mergeDocument,
      nextLayers: layers
        .filter((layer) => layer.id !== selectedLayer.id)
        .map((layer) =>
          layer.id === targetLayer.id
            ? createMaterializedBaseLayer(asset.id, targetLayer)
            : layer
        ),
    },
  };
};

export const isRenderMaterializationPlanCurrent = (
  plan: RenderMaterializationPlan,
  options: ResolveRenderMaterializationOptions
) => {
  const resolved = resolveRenderMaterialization(options);
  if (!resolved.supported) {
    return false;
  }
  const nextPlan = resolved.value.plan;
  return (
    nextPlan.assetId === plan.assetId &&
    nextPlan.documentKey === plan.documentKey &&
    nextPlan.renderGraphKey === plan.renderGraphKey &&
    nextPlan.targetLayerId === plan.targetLayerId &&
    nextPlan.layerIds.length === plan.layerIds.length &&
    nextPlan.layerIds.every((layerId, index) => layerId === plan.layerIds[index])
  );
};

export const describeRenderMaterializationUnsupportedReason = (
  reason: RenderMaterializationUnsupportedReason
) => {
  switch (reason) {
    case "missing-layer":
      return "Layer materialization target no longer exists.";
    case "missing-target-layer":
      return "Merge-down target layer is no longer available.";
    case "target-not-base":
      return "Only merge-down into the base layer is supported by the current render-backed materialization path.";
    default:
      return "Render-backed materialization is not available for the current layer selection.";
  }
};

export const executeRenderMaterialization = async ({
  asset,
  resolved,
}: ExecuteRenderMaterializationOptions): Promise<RenderMaterializationOutput> => {
  const targetSize = await resolveMaterializationTargetSize(asset);
  const renderCanvas = globalThis.document.createElement("canvas");
  const { extension, quality, type } = resolveMaterializationOutput(asset);

  try {
    await renderDocumentToCanvas({
      canvas: renderCanvas,
      document: resolved.document,
      intent: MATERIALIZATION_INTENT,
      targetSize,
      timestampText: resolveAssetTimestampText(asset.metadata, asset.createdAt),
      strictErrors: true,
    });

    const outputType = (type ?? asset.type) as Asset["type"];
    const blob = await canvasToBlob(renderCanvas, outputType, quality);
    const [thumbnailBlob, contentHash] = await Promise.all([
      createThumbnailBlobFromCanvas(renderCanvas),
      sha256FromBlob(blob),
    ]);

    return {
      blob,
      contentHash,
      metadata: {
        ...asset.metadata,
        width: renderCanvas.width,
        height: renderCanvas.height,
      },
      thumbnailBlob,
      type: outputType,
      extension,
    };
  } finally {
    renderCanvas.width = 0;
    renderCanvas.height = 0;
  }
};
