import type { RenderIntent } from "@/lib/renderIntent";
import {
  legacyEditingAdjustmentsToImageRenderDocument,
  type ImageRenderDocument,
  type ImageRenderRequest,
  type ImageRenderTargetSize,
} from "@/render/image";
import type { Asset } from "@/types";
import type { RenderDocument } from "./document";
import type { RenderLayerNode } from "./renderGraph";

interface EditorImageRenderRequestOptions {
  intent: RenderIntent;
  targetSize: ImageRenderTargetSize;
  timestampText?: string | null;
  strictErrors?: boolean;
  signal?: AbortSignal;
  renderSlotId?: string;
}

export const resolveEditorLayerFilmProfile = (
  document: RenderDocument,
  sourceAsset: Asset
) =>
  sourceAsset.id === document.sourceAssetId
    ? document.filmProfile ?? undefined
    : sourceAsset.filmProfile ?? undefined;

export const createEditorImageRenderRequest = ({
  intent,
  targetSize,
  timestampText,
  strictErrors,
  signal,
  renderSlotId,
}: EditorImageRenderRequestOptions): ImageRenderRequest => ({
  intent: intent === "export-full" ? "export" : "preview",
  quality: intent === "preview-interactive" ? "interactive" : "full",
  targetSize,
  timestampText,
  strictErrors,
  signal,
  renderSlotId,
});

export const createRenderDocumentImageRenderDocument = (
  document: RenderDocument
): ImageRenderDocument =>
  legacyEditingAdjustmentsToImageRenderDocument({
    id: `${document.key}:base`,
    asset: document.sourceAsset,
    adjustments: document.adjustments,
    filmProfile: document.filmProfile ?? undefined,
  });

export const createRenderLayerImageRenderDocument = (
  document: RenderDocument,
  layerNode: RenderLayerNode
): ImageRenderDocument =>
  legacyEditingAdjustmentsToImageRenderDocument({
    id: `${document.key}:layer:${layerNode.id}`,
    asset: layerNode.sourceAsset,
    adjustments: layerNode.adjustments,
    filmProfile: resolveEditorLayerFilmProfile(document, layerNode.sourceAsset),
  });
