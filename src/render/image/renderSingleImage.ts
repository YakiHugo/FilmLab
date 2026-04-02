import {
  renderDevelopBaseToCanvas,
  renderFilmStageToCanvas,
  renderImageToCanvas,
} from "@/lib/imageProcessing";
import type { RenderImageStageDebugInfo, RenderImageStageResult } from "@/lib/imageProcessing";
import { sha256FromCanvas } from "@/lib/hash";
import type { RenderIntent } from "@/lib/renderIntent";
import { applyImageCarrierTransforms } from "./carrierExecution";
import { applyImageEffects } from "./effectExecution";
import { applyImageOverlays, resolveImageOverlays } from "./overlayExecution";
import {
  assertSupportedImageRenderSnapshotPlan,
  createImageRenderSnapshotPlan,
} from "./snapshotPlan";
import type {
  ImageRenderDocument,
  ImageEffectPlacement,
  ImageRenderRequest,
  ImageRenderTargetSize,
} from "./types";
import { extractImageProcessState } from "./types";

export interface ImageRenderTraceOperation {
  kind: "low-level" | "effects" | "carrier" | "overlay";
  internalStageId?: RenderImageStageResult["stageId"];
  lowLevel?: RenderImageStageDebugInfo;
  effectPlacement?: ImageEffectPlacement;
  effectCount?: number;
  carrierCount?: number;
  overlayCount?: number;
}

export interface ImageRenderTraceStage {
  id: "develop" | "style" | "overlay" | "finalize";
  operations: ImageRenderTraceOperation[];
}

export interface ImageRenderDebugResult {
  stages?: ImageRenderTraceStage[];
  outputHash?: string;
}

export interface RenderSingleImageResult {
  revisionKey: string;
  debug?: ImageRenderDebugResult;
}

const appendTraceOperation = (
  stages: ImageRenderTraceStage[] | null,
  stageId: ImageRenderTraceStage["id"],
  operation: ImageRenderTraceOperation | null
) => {
  if (!stages || !operation) {
    return;
  }
  const existing = stages.find((stage) => stage.id === stageId);
  if (existing) {
    existing.operations.push(operation);
    return;
  }
  stages.push({
    id: stageId,
    operations: [operation],
  });
};

const resolveImageProcessingRenderIntent = (request: ImageRenderRequest): RenderIntent => {
  if (request.intent === "export") {
    return "export-full";
  }
  return request.quality === "interactive" ? "preview-interactive" : "preview-full";
};

const createSnapshotCanvas = (targetSize: ImageRenderTargetSize) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(targetSize.width));
  canvas.height = Math.max(1, Math.round(targetSize.height));
  return canvas;
};

const cloneCanvasSnapshot = (sourceCanvas: HTMLCanvasElement) => {
  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error("Failed to acquire snapshot clone context.");
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sourceCanvas, 0, 0);
  return canvas;
};

const resolveRuntimeSource = (document: ImageRenderDocument) => document.source.objectUrl;

const resolveFilmSeedKey = (document: ImageRenderDocument) => `${document.id}:film-base`;

const renderSnapshotToCanvas = async ({
  canvas,
  document,
  request,
  renderSlotSuffix,
  stage,
}: {
  canvas: HTMLCanvasElement;
  document: ImageRenderDocument;
  request: ImageRenderRequest;
  renderSlotSuffix?: string;
  stage: "full" | "develop-base";
}): Promise<RenderImageStageResult> => {
  const renderOptions = {
    canvas,
    source: resolveRuntimeSource(document),
    state: extractImageProcessState(document),
    targetSize: request.targetSize,
    seedKey: stage === "full" ? resolveFilmSeedKey(document) : `${document.id}:${stage}`,
    sourceCacheKey: `${document.revisionKey}:${stage}:${request.targetSize.width}x${request.targetSize.height}`,
    strictErrors: request.strictErrors ?? request.intent === "export",
    intent: resolveImageProcessingRenderIntent(request),
    signal: request.signal,
    debug: request.debug,
    renderSlot: request.renderSlotId
      ? renderSlotSuffix
        ? `${request.renderSlotId}:${renderSlotSuffix}`
        : request.renderSlotId
      : undefined,
  };

  if (stage === "develop-base") {
    return renderDevelopBaseToCanvas(renderOptions);
  }

  return renderImageToCanvas(renderOptions);
};

