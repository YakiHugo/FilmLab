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
import {
  applyImageCarrierTransforms,
  applyImageCarrierTransformsToSurfaceIfSupported,
} from "./asciiEffect";
import {
  applyImageEffects,
  applyImageEffectsToSurfaceIfSupported,
} from "./effectExecution";
import {
  applyImageOverlaysToCanvasIfSupported,
  applyImageOverlaysToSurfaceIfSupported,
  resolveImageOverlays,
} from "./overlayExecution";
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

const hasMaskedEffects = (effects: readonly ImageRenderDocument["effects"][number][]) =>
  effects.some((effect) => Boolean(effect.maskId));

const cloneSurfaceSnapshot = (surface: RenderSurfaceHandle) => surface.cloneToCanvas();

const materializeSurfaceToCanvas = (
  surface: RenderSurfaceHandle,
  targetCanvas?: HTMLCanvasElement | null
) => surface.materializeToCanvas(targetCanvas);

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
  const trackCanvasClone = (sourceCanvas: HTMLCanvasElement) => {
    debugBoundaries.canvasClones += 1;
    return cloneCanvasSnapshot(sourceCanvas);
  };
  const trackSurfaceClone = (surface: RenderSurfaceHandle) => {
    debugBoundaries.canvasClones += 1;
    return cloneSurfaceSnapshot(surface);
  };
  const trackSurfaceMaterialization = (
    surface: RenderSurfaceHandle,
    targetCanvas?: HTMLCanvasElement | null
  ) => {
    if (!targetCanvas || targetCanvas !== surface.sourceCanvas) {
      debugBoundaries.canvasMaterializations += 1;
    }
    return materializeSurfaceToCanvas(surface, targetCanvas);
  };
  const hasMaskedDevelopEffects = hasMaskedEffects(snapshotPlan.developEffects);
  const hasMaskedStyleEffects = hasMaskedEffects(snapshotPlan.styleEffects);
  const hasMaskedFinalizeEffects = hasMaskedEffects(snapshotPlan.finalizeEffects);

  let carrierAnalysisSnapshotCanvas: HTMLCanvasElement | null = null;
  let styleSnapshotCanvas: HTMLCanvasElement | null = null;
  let developBaseCanvas: HTMLCanvasElement | null = null;
  let developSnapshotCanvas: HTMLCanvasElement | null = null;
  let finalizeSnapshotCanvas: HTMLCanvasElement | null = null;
  let baseSurface: RenderSurfaceHandle | null = null;
  let styleEffectsAppliedOnSurface = false;

  try {
    const hasDevelopEffects = snapshotPlan.developEffects.length > 0;
    const requiresDevelopBase =
      hasDevelopEffects || snapshotPlan.requiresDevelopAnalysisSnapshot;
    let developBaseSurface: RenderSurfaceHandle | null = null;

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
      developBaseSurface = developBaseResult.surface;
      if (hasDevelopEffects) {
        developSnapshotCanvas =
          hasMaskedDevelopEffects || snapshotPlan.requiresDevelopAnalysisSnapshot
            ? trackSurfaceClone(developBaseResult.surface)
            : null;
      } else if (snapshotPlan.requiresDevelopAnalysisSnapshot) {
        developSnapshotCanvas = trackSurfaceClone(developBaseResult.surface);
      }
    }

    if (hasDevelopEffects) {
      let developSourceSurface: RenderSurfaceHandle | null = null;
      if (!developBaseSurface) {
        throw new Error("Expected develop base surface to be initialized.");
      }
      developSourceSurface = await applyImageEffectsToSurfaceIfSupported({
        surface: developBaseSurface,
        document,
        effects: snapshotPlan.developEffects,
        stageReferenceCanvas: developSnapshotCanvas ?? undefined,
      });
      if (!developSourceSurface) {
        developBaseCanvas = trackSurfaceMaterialization(
          developBaseSurface,
          createSnapshotCanvas(request.targetSize)
        );
        await applyImageEffects({
          canvas: developBaseCanvas,
          document,
          effects: snapshotPlan.developEffects,
          stageReferenceCanvas: hasMaskedDevelopEffects
            ? developSnapshotCanvas ?? developBaseCanvas
            : undefined,
        });
      }
      appendTraceOperation(debugStages, "develop", {
        kind: "effects",
        effectPlacement: "develop",
        effectCount: snapshotPlan.developEffects.length,
      });

      const filmStageResult = await renderFilmStageToSurface({
        source: developSourceSurface?.sourceCanvas ?? developBaseCanvas ?? document.source.objectUrl,
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
      baseSurface = filmStageResult.surface;
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
      baseSurface = fullRenderResult.surface;
      appendTraceOperation(debugStages, "develop", {
        kind: "low-level",
        internalStageId: fullRenderResult.stageId,
        lowLevel: fullRenderResult.debug,
      });
    }

    if (!baseSurface) {
      throw new Error("Expected base surface to be initialized.");
    }

    if (snapshotPlan.carrierTransforms.length > 0) {
      carrierAnalysisSnapshotCanvas = trackSurfaceClone(baseSurface);
      const carrierSurface = await applyImageCarrierTransformsToSurfaceIfSupported({
        surface: baseSurface,
        carrierTransforms: snapshotPlan.carrierTransforms,
        document,
        request,
        snapshots: {
          develop: developSnapshotCanvas,
          style: carrierAnalysisSnapshotCanvas,
        },
        stageReferenceCanvas: carrierAnalysisSnapshotCanvas,
      });
      if (carrierSurface) {
        baseSurface = carrierSurface;
        appendTraceOperation(debugStages, "style", {
          kind: "carrier",
          carrierCount: snapshotPlan.carrierTransforms.length,
        });
      } else {
        trackSurfaceMaterialization(baseSurface, canvas);
        await applyImageCarrierTransforms({
          canvas,
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
        baseSurface = null;
      }
    }

    if (baseSurface && snapshotPlan.styleEffects.length > 0) {
      if (hasMaskedStyleEffects && !styleSnapshotCanvas) {
        styleSnapshotCanvas = trackSurfaceClone(baseSurface);
      }
      const styleSurface = await applyImageEffectsToSurfaceIfSupported({
        surface: baseSurface,
        document,
        effects: snapshotPlan.styleEffects,
        stageReferenceCanvas: styleSnapshotCanvas ?? undefined,
      });
      if (styleSurface) {
        baseSurface = styleSurface;
        styleEffectsAppliedOnSurface = true;
        appendTraceOperation(debugStages, "style", {
          kind: "effects",
          effectPlacement: "style",
          effectCount: snapshotPlan.styleEffects.length,
        });
      }
    }

    if (baseSurface && snapshotPlan.styleEffects.length > 0 && !styleEffectsAppliedOnSurface) {
      trackSurfaceMaterialization(baseSurface, canvas);
      baseSurface = null;
    }

    styleSnapshotCanvas =
      hasMaskedStyleEffects && !styleEffectsAppliedOnSurface
        ? styleSnapshotCanvas ?? trackCanvasClone(canvas)
        : styleSnapshotCanvas;

    if (!styleEffectsAppliedOnSurface) {
      await applyImageEffects({
        canvas,
        document,
        effects: snapshotPlan.styleEffects,
        stageReferenceCanvas: styleSnapshotCanvas ?? undefined,
      });
    }
    if (snapshotPlan.styleEffects.length > 0 && !styleEffectsAppliedOnSurface) {
      appendTraceOperation(debugStages, "style", {
        kind: "effects",
        effectPlacement: "style",
        effectCount: snapshotPlan.styleEffects.length,
      });
    }

    const overlays = resolveImageOverlays({
      output: document.output,
      timestampText: request.timestampText,
    });
    let overlaysAppliedOnSurface = false;
    let finalizeEffectsAppliedOnSurface = false;
    if (baseSurface && overlays.length > 0) {
      const overlaidSurface = await applyImageOverlaysToSurfaceIfSupported({
        surface: baseSurface,
        overlays,
      });
      if (overlaidSurface) {
        baseSurface = overlaidSurface;
        overlaysAppliedOnSurface = true;
      }
    }

    if (baseSurface && snapshotPlan.finalizeEffects.length > 0 && (overlays.length === 0 || overlaysAppliedOnSurface)) {
      const surfaceFinalizeSnapshotCanvas = hasMaskedFinalizeEffects ? trackSurfaceClone(baseSurface) : null;
      const finalizeSurface = await applyImageEffectsToSurfaceIfSupported({
        surface: baseSurface,
        document,
        effects: snapshotPlan.finalizeEffects,
        stageReferenceCanvas: surfaceFinalizeSnapshotCanvas ?? undefined,
      });
      if (finalizeSurface) {
        baseSurface = finalizeSurface;
        finalizeSnapshotCanvas = surfaceFinalizeSnapshotCanvas;
        finalizeEffectsAppliedOnSurface = true;
      } else if (surfaceFinalizeSnapshotCanvas) {
        surfaceFinalizeSnapshotCanvas.width = 0;
        surfaceFinalizeSnapshotCanvas.height = 0;
      }
    }

    if (baseSurface) {
      trackSurfaceMaterialization(baseSurface, canvas);
    }

    if (overlays.length > 0 && !overlaysAppliedOnSurface) {
      await applyImageOverlaysToCanvasIfSupported({
        canvas,
        overlays,
      });
    }
    if (overlays.length > 0) {
      appendTraceOperation(debugStages, "overlay", {
        kind: "overlay",
        overlayCount: overlays.length,
      });
    }

    if (!finalizeEffectsAppliedOnSurface && snapshotPlan.finalizeEffects.length > 0) {
      finalizeSnapshotCanvas =
        hasMaskedFinalizeEffects ? finalizeSnapshotCanvas ?? trackCanvasClone(canvas) : finalizeSnapshotCanvas;
      await applyImageEffects({
        canvas,
        document,
        effects: snapshotPlan.finalizeEffects,
        stageReferenceCanvas: finalizeSnapshotCanvas ?? undefined,
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
