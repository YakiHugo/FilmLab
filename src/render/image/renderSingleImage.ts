import type {
  BackendRenderResult,
  RenderImageStageDebugInfo,
  RenderImageStageResult,
} from "./renderBackend";
import { WebGPURenderBackend } from "./webgpuRenderBackend";
import { sha256FromCanvas } from "@/lib/hash";
import {
  cloneRenderBoundaryMetrics,
  createEmptyRenderBoundaryMetrics,
  type RenderBoundaryMetrics,
  type RenderSurfaceHandle,
} from "@/lib/renderSurfaceHandle";
import { createEmptyAnalysisLayerInputs, validateAnalysisInputs } from "./analysisLayer";
import { applyImageCarrierTransforms } from "./asciiEffect";
import { applyImageEffects } from "./effectExecution";
import {
  applyImageOverlays,
  resolveImageOverlayLayoutScale,
  resolveImageOverlays,
} from "./overlayExecution";
import { resolveRenderQualityTierConfig } from "./qualityTier";
import { applyImageSignalDamage } from "./signalDamageExecution";
import {
  assertSupportedImageRenderSnapshotPlan,
  createImageRenderSnapshotPlan,
} from "./snapshotPlan";
import type { ImageRenderDocument, ImageEffectPlacement, ImageRenderRequest } from "./types";
import { extractImageProcessState } from "./types";

const _backend = new WebGPURenderBackend();

export interface ImageRenderTraceOperation {
  kind: "low-level" | "effects" | "carrier" | "overlay";
  signature: string;
  internalStageId?: RenderImageStageResult["stageId"];
  lowLevel?: RenderImageStageDebugInfo;
  effectPlacement?: ImageEffectPlacement;
  effectCount?: number;
  carrierCount?: number;
  overlayCount?: number;
}

const computeTraceSignature = (operation: Omit<ImageRenderTraceOperation, "signature">): string => {
  switch (operation.kind) {
    case "low-level": {
      const stageId = operation.internalStageId ?? "unknown";
      const status = operation.lowLevel?.status ?? "unknown";
      const passes = operation.lowLevel?.activePasses.join("+") || "none";
      return `low-level:${stageId}:${status}:${passes}`;
    }
    case "effects":
      return `effects:${operation.effectPlacement ?? "unknown"}:${operation.effectCount ?? 0}`;
    case "carrier":
      return `carrier:${operation.carrierCount ?? 0}`;
    case "overlay":
      return `overlay:${operation.overlayCount ?? 0}`;
  }
};

export interface ImageRenderTraceStage {
  id: "develop" | "style" | "overlay" | "finalize";
  operations: ImageRenderTraceOperation[];
}

export interface ImageRenderDebugResult {
  stages?: ImageRenderTraceStage[];
  outputHash?: string;
  boundaries?: RenderBoundaryMetrics;
}

export interface RenderSingleImageResult {
  revisionKey: string;
  debug?: ImageRenderDebugResult;
}

const appendTraceOperation = (
  stages: ImageRenderTraceStage[] | null,
  stageId: ImageRenderTraceStage["id"],
  operation: Omit<ImageRenderTraceOperation, "signature"> | null
) => {
  if (!stages || !operation) {
    return;
  }
  const withSignature: ImageRenderTraceOperation = {
    ...operation,
    signature: computeTraceSignature(operation),
  };
  const existing = stages.find((stage) => stage.id === stageId);
  if (existing) {
    existing.operations.push(withSignature);
    return;
  }
  stages.push({
    id: stageId,
    operations: [withSignature],
  });
};