const applyImageFinalizeStages = async ({
  canvas,
  document,
  finalizeEffects,
  request,
}: {
  canvas: HTMLCanvasElement;
  document: ImageRenderDocument;
  finalizeEffects: ImageRenderDocument["effects"];
  request: ImageRenderRequest;
}) => {
  const overlays = resolveImageOverlays({
    output: document.output,
    timestampText: request.timestampText,
  });
  await applyImageOverlays({
    canvas,
    overlays,
  });

  if (finalizeEffects.length === 0) {
    return {
      finalizeSnapshotCanvas: null,
      overlayCount: overlays.length,
    };
  }

  const finalizeSnapshotCanvas = cloneCanvasSnapshot(canvas);
  await applyImageEffects({
    canvas,
    document,
    effects: finalizeEffects,
    stageReferenceCanvas: finalizeSnapshotCanvas,
  });
  return {
    finalizeSnapshotCanvas,
    overlayCount: overlays.length,
  };
};

export const renderSingleImageToCanvas = async ({
  canvas,
  document,
  request,
}: {
  canvas: HTMLCanvasElement;
  document: ImageRenderDocument;
  request: ImageRenderRequest;
}): Promise<RenderSingleImageResult> => {
  const snapshotPlan = createImageRenderSnapshotPlan({
    carrierTransforms: document.carrierTransforms,
    effects: document.effects,
  });
  assertSupportedImageRenderSnapshotPlan(snapshotPlan);
  const debugStages = request.debug?.trace ? ([] as ImageRenderTraceStage[]) : null;

  let carrierAnalysisSnapshotCanvas: HTMLCanvasElement | null = null;
  let styleSnapshotCanvas: HTMLCanvasElement | null = null;
  let developBaseCanvas: HTMLCanvasElement | null = null;
  let developSnapshotCanvas: HTMLCanvasElement | null = null;
  let finalizeSnapshotCanvas: HTMLCanvasElement | null = null;

  try {
    const hasDevelopEffects = snapshotPlan.developEffects.length > 0;
    const requiresDevelopBase =
      hasDevelopEffects || snapshotPlan.requiresDevelopAnalysisSnapshot;

    if (requiresDevelopBase) {
      developBaseCanvas = createSnapshotCanvas(request.targetSize);
      const developBaseResult = await renderSnapshotToCanvas({
        canvas: developBaseCanvas,
        document,
        request,
        renderSlotSuffix: hasDevelopEffects ? "base-develop" : "analysis-develop",
        stage: "develop-base",
      });
      appendTraceOperation(debugStages, "develop", {
        kind: "low-level",
        internalStageId: developBaseResult.stageId,
        lowLevel: developBaseResult.debug,
      });
      developSnapshotCanvas =
        hasDevelopEffects || snapshotPlan.requiresDevelopAnalysisSnapshot
          ? cloneCanvasSnapshot(developBaseCanvas)
          : null;
    }

    if (hasDevelopEffects) {
      const developCanvas = developBaseCanvas;
      if (!developCanvas) {
        throw new Error("Expected develop base canvas to be initialized.");
      }

      await applyImageEffects({
        canvas: developCanvas,
        document,
        effects: snapshotPlan.developEffects,
        stageReferenceCanvas: developSnapshotCanvas ?? developCanvas,
      });
      appendTraceOperation(debugStages, "develop", {
        kind: "effects",
        effectPlacement: "develop",
        effectCount: snapshotPlan.developEffects.length,
      });

      const filmStageResult = await renderFilmStageToCanvas({
        canvas,
        source: developCanvas,
        state: extractImageProcessState(document),
        targetSize: request.targetSize,
        seedKey: resolveFilmSeedKey(document),
        sourceCacheKey: `${document.revisionKey}:film-stage:${request.targetSize.width}x${request.targetSize.height}`,
        strictErrors: request.strictErrors ?? request.intent === "export",
        intent: resolveImageProcessingRenderIntent(request),
        signal: request.signal,
        debug: request.debug,
        renderSlot: request.renderSlotId ? `${request.renderSlotId}:base-film-stage` : undefined,
      });
      appendTraceOperation(debugStages, "develop", {
        kind: "low-level",
        internalStageId: filmStageResult.stageId,
        lowLevel: filmStageResult.debug,
      });
    } else {
      const fullRenderResult = await renderSnapshotToCanvas({
        canvas,
        document,
        request,
        renderSlotSuffix: "base-film",
        stage: "full",
      });
      appendTraceOperation(debugStages, "develop", {
        kind: "low-level",
        internalStageId: fullRenderResult.stageId,
        lowLevel: fullRenderResult.debug,
      });
    }

    carrierAnalysisSnapshotCanvas =
      snapshotPlan.carrierTransforms.length > 0 || snapshotPlan.requiresStyleAnalysisSnapshot
        ? cloneCanvasSnapshot(canvas)
        : null;

    if (snapshotPlan.carrierTransforms.length > 0) {
      await applyImageCarrierTransforms({
        canvas,
        carrierTransforms: snapshotPlan.carrierTransforms,
        document,
        request,
        snapshots: {
          develop: developSnapshotCanvas,
          style: carrierAnalysisSnapshotCanvas ?? canvas,
        },
        stageReferenceCanvas: carrierAnalysisSnapshotCanvas ?? canvas,
      });
      appendTraceOperation(debugStages, "style", {
        kind: "carrier",
        carrierCount: snapshotPlan.carrierTransforms.length,
      });
    }

    styleSnapshotCanvas =
      snapshotPlan.styleEffects.length > 0 ? cloneCanvasSnapshot(canvas) : null;

    await applyImageEffects({
      canvas,
      document,
      effects: snapshotPlan.styleEffects,
      stageReferenceCanvas: styleSnapshotCanvas ?? canvas,
    });
    if (snapshotPlan.styleEffects.length > 0) {
      appendTraceOperation(debugStages, "style", {
        kind: "effects",
        effectPlacement: "style",
        effectCount: snapshotPlan.styleEffects.length,
      });
    }
    const finalizeResult = await applyImageFinalizeStages({
      canvas,
      document,
      finalizeEffects: snapshotPlan.finalizeEffects,
      request,
    });
    finalizeSnapshotCanvas = finalizeResult.finalizeSnapshotCanvas;
    if (finalizeResult.overlayCount > 0) {
      appendTraceOperation(debugStages, "overlay", {
        kind: "overlay",
        overlayCount: finalizeResult.overlayCount,
      });
    }
    if (snapshotPlan.finalizeEffects.length > 0) {
      appendTraceOperation(debugStages, "finalize", {
        kind: "effects",
        effectPlacement: "finalize",
        effectCount: snapshotPlan.finalizeEffects.length,
      });
    }
  } finally {
    if (finalizeSnapshotCanvas) {
      finalizeSnapshotCanvas.width = 0;
      finalizeSnapshotCanvas.height = 0;
    }
    if (styleSnapshotCanvas) {
      styleSnapshotCanvas.width = 0;
      styleSnapshotCanvas.height = 0;
    }
    if (carrierAnalysisSnapshotCanvas) {
      carrierAnalysisSnapshotCanvas.width = 0;
      carrierAnalysisSnapshotCanvas.height = 0;
    }
    if (developBaseCanvas) {
      developBaseCanvas.width = 0;
      developBaseCanvas.height = 0;
    }
    if (developSnapshotCanvas) {
      developSnapshotCanvas.width = 0;
      developSnapshotCanvas.height = 0;
    }
  }

  let debugResult: ImageRenderDebugResult | undefined;
  if (request.debug?.trace || request.debug?.outputHash) {
    debugResult = {};
    if (debugStages) {
      debugResult.stages = debugStages;
    }
    if (request.debug.outputHash) {
      debugResult.outputHash = await sha256FromCanvas(canvas);
    }
  }

  return {
    revisionKey: document.revisionKey,
    debug: debugResult,
  };
};
