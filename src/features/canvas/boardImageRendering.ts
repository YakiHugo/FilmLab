import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import { ensureAssetLayers } from "@/lib/editorLayers";
import { getBuiltInFilmProfile } from "@/lib/film";
import type { RenderIntent } from "@/lib/renderIntent";
import { resolveAssetTimestampText } from "@/lib/timestamp";
import type { Asset, CanvasImageElement, EditingAdjustments } from "@/types";
import { createRenderDocument, type RenderDocument } from "@/features/editor/document";
import { renderDocumentToCanvas } from "@/features/editor/renderDocumentCanvas";
import { applyCanvasImagePostProcessing } from "./canvasImagePostProcessing";

export type BoardPreviewPriority = "interactive" | "background";

export interface CanvasImageRenderTargetSize {
  width: number;
  height: number;
}

export interface CanvasImageRenderContext {
  adjustments: EditingAdjustments;
  cacheKey: string;
  filmProfile: Asset["filmProfile"] | undefined;
  renderDocument: RenderDocument;
  renderVariant: BoardPreviewPriority;
  targetSize: CanvasImageRenderTargetSize;
  timestampText: string | null;
}

export interface CanvasImageDocumentRenderContext {
  adjustments: EditingAdjustments;
  filmProfile: Asset["filmProfile"] | undefined;
  renderDocument: RenderDocument;
  timestampText: string | null;
}

const DEFAULT_ADJUSTMENTS = createDefaultAdjustments();
const PREVIEW_TARGET_LIMITS: Record<BoardPreviewPriority, number> = {
  interactive: 2560,
  background: 3072,
};
const PREVIEW_PIXEL_RATIO_CAP: Record<BoardPreviewPriority, number> = {
  interactive: 2,
  background: 2.5,
};
const PREVIEW_SCALE_MULTIPLIER: Record<BoardPreviewPriority, number> = {
  interactive: 0.9,
  background: 1,
};
const PREVIEW_TARGET_BUCKETS = [256, 384, 512, 640, 768, 896, 1024, 1280, 1536, 1792, 2048, 2560, 3072] as const;

const clampPreviewDimension = (value: number) => Math.max(128, Math.round(value));
const clampAspectPreservingDimension = (value: number) => Math.max(1, Math.round(value));

const resolveBucketedPreviewDimension = (value: number, maxDimension: number) => {
  const clamped = Math.max(128, Math.min(maxDimension, value));
  const bucket = PREVIEW_TARGET_BUCKETS.find((candidate) => candidate >= clamped);
  return Math.min(maxDimension, bucket ?? maxDimension);
};

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const resolveCanvasImageFilmProfile = (element: CanvasImageElement, asset: Asset) => {
  if (element.filmProfileId) {
    return getBuiltInFilmProfile(element.filmProfileId) ?? undefined;
  }
  if (asset.filmProfile) {
    return asset.filmProfile;
  }
  if (asset.filmProfileId) {
    return getBuiltInFilmProfile(asset.filmProfileId) ?? undefined;
  }
  return undefined;
};

export const resolveCanvasImageAdjustments = (
  element: CanvasImageElement,
  asset: Asset,
  draftAdjustments?: EditingAdjustments
) => normalizeAdjustments(draftAdjustments ?? element.adjustments ?? asset.adjustments ?? DEFAULT_ADJUSTMENTS);

