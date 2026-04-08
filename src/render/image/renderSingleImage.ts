import {
  renderDevelopBaseToCanvas,
  renderFilmStageToCanvas,
  renderImageToCanvas,
} from "@/lib/imageProcessing";
import type { RenderIntent } from "@/lib/renderIntent";
import { applyImageEffects } from "./effectExecution";
import { applyImageOverlays, resolveImageOverlays } from "./overlayExecution";
import {
  assertSupportedImageRenderSnapshotPlan,
  createImageRenderSnapshotPlan,
} from "./snapshotPlan";
import type {
  ImageRenderDocument,
  ImageRenderRequest,
  ImageRenderTargetSize,
} from "./types";
import { extractImageProcessState } from "./types";

const resolveLegacyRenderIntent = (request: ImageRenderRequest): RenderIntent => {
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
}) => {
  const renderOptions = {
    canvas,
    source: resolveRuntimeSource(document),
    state: extractImageProcessState(document),
    targetSize: request.targetSize,
    seedKey: stage === "full" ? resolveFilmSeedKey(document) : `${document.id}:${stage}`,
    sourceCacheKey: `${document.revisionKey}:${stage}:${request.targetSize.width}x${request.targetSize.height}`,
    strictErrors: request.strictErrors ?? request.intent === "export",
    intent: resolveLegacyRenderIntent(request),
    signal: request.signal,
    renderSlot: request.renderSlotId
      ? renderSlotSuffix
        ? `${request.renderSlotId}:${renderSlotSuffix}`
        : request.renderSlotId
      : undefined,
  };

  if (stage === "develop-base") {
    await renderDevelopBaseToCanvas(renderOptions);
    return;
  }

  await renderImageToCanvas(renderOptions);
};

const applyImageFinalizeStages = async ({
  canvas,
  developSnapshotCanvas,
  document,
  styleSnapshotCanvas,
  finalizeEffects,
  request,
}: {
  canvas: HTMLCanvasElement;
  developSnapshotCanvas: HTMLCanvasElement | null;
  document: ImageRenderDocument;
  styleSnapshotCanvas: HTMLCanvasElement | null;
  finalizeEffects: ImageRenderDocument["effects"];
  request: ImageRenderRequest;
}) => {
  await applyImageOverlays({
    canvas,
    overlays: resolveImageOverlays({
      output: document.output,
      timestampText: request.timestampText,
    }),
  });

  if (finalizeEffects.length === 0) {
    return null;
  }

  const finalizeSnapshotCanvas = cloneCanvasSnapshot(canvas);
  applyImageEffects({
    canvas,
    document,
    effects: finalizeEffects,
    request,
    snapshots: {
      develop: developSnapshotCanvas,
      style: styleSnapshotCanvas ?? canvas,
    },
    stageReferenceCanvas: finalizeSnapshotCanvas,
  });
  return finalizeSnapshotCanvas;
};

export const renderSingleImageToCanvas = async ({
  canvas,
  document,
  request,
}: {
  canvas: HTMLCanvasElement;
  document: ImageRenderDocument;
  request: ImageRenderRequest;
}) => {
  const snapshotPlan = createImageRenderSnapshotPlan(document.effects);
  assertSupportedImageRenderSnapshotPlan(snapshotPlan);

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
      await renderSnapshotToCanvas({
        canvas: developBaseCanvas,
        document,
        request,
        renderSlotSuffix: hasDevelopEffects ? "base-develop" : "analysis-develop",
        stage: "develop-base",
      });
      developSnapshotCanvas =
        hasDevelopEffects || snapshotPlan.requiresDevelopAnalysisSnapshot
          ? cloneCanvasSnapshot(developBaseCanvas)
          : null;
    }

    if (hasDevelopEffects) {
      applyImageEffects({
        canvas: developBaseCanvas!,
        document,
        effects: snapshotPlan.developEffects,
        request,
        snapshots: {
          develop: developSnapshotCanvas ?? developBaseCanvas,
          style: developBaseCanvas,
        },
        stageReferenceCanvas: developSnapshotCanvas ?? developBaseCanvas!,
      });

      await renderFilmStageToCanvas({
        canvas,
        source: developBaseCanvas!,
        state: extractImageProcessState(document),
        targetSize: request.targetSize,
        seedKey: resolveFilmSeedKey(document),
        sourceCacheKey: `${document.revisionKey}:film-stage:${request.targetSize.width}x${request.targetSize.height}`,
        strictErrors: request.strictErrors ?? request.intent === "export",
        intent: resolveLegacyRenderIntent(request),
        signal: request.signal,
        renderSlot: request.renderSlotId ? `${request.renderSlotId}:base-film-stage` : undefined,
      });
    } else {
      await renderSnapshotToCanvas({
        canvas,
        document,
        request,
        renderSlotSuffix: "base-film",
        stage: "full",
      });
    }

    styleSnapshotCanvas =
      snapshotPlan.styleEffects.length > 0 || snapshotPlan.requiresStyleAnalysisSnapshot
        ? cloneCanvasSnapshot(canvas)
        : null;

    applyImageEffects({
      canvas,
      document,
      effects: snapshotPlan.styleEffects,
      request,
      snapshots: {
        develop: developSnapshotCanvas,
        style: styleSnapshotCanvas ?? canvas,
      },
      stageReferenceCanvas: styleSnapshotCanvas ?? canvas,
    });
    finalizeSnapshotCanvas = await applyImageFinalizeStages({
      canvas,
      developSnapshotCanvas,
      document,
      styleSnapshotCanvas,
      finalizeEffects: snapshotPlan.finalizeEffects,
      request,
    });
  } finally {
    if (finalizeSnapshotCanvas) {
      finalizeSnapshotCanvas.width = 0;
      finalizeSnapshotCanvas.height = 0;
    }
    if (styleSnapshotCanvas) {
      styleSnapshotCanvas.width = 0;
      styleSnapshotCanvas.height = 0;
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

  return {
    revisionKey: document.revisionKey,
  };
};
