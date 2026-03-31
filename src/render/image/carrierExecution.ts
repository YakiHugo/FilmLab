import { applyImageAsciiCarrierTransform } from "./asciiEffect";
import { applyMaskedStageOperation } from "./stageMaskComposite";
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
  stageReferenceCanvas: HTMLCanvasElement;
}) => {
  for (const transform of carrierTransforms) {
    const sourceCanvas =
      transform.analysisSource === "develop" ? snapshots.develop ?? snapshots.style : snapshots.style;
    const maskDefinition = transform.maskId ? document.masks.byId[transform.maskId] ?? null : null;

    await applyMaskedStageOperation({
      canvas,
      maskDefinition,
      maskReferenceCanvas: stageReferenceCanvas,
      applyOperation: ({ canvas: targetCanvas, maskRevisionKey }) => {
        applyImageAsciiCarrierTransform({
          targetCanvas,
          sourceCanvas,
          transform,
          quality: request.quality,
          revisionKey: document.revisionKey,
          targetSize: request.targetSize,
          maskRevisionKey,
        });
      },
    });
  }
};