export const resolveCanvasImagePreviewTargetSize = (
  element: Pick<CanvasImageElement, "width" | "height">,
  priority: BoardPreviewPriority,
  viewportScale = 1
): CanvasImageRenderTargetSize => {
  const devicePixelRatio =
    typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio || 1);
  const previewPixelRatio = Math.min(devicePixelRatio, PREVIEW_PIXEL_RATIO_CAP[priority]);
  const maxDimension = PREVIEW_TARGET_LIMITS[priority];
  const scaleMultiplier = PREVIEW_SCALE_MULTIPLIER[priority];
  const displayedWidth = Math.max(1, element.width * Math.max(viewportScale, 0.2));
  const displayedHeight = Math.max(1, element.height * Math.max(viewportScale, 0.2));
  const requestedWidth = clampPreviewDimension(displayedWidth * previewPixelRatio * scaleMultiplier);
  const requestedHeight = clampPreviewDimension(displayedHeight * previewPixelRatio * scaleMultiplier);
  const scale =
    Math.max(requestedWidth, requestedHeight) > maxDimension
      ? maxDimension / Math.max(requestedWidth, requestedHeight)
      : 1;
  const scaledWidth = Math.max(1, Math.round(requestedWidth * scale));
  const scaledHeight = Math.max(1, Math.round(requestedHeight * scale));
  const aspectRatio = scaledWidth / Math.max(1, scaledHeight);

  if (scaledWidth >= scaledHeight) {
    const width = resolveBucketedPreviewDimension(scaledWidth, maxDimension);
    return {
      width,
      height: clampAspectPreservingDimension(width / aspectRatio),
    };
  }

  const height = resolveBucketedPreviewDimension(scaledHeight, maxDimension);
  return {
    width: clampAspectPreservingDimension(height * aspectRatio),
    height,
  };
};

export const createCanvasImageDocumentRenderContext = ({
  asset,
  assetById,
  draftAdjustments,
  element,
}: {
  asset: Asset;
  assetById: Map<string, Asset>;
  draftAdjustments?: EditingAdjustments;
  element: CanvasImageElement;
}): CanvasImageDocumentRenderContext => {
  const adjustments = resolveCanvasImageAdjustments(element, asset, draftAdjustments);
  const filmProfile = resolveCanvasImageFilmProfile(element, asset);
  const renderDocument = createRenderDocument({
    key: `board:${element.id}`,
    assetById,
    documentAsset: asset,
    layers: ensureAssetLayers(asset),
    adjustments,
    filmProfile,
    showOriginal: false,
  });

  return {
    adjustments,
    filmProfile,
    renderDocument,
    timestampText: resolveAssetTimestampText(asset.metadata, asset.createdAt),
  };
};

export const createCanvasImageRenderContext = ({
  asset,
  assetById,
  draftAdjustments,
  element,
  priority,
  viewportScale = 1,
}: {
  asset: Asset;
  assetById: Map<string, Asset>;
  draftAdjustments?: EditingAdjustments;
  element: CanvasImageElement;
  priority: BoardPreviewPriority;
  viewportScale?: number;
}): CanvasImageRenderContext => {
  const documentContext = createCanvasImageDocumentRenderContext({
    asset,
    assetById,
    draftAdjustments,
    element,
  });
  const targetSize = resolveCanvasImagePreviewTargetSize(element, priority, viewportScale);
  const cacheKey = [
    `variant:${priority}`,
    documentContext.renderDocument.documentKey,
    documentContext.renderDocument.renderGraph.key,
    `${targetSize.width}x${targetSize.height}`,
    hashString(JSON.stringify(documentContext.adjustments)),
    documentContext.filmProfile?.id ?? asset.filmProfileId ?? "none",
  ].join("|");

  return {
    ...documentContext,
    cacheKey,
    renderVariant: priority,
    targetSize,
  };
};

export const renderCanvasImageElementToCanvas = async ({
  asset,
  assetById,
  canvas,
  draftAdjustments,
  element,
  intent,
  priority,
  viewportScale = 1,
  renderSlotPrefix,
  signal,
}: {
  asset: Asset;
  assetById: Map<string, Asset>;
  canvas: HTMLCanvasElement;
  draftAdjustments?: EditingAdjustments;
  element: CanvasImageElement;
  intent: RenderIntent;
  priority: BoardPreviewPriority;
  viewportScale?: number;
  renderSlotPrefix?: string;
  signal?: AbortSignal;
}) => {
  const context = createCanvasImageRenderContext({
    asset,
    assetById,
    draftAdjustments,
    element,
    priority,
    viewportScale,
  });

  await renderDocumentToCanvas({
    canvas,
    document: context.renderDocument,
    intent,
    targetSize: context.targetSize,
    timestampText: context.timestampText,
    strictErrors: intent === "export-full",
    signal,
    renderSlotPrefix,
  });

  applyCanvasImagePostProcessing(canvas, context.adjustments);

  return context;
};