const resolveRequestTierConfig = (request: ImageRenderRequest) =>
  resolveRenderQualityTierConfig(request.qualityTier);

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
}): Promise<BackendRenderResult> => {
  const tierConfig = resolveRequestTierConfig(request);
  const renderOptions = {
    source: resolveRuntimeSource(document),
    state: extractImageProcessState(document),
    targetSize: request.targetSize,
    seedKey: stage === "full" ? resolveFilmSeedKey(document) : `${document.id}:${stage}`,
    sourceCacheKey: `${document.revisionKey}:${stage}:${request.targetSize.width}x${request.targetSize.height}`,
    strictErrors: request.strictErrors ?? tierConfig.strictErrors,
    intent: tierConfig.renderIntent,
    signal: request.signal,
    debug: request.debug,
    renderSlot: request.renderSlotId
      ? renderSlotSuffix
        ? `${request.renderSlotId}:${renderSlotSuffix}`
        : request.renderSlotId
      : undefined,
  };

  if (stage === "develop-base") {
    return _backend.renderDevelopBase(renderOptions);
  }

  return _backend.renderFull(renderOptions);
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
    signalDamage: document.signalDamage,
    effects: document.effects,
  });
  assertSupportedImageRenderSnapshotPlan(snapshotPlan);
  const debugStages = request.debug?.trace ? ([] as ImageRenderTraceStage[]) : null;
  const debugBoundaries = createEmptyRenderBoundaryMetrics();
  const trackSurfaceClone = (surface: RenderSurfaceHandle) => {
    debugBoundaries.canvasClones += 1;
    return surface.cloneToCanvas();
  };
  const accumulateStageBoundaries = (stageDebug?: RenderImageStageDebugInfo) => {
    if (!stageDebug) {
      return;
    }
    debugBoundaries.textureUploads += stageDebug.boundaries.textureUploads;
    debugBoundaries.cpuPixelReads += stageDebug.boundaries.cpuPixelReads;
  };

  const hasDevelopEffects = snapshotPlan.developEffects.length > 0;
  const hasMaskedDevelopEffects = hasMaskedEffects(snapshotPlan.developEffects);
  const hasMaskedStyleEffects = hasMaskedEffects(snapshotPlan.styleEffects);
  const hasMaskedFinalizeEffects = hasMaskedEffects(snapshotPlan.finalizeEffects);
  const requiresDevelopSnapshot =
    hasMaskedDevelopEffects || snapshotPlan.requiresDevelopAnalysisSnapshot;
  const requiresDevelopBase = hasDevelopEffects || snapshotPlan.requiresDevelopAnalysisSnapshot;

  const analysisInputs = createEmptyAnalysisLayerInputs();

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
      accumulateStageBoundaries(developBaseResult.debug);
      let developSurface = developBaseResult.surface;

      if (requiresDevelopSnapshot) {
        analysisInputs.stageSnapshots.develop = trackSurfaceClone(developSurface);
      }

      if (hasDevelopEffects) {
        developSurface = await applyImageEffects({
          surface: developSurface,
          document,
          effects: snapshotPlan.developEffects,
          stageReferenceCanvas: analysisInputs.stageSnapshots.develop ?? undefined,
        });
        appendTraceOperation(debugStages, "develop", {
          kind: "effects",
          effectPlacement: "develop",
          effectCount: snapshotPlan.developEffects.length,
        });

        const filmTierConfig = resolveRequestTierConfig(request);
        const filmStageResult = await _backend.renderFilmStage({
          source: developSurface.sourceCanvas,
          state: extractImageProcessState(document),
          targetSize: request.targetSize,
          seedKey: resolveFilmSeedKey(document),
          sourceCacheKey: `${document.revisionKey}:film-stage:${request.targetSize.width}x${request.targetSize.height}`,
          strictErrors: request.strictErrors ?? filmTierConfig.strictErrors,
          intent: filmTierConfig.renderIntent,
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
        accumulateStageBoundaries(filmStageResult.debug);
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
        accumulateStageBoundaries(fullRenderResult.debug);
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
      accumulateStageBoundaries(fullRenderResult.debug);
    }

    if (snapshotPlan.carrierTransforms.length > 0) {
      analysisInputs.stageSnapshots.style = trackSurfaceClone(surface);

      const analysisValidation = validateAnalysisInputs(
        snapshotPlan.analysisRequirements,
        analysisInputs
      );
      if (!analysisValidation.valid) {
        const tierConfig = resolveRequestTierConfig(request);
        if (tierConfig.strictErrors) {
          throw new Error(`Missing analysis inputs: ${analysisValidation.missing.join(", ")}`);
        }
      }

      surface = await applyImageCarrierTransforms({
        surface,
        carrierTransforms: snapshotPlan.carrierTransforms,
        document,
        request,
        analysisInputs,
        stageReferenceCanvas: analysisInputs.stageSnapshots.style!,
      });
      appendTraceOperation(debugStages, "style", {
        kind: "carrier",
        carrierCount: snapshotPlan.carrierTransforms.length,
      });
    }

    if (snapshotPlan.signalDamage.length > 0) {
      const hasMaskedSignalDamage = snapshotPlan.signalDamage.some((n) => Boolean(n.maskId));
      const signalDamageReferenceCanvas = hasMaskedSignalDamage ? trackSurfaceClone(surface) : null;
      try {
        surface = await applyImageSignalDamage({
          surface,
          signalDamage: snapshotPlan.signalDamage,
          document,
          stageReferenceCanvas: signalDamageReferenceCanvas ?? undefined,
        });
        appendTraceOperation(debugStages, "style", {
          kind: "carrier",
          carrierCount: snapshotPlan.signalDamage.length,
        });
      } finally {
        releaseCanvas(signalDamageReferenceCanvas);
      }
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
      semanticOverlays: document.semanticOverlays,
      layoutScale: resolveImageOverlayLayoutScale({
        width: surface.width,
        height: surface.height,
        referenceWidth: request.overlayReferenceSize?.width,
        referenceHeight: request.overlayReferenceSize?.height,
      }),
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
    releaseCanvas(analysisInputs.stageSnapshots.style);
    releaseCanvas(analysisInputs.stageSnapshots.develop);
    releaseCanvas(analysisInputs.edgeMap);
  }

  let debugResult: ImageRenderDebugResult | undefined;
  if (request.debug?.trace || request.debug?.outputHash) {
    debugResult = {};
    if (debugStages) {
      debugResult.stages = debugStages;
    }
    debugResult.boundaries = cloneRenderBoundaryMetrics(debugBoundaries);
    if (request.debug.outputHash) {
      debugResult.outputHash = await sha256FromCanvas(canvas);
    }
  }

  if (import.meta.env.DEV) {
    (globalThis as { __filmlab_lastBoundaries?: RenderBoundaryMetrics }).__filmlab_lastBoundaries =
      cloneRenderBoundaryMetrics(debugBoundaries);
  }

  return {
    revisionKey: document.revisionKey,
    debug: debugResult,
  };
};
