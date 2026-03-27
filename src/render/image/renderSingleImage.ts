import { applyAsciiRasterEffect } from "@/lib/asciiRaster";
import { ensureAssetLayers } from "@/lib/editorLayers";
import { createRenderDocument } from "@/features/editor/document";
import { renderDocumentToCanvas } from "@/features/editor/renderDocumentCanvas";
import { applyFilter2dPostProcessing } from "@/lib/filter2dPostProcessing";
import type { RenderIntent } from "@/lib/renderIntent";
import { applyTimestampOverlay } from "@/lib/timestampOverlay";
import type { Asset, EditingAdjustments } from "@/types";
import {
  resolveImageRenderEffectsForPlacement,
  type ImageAsciiEffectNode,
  type ImageEffectNode,
  type ImageFilter2dEffectNode,
  type ImageRenderDocument,
  type ImageRenderRequest,
} from "./types";

export interface LegacySingleImageRuntimeInput {
  asset: Asset;
  assetById: Map<string, Asset>;
}

const resolveLegacyRenderIntent = (request: ImageRenderRequest): RenderIntent => {
  if (request.intent === "export") {
    return "export-full";
  }
  return request.quality === "interactive" ? "preview-interactive" : "preview-full";
};

const createTimestampAdjustments = (
  baseAdjustments: EditingAdjustments,
  document: ImageRenderDocument
): EditingAdjustments => ({
  ...baseAdjustments,
  timestampEnabled: document.output.timestamp.enabled,
  timestampPosition: document.output.timestamp.position,
  timestampSize: document.output.timestamp.size,
  timestampOpacity: document.output.timestamp.opacity,
});

const applyAsciiEffect = (
  canvas: HTMLCanvasElement,
  effect: ImageAsciiEffectNode,
  request: ImageRenderRequest
) => {
  const colorMode = effect.params.colorMode === "duotone" ? "grayscale" : effect.params.colorMode;
  applyAsciiRasterEffect({
    canvas,
    ascii: {
      enabled: effect.enabled,
      charsetPreset: effect.params.preset === "custom" ? "standard" : effect.params.preset,
      colorMode,
      cellSize: effect.params.cellSize,
      characterSpacing: effect.params.characterSpacing,
      contrast: effect.params.contrast,
      dither: effect.params.dither,
      invert: effect.params.invert,
    },
    qualityProfile: request.quality,
  });
};

const applyFilter2dEffect = (canvas: HTMLCanvasElement, effect: ImageFilter2dEffectNode) => {
  applyFilter2dPostProcessing(canvas, effect.params);
};

const applyEffects = (
  canvas: HTMLCanvasElement,
  effects: readonly ImageEffectNode[],
  request: ImageRenderRequest
) => {
  for (const effect of effects) {
    switch (effect.type) {
      case "ascii":
        applyAsciiEffect(canvas, effect, request);
        break;
      case "filter2d":
        applyFilter2dEffect(canvas, effect);
        break;
      default: {
        const exhaustiveCheck: never = effect;
        throw new Error(`Unsupported image effect: ${String(exhaustiveCheck)}`);
      }
    }
  }
};

export const renderSingleImageToCanvas = async ({
  canvas,
  document,
  request,
  runtime,
}: {
  canvas: HTMLCanvasElement;
  document: ImageRenderDocument;
  request: ImageRenderRequest;
  runtime: LegacySingleImageRuntimeInput;
}) => {
  const legacyRenderDocument = createRenderDocument({
    key: document.id,
    assetById: runtime.assetById,
    documentAsset: runtime.asset,
    layers: ensureAssetLayers(runtime.asset),
    adjustments: document.develop.adjustments,
    filmProfile: document.film.profile,
    showOriginal: false,
  });

  await renderDocumentToCanvas({
    canvas,
    document: legacyRenderDocument,
    intent: resolveLegacyRenderIntent(request),
    targetSize: request.targetSize,
    timestampText: null,
    strictErrors: request.intent === "export",
    signal: request.signal,
    renderSlotPrefix: request.renderSlotId,
  });

  applyEffects(canvas, resolveImageRenderEffectsForPlacement(document.effects, "afterFilm"), request);
  applyTimestampOverlay(
    canvas,
    createTimestampAdjustments(document.develop.adjustments, document),
    request.timestampText
  );
  applyEffects(
    canvas,
    resolveImageRenderEffectsForPlacement(document.effects, "afterOutput"),
    request
  );

  return {
    revisionKey: document.revisionKey,
  };
};
