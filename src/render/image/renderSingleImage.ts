import {
  renderDevelopBaseToSurface,
  renderFilmStageToSurface,
  renderImageToSurface,
} from "@/lib/imageProcessing";
import type {
  RenderImageStageDebugInfo,
  RenderImageStageResult,
  RenderImageStageSurfaceResult,
} from "@/lib/imageProcessing";
import { sha256FromCanvas } from "@/lib/hash";
import type { RenderSurfaceHandle } from "@/lib/renderSurfaceHandle";
import type { RenderIntent } from "@/lib/renderIntent";
import { applyImageCarrierTransforms } from "./asciiEffect";
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
  boundaries?: {
    canvasMaterializations: number;
    canvasClones: number;
  };
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

const hasMaskedEffects = (effects: readonly ImageRenderDocument["effects"][number][]) =>
  effects.some((effect) => Boolean(effect.maskId));

const releaseCanvas = (canvas: HTMLCanvasElement | null) => {
  if (!canvas) {
    return;
  }
  canvas.width = 0;
  canvas.height = 0;
};

const resolveRuntimeSource = (document: ImageRenderDocument) => document.source.objectUrl;

const resolveFilmSeedKey = (document: ImageRenderDocument) => `${document.id}:film-base`;

const renderSnapshotToSurface = async ({
  document,
  request,
  renderSlotSuffix,
  stage,
}: {
  document: ImageRenderDocument;
  request: ImageRenderRequest;
  renderSlotSuffix?: string;
  stage: "full" | "develop-base";
}): Promise<RenderImageStageSurfaceResult> => {
  const renderOptions = {
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
    return renderDevelopBaseToSurface(renderOptions);
  }

  return renderImageToSurface(renderOptions);
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
  const debugBoundaries = {
    canvasMaterializations: 0,
    canvasClones: 0,
  };
  const trackSurfaceClone = (surface: RenderSurfaceHandle) => {
    debugBoundaries.canvasClones += 1;
    return surface.cloneToCanvas();
  };

  const hasDevelopEffects = snapshotPlan.developEffects.length > 0;
  const hasMaskedDevelopEffects = hasMaskedEffects(snapshotPlan.developEffects);
  const hasMaskedStyleEffects = hasMaskedEffects(snapshotPlan.styleEffects);
  const hasMaskedFinalizeEffects = hasMaskedEffects(snapshotPlan.finalizeEffects);
  const requiresDevelopSnapshot =
    hasMaskedDevelopEffects || snapshotPlan.requiresDevelopAnalysisSnapshot;
  const requiresDevelopBase = hasDevelopEffects || snapshotPlan.requiresDevelopAnalysisSnapshot;

  let developSnapshotCanvas: HTMLCanvasElement | null = null;
  let carrierAnalysisSnapshotCanvas: HTMLCanvasElement | null = null;

  try {
    let surface: RenderSurfaceHandle;

    if (requiresDevelopBase) {
      const developBaseResult = await renderSnapshotToSurface({
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
      let developSurface = developBaseResult.surface;

      if (requiresDevelopSnapshot) {
        developSnapshotCanvas = trackSurfaceClone(developSurface);
      }

      if (hasDevelopEffects) {
        developSurface = await applyImageEffects({
          surface: developSurface,
          document,
          effects: snapshotPlan.developEffects,
          stageReferenceCanvas: developSnapshotCanvas ?? undefined,
        });
        appendTraceOperation(debugStages, "develop", {
          kind: "effects",
          effectPlacement: "develop",
          effectCount: snapshotPlan.developEffects.length,
        });

        const filmStageResult = await renderFilmStageToSurface({
          source: developSurface.sourceCanvas,
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
        surface = filmStageResult.surface;
        appendTraceOperation(debugStages, "develop", {
          kind: "low-level",
          internalStageId: filmStageResult.stageId,
          lowLevel: filmStageResult.debug,
        });
      } else {
        const fullRenderResult = await renderSnapshotToSurface({
          document,
          request,
          renderSlotSuffix: "base-film",
          stage: "full",
        });
        surface = fullRenderResult.surface;
        appendTraceOperation(debugStages, "develop", {
          kind: "low-level",
          internalStageId: fullRenderResult.stageId,
          lowLevel: fullRenderResult.debug,
        });
      }
    } else {
      const fullRenderResult = await renderSnapshotToSurface({
        document,
        request,
        renderSlotSuffix: "base-film",
        stage: "full",
      });
      surface = fullRenderResult.surface;
      appendTraceOperation(debugStages, "develop", {
        kind: "low-level",
        internalStageId: fullRenderResult.stageId,
        lowLevel: fullRenderResult.debug,
      });
    }

    if (snapshotPlan.carrierTransforms.length > 0) {
      carrierAnalysisSnapshotCanvas = trackSurfaceClone(surface);
      surface = await applyImageCarrierTransforms({
        surface,
        carrierTransforms: snapshotPlan.carrierTransforms,
        document,
        request,
        snapshots: {
          develop: developSnapshotCanvas,
          style: carrierAnalysisSnapshotCanvas,
        },
        stageReferenceCanvas: carrierAnalysisSnapshotCanvas,
      });
      appendTraceOperation(debugStages, "style", {
        kind: "carrier",
        carrierCount: snapshotPlan.carrierTransforms.length,
      });
    }

    if (snapshotPlan.styleEffects.length > 0) {
      const styleSnapshotCanvas = hasMaskedStyleEffects ? trackSurfaceClone(surface) : null;
      try {
        surface = await applyImageEffects({
          surface,
          document,
          effects: snapshotPlan.styleEffects,
          stageReferenceCanvas: styleSnapshotCanvas ?? undefined,
        });
        appendTraceOperation(debugStages, "style", {
          kind: "effects",
          effectPlacement: "style",
          effectCount: snapshotPlan.styleEffects.length,
        });
      } finally {
        releaseCanvas(styleSnapshotCanvas);
      }
    }

    const overlays = resolveImageOverlays({
      output: document.output,
      timestampText: request.timestampText,
    });
    if (overlays.length > 0) {
      surface = await applyImageOverlays({
        surface,
        overlays,
      });
      appendTraceOperation(debugStages, "overlay", {
        kind: "overlay",
        overlayCount: overlays.length,
      });
    }

    if (snapshotPlan.finalizeEffects.length > 0) {
      const finalizeSnapshotCanvas = hasMaskedFinalizeEffects ? trackSurfaceClone(surface) : null;
      try {
        surface = await applyImageEffects({
          surface,
          document,
          effects: snapshotPlan.finalizeEffects,
          stageReferenceCanvas: finalizeSnapshotCanvas ?? undefined,
        });
        appendTraceOperation(debugStages, "finalize", {
          kind: "effects",
          effectPlacement: "finalize",
          effectCount: snapshotPlan.finalizeEffects.length,
        });
      } finally {
        releaseCanvas(finalizeSnapshotCanvas);
      }
    }

    if (canvas !== surface.sourceCanvas) {
      debugBoundaries.canvasMaterializations += 1;
    }
    surface.materializeToCanvas(canvas);
  } finally {
    releaseCanvas(carrierAnalysisSnapshotCanvas);
    releaseCanvas(developSnapshotCanvas);
  }

  let debugResult: ImageRenderDebugResult | undefined;
  if (request.debug?.trace || request.debug?.outputHash) {
    debugResult = {};
    if (debugStages) {
      debugResult.stages = debugStages;
    }
    debugResult.boundaries = {
      canvasMaterializations: debugBoundaries.canvasMaterializations,
      canvasClones: debugBoundaries.canvasClones,
    };
    if (request.debug.outputHash) {
      debugResult.outputHash = await sha256FromCanvas(canvas);
    }
  }

  return {
    revisionKey: document.revisionKey,
    debug: debugResult,
  };
};
