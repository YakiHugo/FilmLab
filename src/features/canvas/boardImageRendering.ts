import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import { ensureAssetLayers } from "@/lib/editorLayers";
import { getBuiltInFilmProfile } from "@/lib/film";
import type { RenderIntent } from "@/lib/renderIntent";
import { resolveAssetTimestampText } from "@/lib/timestamp";
import type { Asset, CanvasImageElement, EditingAdjustments } from "@/types";
import { createRenderDocument, type RenderDocument } from "@/features/editor/document";
import { renderDocumentToCanvas } from "@/features/editor/renderDocumentCanvas";

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
  interactive: 1600,
  background: 1024,
};
const PREVIEW_PIXEL_RATIO_CAP: Record<BoardPreviewPriority, number> = {
  interactive: 2,
  background: 1.5,
};

const clampPreviewDimension = (value: number) => Math.max(64, Math.round(value));

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
  priority: BoardPreviewPriority
): CanvasImageRenderTargetSize => {
  const devicePixelRatio =
    typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio || 1);
  const previewPixelRatio = Math.min(devicePixelRatio, PREVIEW_PIXEL_RATIO_CAP[priority]);
  const maxDimension = PREVIEW_TARGET_LIMITS[priority];
  const requestedWidth = clampPreviewDimension(element.width * previewPixelRatio);
  const requestedHeight = clampPreviewDimension(element.height * previewPixelRatio);
  const scale =
    Math.max(requestedWidth, requestedHeight) > maxDimension
      ? maxDimension / Math.max(requestedWidth, requestedHeight)
      : 1;

  return {
    width: Math.max(64, Math.round(requestedWidth * scale)),
    height: Math.max(64, Math.round(requestedHeight * scale)),
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
}: {
  asset: Asset;
  assetById: Map<string, Asset>;
  draftAdjustments?: EditingAdjustments;
  element: CanvasImageElement;
  priority: BoardPreviewPriority;
}): CanvasImageRenderContext => {
  const documentContext = createCanvasImageDocumentRenderContext({
    asset,
    assetById,
    draftAdjustments,
    element,
  });
  const targetSize = resolveCanvasImagePreviewTargetSize(element, priority);
  const cacheKey = [
    documentContext.renderDocument.documentKey,
    documentContext.renderDocument.renderGraph.key,
    `${targetSize.width}x${targetSize.height}`,
    hashString(JSON.stringify(documentContext.adjustments)),
    documentContext.filmProfile?.id ?? asset.filmProfileId ?? "none",
  ].join("|");

  return {
    ...documentContext,
    cacheKey,
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
  renderSlotPrefix?: string;
  signal?: AbortSignal;
}) => {
  const context = createCanvasImageRenderContext({
    asset,
    assetById,
    draftAdjustments,
    element,
    priority,
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

  return context;
};
