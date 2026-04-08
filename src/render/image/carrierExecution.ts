import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import {
  applyImageAsciiCarrierTransform,
  applyImageAsciiCarrierTransformToSurfaceIfSupported,
} from "./asciiEffect";
import {
  applyMaskedStageOperation,
  applyMaskedStageOperationToSurfaceIfSupported,
} from "./stageMaskComposite";
import type {
  CarrierTransformNode,
  ImageRenderDocument,
  ImageRenderRequest,
} from "./types";

interface CarrierSnapshots {
  develop: HTMLCanvasElement | null;
  style: HTMLCanvasElement;
}

export const applyImageCarrierTransforms = async ({
  canvas,
  carrierTransforms,
  document,
  request,
  snapshots,
  stageReferenceCanvas,
}: {
  canvas: HTMLCanvasElement;
  carrierTransforms: readonly CarrierTransformNode[];
  document: ImageRenderDocument;
  request: ImageRenderRequest;
  snapshots: CarrierSnapshots;
  stageReferenceCanvas?: HTMLCanvasElement;
}) => {
  for (const transform of carrierTransforms) {
    const sourceCanvas =
      transform.analysisSource === "develop" ? snapshots.develop ?? snapshots.style : snapshots.style;
    const maskDefinition = transform.maskId ? document.masks.byId[transform.maskId] ?? null : null;
    if (!maskDefinition) {
      await applyImageAsciiCarrierTransform({
        targetCanvas: canvas,
        sourceCanvas,
        transform,
        quality: request.quality,
        mode: request.intent === "export" ? "export" : "preview",
        revisionKey: document.revisionKey,
        targetSize: request.targetSize,
        maskRevisionKey: null,
      });
      continue;
    }

    await applyMaskedStageOperation({
      canvas,
      maskDefinition,
      maskReferenceCanvas: stageReferenceCanvas ?? canvas,
      applyOperation: async ({ canvas: targetCanvas, maskRevisionKey }) => {
        await applyImageAsciiCarrierTransform({
          targetCanvas,
          sourceCanvas,
          transform,
          quality: request.quality,
          mode: request.intent === "export" ? "export" : "preview",
          revisionKey: document.revisionKey,
          targetSize: request.targetSize,
          maskRevisionKey,
        });
      },
    });
  }
};

export const applyImageCarrierTransformsToSurfaceIfSupported = async ({
  surface,
  carrierTransforms,
  document,
  request,
  snapshots,
  stageReferenceCanvas,
}: {
  surface: RenderSurfaceHandle;
  carrierTransforms: readonly CarrierTransformNode[];
  document: ImageRenderDocument;
  request: ImageRenderRequest;
  snapshots: CarrierSnapshots;
  stageReferenceCanvas?: HTMLCanvasElement;
}): Promise<RenderSurfaceHandle | null> => {
  let currentSurface = surface;

  for (const transform of carrierTransforms) {
    const sourceCanvas =
      transform.analysisSource === "develop" ? snapshots.develop ?? snapshots.style : snapshots.style;
    const maskDefinition = transform.maskId ? document.masks.byId[transform.maskId] ?? null : null;
    const nextSurface = await applyMaskedStageOperationToSurfaceIfSupported({
      surface: currentSurface,
      maskDefinition,
      maskReferenceCanvas: stageReferenceCanvas ?? snapshots.style,
      blendSlotId: transform.maskId ? `carrier-mask:${transform.id}` : undefined,
      applyOperation: async ({ surface: targetSurface, maskRevisionKey }) =>
        applyImageAsciiCarrierTransformToSurfaceIfSupported({
          baseSurface: targetSurface,
          sourceCanvas,
          transform,
          quality: request.quality,
          revisionKey: document.revisionKey,
          targetSize: request.targetSize,
          maskRevisionKey,
        }),
    });
    if (!nextSurface) {
      return null;
    }
    currentSurface = nextSurface;
  }

  return currentSurface;
};
