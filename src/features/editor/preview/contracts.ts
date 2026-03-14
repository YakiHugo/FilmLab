import type React from "react";
import { clamp } from "@/lib/math";
import type { Asset, EditorLayer, EditingAdjustments, EditorLayerBlendMode } from "@/types";

export interface PreviewFrameSize {
  width: number;
  height: number;
}

export type PreviewQuality = "interactive" | "full";

export interface ViewportRoi {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditorPreviewDocument {
  documentKey: string;
  sourceAssetId: string;
  adjustments: EditingAdjustments;
  layers: EditorLayer[];
  filmProfile: Asset["filmProfile"] | null | undefined;
  showOriginal: boolean;
}

export interface LayerPreviewEntry {
  layer: EditorLayer;
  sourceAsset: Asset;
  adjustments: EditingAdjustments;
  opacity: number;
  blendMode: EditorLayerBlendMode;
}

export interface PreviewRequest {
  document: EditorPreviewDocument;
  documentKey: string;
  quality: PreviewQuality;
  frameSize: PreviewFrameSize;
  viewportRoi: ViewportRoi | null;
  layerEntries: LayerPreviewEntry[];
  showOriginal: boolean;
  timestampText: string | null;
  isCropMode: boolean;
  orientedSourceAspectRatio: number;
  previewRenderSeed: number;
  sourceAsset: Asset;
  shouldRenderLayerComposite: boolean;
}

export interface PreviewResult {
  requestId: number;
  quality: PreviewQuality;
  renderedRoi: ViewportRoi | null;
  renderVersion: number;
}

export interface BrushStrokePoint {
  x: number;
  y: number;
  pressure: number;
}

export interface GuidedLine {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export interface PreviewNormalizedPointer {
  x: number;
  y: number;
  pressure: number;
}

export type PreviewCropPatch = Partial<
  Pick<EditingAdjustments, "horizontal" | "vertical" | "scale" | "customAspectRatio">
>;

export const resolvePreviewPointerPosition = (
  event: React.PointerEvent<HTMLDivElement>,
  target: HTMLDivElement
): PreviewNormalizedPointer | null => {
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    pressure: clamp(event.pressure > 0 ? event.pressure : 1, 0.1, 1),
  };
};
