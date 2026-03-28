import {
  renderDevelopBaseToCanvas,
  renderFilmStageToCanvas,
  renderImageToCanvas,
} from "@/lib/imageProcessing";
import type { RenderIntent } from "@/lib/renderIntent";
import { applyTimestampOverlay } from "@/lib/timestampOverlay";
import { applyImageEffects } from "./effectExecution";
import {
  assertSupportedImageRenderSnapshotPlan,
  createImageRenderSnapshotPlan,
} from "./snapshotPlan";
import {
  compileImageRenderDocumentToProcessSettings,
  compileImageRenderOutputToLegacyTimestampAdjustments,
} from "./stateCompiler";
import type {
  ImageRenderDocument,
  ImageRenderRequest,
  ImageRenderTargetSize,
} from "./types";

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
  const processSettings = compileImageRenderDocumentToProcessSettings(document);
  const renderOptions = {
    canvas,
    source: resolveRuntimeSource(document),
    adjustments: processSettings.adjustments,
    filmProfile: stage === "full" ? processSettings.filmProfile : undefined,
    timestampText: null,
    targetSize: request.targetSize,
    seedKey: stage === "full" ? resolveFilmSeedKey(document) : `${document.id}:${stage}`,
    sourceCacheKey: `${document.revisionKey}:${stage}:${request.targetSize.width}x${request.targetSize.height}`,
    strictErrors: request.intent === "export",
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

const applyImageOutputStages = async ({
  afterOutputEffects,
  canvas,
  developSnapshotCanvas,
  document,
  filmSnapshotCanvas,
  request,
  timestampAdjustments,
  timestampText,
}: {
  afterOutputEffects: ImageRenderDocument["effects"];
  canvas: HTMLCanvasElement;
  developSnapshotCanvas: HTMLCanvasElement | null;
  document: ImageRenderDocument;
  filmSnapshotCanvas: HTMLCanvasElement | null;
  request: ImageRenderRequest;
  timestampAdjustments: ReturnType<typeof compileImageRenderOutputToLegacyTimestampAdjustments>;
  timestampText?: string | null;
}) => {
  await applyTimestampOverlay(canvas, timestampAdjustments, timestampText);

  if (afterOutputEffects.length === 0) {
    return null;
  }

  const afterOutputSnapshotCanvas = cloneCanvasSnapshot(canvas);
  applyImageEffects({
    canvas,
    document,
    effects: afterOutputEffects,
    request,
    snapshots: {
      afterDevelop: developSnapshotCanvas,
      afterFilm: filmSnapshotCanvas ?? canvas,
    },
    stageReferenceCanvas: afterOutputSnapshotCanvas,
  });
  return afterOutputSnapshotCanvas;
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
  const processSettings = compileImageRenderDocumentToProcessSettings(document);

  let filmSnapshotCanvas: HTMLCanvasElement | null = null;
  let developBaseCanvas: HTMLCanvasElement | null = null;
  let developSnapshotCanvas: HTMLCanvasElement | null = null;
  let afterOutputSnapshotCanvas: HTMLCanvasElement | null = null;

  try {
    const hasAfterDevelopEffects = snapshotPlan.afterDevelopEffects.length > 0;
    const requiresDevelopBase =
      hasAfterDevelopEffects || snapshotPlan.requiresDevelopAnalysisSnapshot;

    if (requiresDevelopBase) {
      developBaseCanvas = createSnapshotCanvas(request.targetSize);
      await renderSnapshotToCanvas({
        canvas: developBaseCanvas,
        document,
        request,
        renderSlotSuffix: hasAfterDevelopEffects ? "base-develop" : "analysis-develop",
        stage: "develop-base",
      });
      developSnapshotCanvas =
        hasAfterDevelopEffects || snapshotPlan.requiresDevelopAnalysisSnapshot
        ? cloneCanvasSnapshot(developBaseCanvas)
        : null;
    }

    if (hasAfterDevelopEffects) {
      applyImageEffects({
        canvas: developBaseCanvas!,
        document,
        effects: snapshotPlan.afterDevelopEffects,
        request,
        snapshots: {
          afterDevelop: developSnapshotCanvas ?? developBaseCanvas,
          afterFilm: developBaseCanvas,
        },
        stageReferenceCanvas: developSnapshotCanvas ?? developBaseCanvas!,
      });

      await renderFilmStageToCanvas({
        canvas,
        source: developBaseCanvas!,
        adjustments: processSettings.adjustments,
        filmProfile: processSettings.filmProfile,
        timestampText: null,
        targetSize: request.targetSize,
        seedKey: resolveFilmSeedKey(document),
        sourceCacheKey: `${document.revisionKey}:film-stage:${request.targetSize.width}x${request.targetSize.height}`,
        strictErrors: request.intent === "export",
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

    filmSnapshotCanvas =
      snapshotPlan.afterFilmEffects.length > 0 || snapshotPlan.requiresFilmAnalysisSnapshot
        ? cloneCanvasSnapshot(canvas)
        : null;

    applyImageEffects({
      canvas,
      document,
      effects: snapshotPlan.afterFilmEffects,
      request,
      snapshots: {
        afterDevelop: developSnapshotCanvas,
        afterFilm: filmSnapshotCanvas ?? canvas,
      },
      stageReferenceCanvas: filmSnapshotCanvas ?? canvas,
    });
    afterOutputSnapshotCanvas = await applyImageOutputStages({
    afterOutputEffects: snapshotPlan.afterOutputEffects,
      canvas,
      developSnapshotCanvas,
      document,
      filmSnapshotCanvas,
      request,
      timestampAdjustments: compileImageRenderOutputToLegacyTimestampAdjustments(
        processSettings.output
      ),
      timestampText: request.timestampText,
    });
  } finally {
    if (afterOutputSnapshotCanvas) {
      afterOutputSnapshotCanvas.width = 0;
      afterOutputSnapshotCanvas.height = 0;
    }
    if (filmSnapshotCanvas) {
      filmSnapshotCanvas.width = 0;
      filmSnapshotCanvas.height = 0;
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
