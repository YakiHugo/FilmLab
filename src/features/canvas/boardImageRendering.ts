import type { RenderIntent } from "@/lib/renderIntent";
import {
  createImageRenderDocumentFromState,
  renderSingleImageToCanvas,
  type CanvasImageRenderStateV1,
  type ImageRenderDocument,
} from "@/render/image";
import { resolveAssetTimestampText } from "@/lib/timestamp";
import type { Asset, CanvasImageElement } from "@/types";
import { resolveCanvasImageRenderState } from "./imageRenderState";

export type BoardPreviewPriority = "interactive" | "background";

export interface CanvasImageRenderTargetSize {
  width: number;
  height: number;
}

export interface CanvasImageRenderContext {
  cacheKey: string;
  filmProfile: ImageRenderDocument["film"]["profile"] | undefined;
  imageDocument: ImageRenderDocument;
  renderVariant: BoardPreviewPriority;
  renderState: CanvasImageRenderStateV1;
  targetSize: CanvasImageRenderTargetSize;
  timestampText: string | null;
}

export interface CanvasImageDocumentRenderContext {
  filmProfile: ImageRenderDocument["film"]["profile"] | undefined;
  imageDocument: ImageRenderDocument;
  renderState: CanvasImageRenderStateV1;
  timestampText: string | null;
}
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

export const resolveCanvasImagePreviewTargetSizeKey = (
  element: Pick<CanvasImageElement, "width" | "height">,
  priority: BoardPreviewPriority,
  viewportScale = 1
) => {
  const targetSize = resolveCanvasImagePreviewTargetSize(element, priority, viewportScale);
  return `${targetSize.width}x${targetSize.height}`;
};

export const createCanvasImageDocumentRenderContext = ({
  asset,
  draftRenderState,
  element,
}: {
  asset: Asset;
  draftRenderState?: CanvasImageRenderStateV1;
  element: CanvasImageElement;
}): CanvasImageDocumentRenderContext => {
  const renderState = resolveCanvasImageRenderState(element, asset, draftRenderState);
  if (!renderState) {
    throw new Error(`Missing canonical render state for canvas image element ${element.id}.`);
  }
  const imageDocument = createImageRenderDocumentFromState({
    id: `board:${element.id}`,
    source: {
      assetId: asset.id,
      objectUrl: asset.objectUrl,
      contentHash: asset.contentHash ?? null,
      name: asset.name,
      mimeType: asset.type,
      width: asset.metadata?.width,
      height: asset.metadata?.height,
    },
    state: renderState,
  });

  return {
    filmProfile: imageDocument.film.profile ?? undefined,
    imageDocument,
    renderState,
    timestampText: resolveAssetTimestampText(asset.metadata, asset.createdAt),
  };
};

export const createCanvasImageRenderContext = ({
  asset,
  draftRenderState,
  element,
  priority,
  viewportScale = 1,
}: {
  asset: Asset;
  draftRenderState?: CanvasImageRenderStateV1;
  element: CanvasImageElement;
  priority: BoardPreviewPriority;
  viewportScale?: number;
}): CanvasImageRenderContext => {
  const documentContext = createCanvasImageDocumentRenderContext({
    asset,
    draftRenderState,
    element,
  });
  const targetSize = resolveCanvasImagePreviewTargetSize(element, priority, viewportScale);
  const cacheKey = [
    `variant:${priority}`,
    documentContext.imageDocument.revisionKey,
    `${targetSize.width}x${targetSize.height}`,
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
  canvas,
  draftRenderState,
  element,
  intent,
  priority,
  viewportScale = 1,
  renderSlotPrefix,
  signal,
}: {
  asset: Asset;
  canvas: HTMLCanvasElement;
  draftRenderState?: CanvasImageRenderStateV1;
  element: CanvasImageElement;
  intent: RenderIntent;
  priority: BoardPreviewPriority;
  viewportScale?: number;
  renderSlotPrefix?: string;
  signal?: AbortSignal;
}) => {
  const context = createCanvasImageRenderContext({
    asset,
    draftRenderState,
    element,
    priority,
    viewportScale,
  });

  await renderSingleImageToCanvas({
    canvas,
    document: context.imageDocument,
    request: {
      intent: intent === "export-full" ? "export" : "preview",
      quality: priority === "interactive" ? "interactive" : "full",
      targetSize: context.targetSize,
      timestampText: context.timestampText,
      signal,
      renderSlotId: renderSlotPrefix,
    },
  });

  return context;
};
