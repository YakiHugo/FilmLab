import type React from "react";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { releaseRenderSlots, renderImageToCanvas } from "@/lib/imageProcessing";
import { applyMaskToLayerCanvas, generateMaskTexture } from "@/lib/layerMaskTexture";
import { resolveViewportRenderRegion } from "@/lib/renderer/viewportRegion";
import { applyTimestampOverlay } from "@/lib/timestampOverlay";
import type { Asset, EditingAdjustments } from "@/types";
import {
  compositeRetainedPreviewLayers,
  copyPreviewCanvas,
  ensurePreviewCanvasSize,
  type RetainedPreviewLayerSurface,
} from "./composite";
import {
  requiresLayerComposite,
  resolveSingleRenderableLayerEntry,
} from "../rendering";
import type {
  EditorPreviewDocument,
  LayerPreviewEntry,
  PreviewFrameSize,
  PreviewQuality,
  PreviewRequest,
  PreviewResult,
} from "./contracts";
import {
  buildPreviewRenderSlot,
  buildPreviewRenderSlotPrefix,
} from "./requestUtils";
import { usePreviewScheduler, type PreviewSchedulerDescriptor } from "./usePreviewScheduler";
import { calculatePreviewViewportRoi } from "./viewportRoi";

interface UsePreviewRenderPipelineInput {
  document: EditorPreviewDocument | null;
  frameSize: PreviewFrameSize;
  isCropMode: boolean;
  layerPreviewEntries: LayerPreviewEntry[];
  orientedSourceAspectRatio: number;
  previewRenderSeed: number;
  shouldRenderLayerComposite: boolean;
  sourceAsset: Asset | null;
  timestampText: string | null;
  viewOffset: { x: number; y: number };
  viewScale: number;
}

export interface UsePreviewRenderPipelineOutput {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  originalImageRef: React.MutableRefObject<HTMLImageElement | null>;
  previewResult: PreviewResult | null;
  renderVersion: number;
  renderedRotate: number;
}

interface PreviewCanvasBucket {
  outputCanvas: HTMLCanvasElement;
  layerCanvases: Map<string, HTMLCanvasElement>;
  layerMaskCanvases: Map<string, HTMLCanvasElement>;
  layerMaskScratchCanvases: Map<string, HTMLCanvasElement>;
  maskedLayerCanvases: Map<string, HTMLCanvasElement>;
}

interface PreviewRenderExecutionResult {
  outputCanvas: HTMLCanvasElement;
  renderedRoi: PreviewResult["renderedRoi"];
  renderVersion: number;
  renderedRotate: number;
}

export const MAX_RETAINED_PREVIEW_DOCUMENTS = 2;

const createAbortError = () => new DOMException("Aborted", "AbortError");

const createPreviewCanvasBucket = (): PreviewCanvasBucket => ({
  outputCanvas: document.createElement("canvas"),
  layerCanvases: new Map(),
  layerMaskCanvases: new Map(),
  layerMaskScratchCanvases: new Map(),
  maskedLayerCanvases: new Map(),
});

const releaseCanvas = (canvas: HTMLCanvasElement) => {
  canvas.width = 0;
  canvas.height = 0;
};

const releaseCanvasMap = (map: Map<string, HTMLCanvasElement>) => {
  for (const canvas of map.values()) {
    releaseCanvas(canvas);
  }
  map.clear();
};

const releasePreviewCanvasBucket = (bucket: PreviewCanvasBucket) => {
  releaseCanvas(bucket.outputCanvas);
  releaseCanvasMap(bucket.layerCanvases);
  releaseCanvasMap(bucket.layerMaskCanvases);
  releaseCanvasMap(bucket.layerMaskScratchCanvases);
  releaseCanvasMap(bucket.maskedLayerCanvases);
};

const getRetainedCanvas = (map: Map<string, HTMLCanvasElement>, key: string) => {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const next = document.createElement("canvas");
  map.set(key, next);
  return next;
};

const pruneRetainedCanvasMap = (
  map: Map<string, HTMLCanvasElement>,
  activeKeys: Set<string>
) => {
  for (const [key, canvas] of map.entries()) {
    if (activeKeys.has(key)) {
      continue;
    }
    releaseCanvas(canvas);
    map.delete(key);
  }
};

const resolveRenderSource = (asset: Asset) => asset.blob ?? asset.objectUrl;

const resolvePreviewAdjustments = (
  request: PreviewRequest,
  adjustments: EditingAdjustments
): EditingAdjustments => {
  if (!request.isCropMode) {
    return adjustments;
  }
  return {
    ...adjustments,
    aspectRatio: "original",
    customAspectRatio: request.orientedSourceAspectRatio,
  };
};

export const resolveLayerPreviewAdjustments = (
  request: PreviewRequest,
  adjustments: EditingAdjustments
) =>
  request.showOriginal
    ? resolvePreviewAdjustments(request, createDefaultAdjustments())
    : resolvePreviewAdjustments(request, adjustments);

export const resolveLayerPreviewFilmProfile = (
  request: PreviewRequest,
  sourceAsset: Asset
) => {
  if (request.showOriginal) {
    return undefined;
  }
  return sourceAsset.id === request.sourceAsset.id
    ? request.document.filmProfile ?? undefined
    : sourceAsset.filmProfile ?? undefined;
};

const resolveCompositeViewportRoi = (request: PreviewRequest) =>
  request.document.adjustments.timestampEnabled ? null : request.viewportRoi;

const resolvePreviewSourceCacheKey = (
  documentKey: string,
  asset: Asset,
  suffix = "base"
) => `preview:${documentKey}:${suffix}:${asset.id}:${asset.size}`;

const releaseRetainedPreviewDocument = (documentKey: string, buckets: Record<PreviewQuality, PreviewCanvasBucket>) => {
  releasePreviewCanvasBucket(buckets.interactive);
  releasePreviewCanvasBucket(buckets.full);
  void releaseRenderSlots("preview", buildPreviewRenderSlotPrefix(documentKey));
};

export const pruneRetainedPreviewDocuments = <T>(
  bucketsByDocument: Map<string, T>,
  maxDocuments: number,
  onEvict: (documentKey: string, value: T) => void
) => {
  while (bucketsByDocument.size > maxDocuments) {
    const oldestEntry = bucketsByDocument.entries().next().value as [string, T] | undefined;
    if (!oldestEntry) {
      return;
    }
    const [documentKey, value] = oldestEntry;
    bucketsByDocument.delete(documentKey);
    onEvict(documentKey, value);
  }
};

const buildLayerPreviewSurfaces = (
  bucket: PreviewCanvasBucket,
  layerEntries: LayerPreviewEntry[],
  frameSize: PreviewFrameSize
): RetainedPreviewLayerSurface[] => {
  const surfaces: RetainedPreviewLayerSurface[] = [];
  const layersBottomToTop = [...layerEntries].reverse();
  for (const entry of layersBottomToTop) {
    const maskedLayerCanvas = bucket.maskedLayerCanvases.get(entry.layer.id);
    const layerCanvas = bucket.layerCanvases.get(entry.layer.id);
    const drawCanvas = entry.layer.mask
      ? maskedLayerCanvas ?? layerCanvas ?? null
      : layerCanvas ?? null;
    if (!drawCanvas) {
      continue;
    }
    ensurePreviewCanvasSize(drawCanvas, frameSize.width, frameSize.height);
    surfaces.push({
      canvas: drawCanvas,
      opacity: entry.opacity,
      blendMode: entry.blendMode,
    });
  }
  return surfaces;
};

const renderSinglePreviewLayer = async (
  bucket: PreviewCanvasBucket,
  request: PreviewRequest,
  signal: AbortSignal,
  requestId: number,
  viewportRoi: PreviewResult["renderedRoi"]
): Promise<PreviewRenderExecutionResult> => {
  const entry = resolveSingleRenderableLayerEntry(request.layerEntries);
  if (!entry) {
    throw new Error("Single-layer preview requested without a renderable layer.");
  }

  const activeLayerIds = new Set([entry.layer.id]);
  pruneRetainedCanvasMap(bucket.layerCanvases, activeLayerIds);
  pruneRetainedCanvasMap(bucket.layerMaskCanvases, activeLayerIds);
  pruneRetainedCanvasMap(bucket.layerMaskScratchCanvases, activeLayerIds);
  pruneRetainedCanvasMap(bucket.maskedLayerCanvases, activeLayerIds);

  const layerAdjustments = resolveLayerPreviewAdjustments(request, entry.adjustments);
  const layerSource = resolveRenderSource(entry.sourceAsset);
  if (!layerSource) {
    throw new Error(`Preview source missing for asset ${entry.sourceAsset.id}.`);
  }
  const layerFilmProfile = resolveLayerPreviewFilmProfile(request, entry.sourceAsset);
  const needsComposite = requiresLayerComposite(entry);
  const layerCanvas = needsComposite
    ? getRetainedCanvas(bucket.layerCanvases, entry.layer.id)
    : bucket.outputCanvas;

  await renderImageToCanvas({
    canvas: layerCanvas,
    source: layerSource,
    adjustments: layerAdjustments,
    filmProfile: layerFilmProfile,
    timestampText: needsComposite ? null : request.timestampText,
    targetSize: request.frameSize,
    intent:
      request.quality === "interactive"
        ? "preview-interactive"
        : "preview-full",
    renderSeed: request.previewRenderSeed + 1,
    seedKey: `${request.documentKey}:${entry.layer.id}`,
    signal,
    sourceCacheKey: resolvePreviewSourceCacheKey(
      request.documentKey,
      entry.sourceAsset,
      `layer:${entry.layer.id}`
    ),
    renderSlot: buildPreviewRenderSlot(request.documentKey, `layer:${entry.layer.id}`),
    viewportRoi,
  });

  if (!needsComposite) {
    return {
      outputCanvas: bucket.outputCanvas,
      renderedRoi: viewportRoi,
      renderVersion: requestId,
      renderedRotate: layerAdjustments.rotate,
    };
  }

  if (entry.layer.mask) {
    const maskCanvas = getRetainedCanvas(bucket.layerMaskCanvases, entry.layer.id);
    const scratchCanvas = getRetainedCanvas(
      bucket.layerMaskScratchCanvases,
      entry.layer.id
    );
    const maskedLayerCanvas = getRetainedCanvas(bucket.maskedLayerCanvases, entry.layer.id);
    const generatedMask = generateMaskTexture(entry.layer.mask, {
      width: request.frameSize.width,
      height: request.frameSize.height,
      referenceSource: layerCanvas,
      targetCanvas: maskCanvas,
      scratchCanvas,
    });
    if (generatedMask) {
      applyMaskToLayerCanvas(layerCanvas, generatedMask, maskedLayerCanvas);
    } else {
      copyPreviewCanvas(maskedLayerCanvas, layerCanvas);
    }
  }

  ensurePreviewCanvasSize(bucket.outputCanvas, request.frameSize.width, request.frameSize.height);
  const compositeRegion = resolveViewportRenderRegion(
    request.frameSize.width,
    request.frameSize.height,
    resolveCompositeViewportRoi(request)
  );
  const layerSurfaces = buildLayerPreviewSurfaces(bucket, [entry], request.frameSize);
  if (
    !compositeRetainedPreviewLayers({
      targetCanvas: bucket.outputCanvas,
      layerSurfaces,
      region: compositeRegion,
    })
  ) {
    throw new Error("Failed to compose single-layer preview.");
  }

  await applyTimestampOverlay(
    bucket.outputCanvas,
    request.document.adjustments,
    request.timestampText
  );

  return {
    outputCanvas: bucket.outputCanvas,
    renderedRoi: resolveCompositeViewportRoi(request),
    renderVersion: requestId,
    renderedRotate: layerAdjustments.rotate,
  };
};

export function usePreviewRenderPipeline({
  document,
  frameSize,
  isCropMode,
  layerPreviewEntries,
  orientedSourceAspectRatio,
  previewRenderSeed,
  shouldRenderLayerComposite,
  sourceAsset,
  timestampText,
  viewOffset,
  viewScale,
}: UsePreviewRenderPipelineInput): UsePreviewRenderPipelineOutput {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const documentBucketsRef = useRef<
    Map<string, Record<PreviewQuality, PreviewCanvasBucket>>
  >(new Map());
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [renderedRotate, setRenderedRotate] = useState(document?.adjustments.rotate ?? 0);

  const viewportRoi = useMemo(
    () =>
      isCropMode
        ? null
        : calculatePreviewViewportRoi({
            frameSize,
            viewScale,
            viewOffset,
          }),
    [frameSize, isCropMode, viewOffset, viewScale]
  );

  const canRenderPreview =
    Boolean(document) &&
    Boolean(sourceAsset) &&
    frameSize.width > 0 &&
    frameSize.height > 0 &&
    Boolean(resolveRenderSource(sourceAsset as Asset)) &&
    (!document?.showOriginal || shouldRenderLayerComposite);

  const descriptor = useMemo<PreviewSchedulerDescriptor<PreviewRequest> | null>(() => {
    if (!document || !sourceAsset || !canRenderPreview) {
      return null;
    }
    return {
      documentKey: document.documentKey,
      createRequest: (quality) => ({
        document,
        documentKey: document.documentKey,
        quality,
        frameSize,
        viewportRoi,
        layerEntries: layerPreviewEntries,
        showOriginal: document.showOriginal,
        timestampText,
        isCropMode,
        orientedSourceAspectRatio,
        previewRenderSeed,
        sourceAsset,
        shouldRenderLayerComposite,
      }),
    };
  }, [
    canRenderPreview,
    document,
    frameSize,
    isCropMode,
    layerPreviewEntries,
    orientedSourceAspectRatio,
    previewRenderSeed,
    shouldRenderLayerComposite,
    sourceAsset,
    timestampText,
    viewportRoi,
  ]);

  const getBucket = (documentKey: string, quality: PreviewQuality) => {
    const existing = documentBucketsRef.current.get(documentKey);
    if (existing) {
      documentBucketsRef.current.delete(documentKey);
      documentBucketsRef.current.set(documentKey, existing);
      return existing[quality];
    }
    const created = {
      interactive: createPreviewCanvasBucket(),
      full: createPreviewCanvasBucket(),
    } satisfies Record<PreviewQuality, PreviewCanvasBucket>;
    documentBucketsRef.current.set(documentKey, created);
    pruneRetainedPreviewDocuments(
      documentBucketsRef.current,
      MAX_RETAINED_PREVIEW_DOCUMENTS,
      releaseRetainedPreviewDocument
    );
    return created[quality];
  };

  useEffect(() => {
    const bucketsByDocument = documentBucketsRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    return () => {
      for (const [documentKey, buckets] of bucketsByDocument.entries()) {
        releaseRetainedPreviewDocument(documentKey, buckets);
      }
      bucketsByDocument.clear();
      if (overlayCanvas) {
        overlayCanvas.width = 0;
        overlayCanvas.height = 0;
      }
    };
  }, []);

  useEffect(() => {
    if (document?.documentKey) {
      return;
    }
    for (const [documentKey, buckets] of documentBucketsRef.current.entries()) {
      releaseRetainedPreviewDocument(documentKey, buckets);
    }
    documentBucketsRef.current.clear();
  }, [document?.documentKey]);

  useEffect(() => {
    setRenderedRotate(document?.adjustments.rotate ?? 0);
  }, [document?.adjustments.rotate]);

  useEffect(() => {
    setPreviewResult(null);
    const previewCanvas = canvasRef.current;
    if (!previewCanvas) {
      return;
    }
    const context = previewCanvas.getContext("2d", { willReadFrequently: true });
    context?.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  }, [document?.documentKey]);

  useEffect(() => {
    if (canRenderPreview) {
      return;
    }
    setPreviewResult(null);
  }, [canRenderPreview]);

  usePreviewScheduler<PreviewRequest, PreviewRenderExecutionResult>({
    descriptor,
    execute: async (request, signal, requestId) => {
      const bucket = getBucket(request.documentKey, request.quality);
      const source = resolveRenderSource(request.sourceAsset);
      if (!source) {
        throw new Error(`Preview source missing for asset ${request.sourceAsset.id}.`);
      }

      const effectiveViewportRoi =
        request.isCropMode || request.document.adjustments.timestampEnabled
          ? null
          : request.viewportRoi;
      const singleLayerEntry = resolveSingleRenderableLayerEntry(request.layerEntries);

      if (singleLayerEntry) {
        return renderSinglePreviewLayer(
          bucket,
          request,
          signal,
          requestId,
          effectiveViewportRoi
        );
      }

      if (!request.shouldRenderLayerComposite) {
        const adjustments = resolvePreviewAdjustments(request, request.document.adjustments);
        await renderImageToCanvas({
          canvas: bucket.outputCanvas,
          source,
          adjustments,
          filmProfile: request.document.filmProfile ?? undefined,
          timestampText: request.timestampText,
          targetSize: request.frameSize,
          intent:
            request.quality === "interactive"
              ? "preview-interactive"
              : "preview-full",
          renderSeed: request.previewRenderSeed,
          seedKey: `${request.documentKey}:main`,
          signal,
          sourceCacheKey: resolvePreviewSourceCacheKey(
            request.documentKey,
            request.sourceAsset
          ),
          renderSlot: buildPreviewRenderSlot(request.documentKey),
          viewportRoi: effectiveViewportRoi,
        });
        if (signal.aborted) {
          throw createAbortError();
        }
        return {
          outputCanvas: bucket.outputCanvas,
          renderedRoi: effectiveViewportRoi,
          renderVersion: requestId,
          renderedRotate: adjustments.rotate,
        };
      }

      const activeLayerIds = new Set(request.layerEntries.map((entry) => entry.layer.id));
      pruneRetainedCanvasMap(bucket.layerCanvases, activeLayerIds);
      pruneRetainedCanvasMap(bucket.layerMaskCanvases, activeLayerIds);
      pruneRetainedCanvasMap(bucket.layerMaskScratchCanvases, activeLayerIds);
      pruneRetainedCanvasMap(bucket.maskedLayerCanvases, activeLayerIds);

      for (const entry of request.layerEntries) {
        const layerCanvas = getRetainedCanvas(bucket.layerCanvases, entry.layer.id);
        const layerAdjustments = resolveLayerPreviewAdjustments(request, entry.adjustments);
        const layerSource = resolveRenderSource(entry.sourceAsset);
        const layerFilmProfile = resolveLayerPreviewFilmProfile(request, entry.sourceAsset);

        await renderImageToCanvas({
          canvas: layerCanvas,
          source: layerSource,
          adjustments: layerAdjustments,
          filmProfile: layerFilmProfile,
          timestampText: null,
          targetSize: request.frameSize,
          intent:
            request.quality === "interactive"
              ? "preview-interactive"
              : "preview-full",
          renderSeed: request.previewRenderSeed + request.layerEntries.indexOf(entry) + 1,
          seedKey: `${request.documentKey}:${entry.layer.id}`,
          signal,
          sourceCacheKey: resolvePreviewSourceCacheKey(
            request.documentKey,
            entry.sourceAsset,
            `layer:${entry.layer.id}`
          ),
          renderSlot: buildPreviewRenderSlot(request.documentKey, `layer:${entry.layer.id}`),
          viewportRoi: effectiveViewportRoi,
        });

        if (!entry.layer.mask) {
          continue;
        }

        const maskCanvas = getRetainedCanvas(bucket.layerMaskCanvases, entry.layer.id);
        const scratchCanvas = getRetainedCanvas(
          bucket.layerMaskScratchCanvases,
          entry.layer.id
        );
        const maskedLayerCanvas = getRetainedCanvas(bucket.maskedLayerCanvases, entry.layer.id);
        const generatedMask = generateMaskTexture(entry.layer.mask, {
          width: request.frameSize.width,
          height: request.frameSize.height,
          referenceSource: layerCanvas,
          targetCanvas: maskCanvas,
          scratchCanvas,
        });
        if (generatedMask) {
          applyMaskToLayerCanvas(layerCanvas, generatedMask, maskedLayerCanvas);
        } else {
          copyPreviewCanvas(maskedLayerCanvas, layerCanvas);
        }

        if (signal.aborted) {
          throw createAbortError();
        }
      }

      ensurePreviewCanvasSize(bucket.outputCanvas, request.frameSize.width, request.frameSize.height);
      const compositeRegion = resolveViewportRenderRegion(
        request.frameSize.width,
        request.frameSize.height,
        resolveCompositeViewportRoi(request)
      );
      const layerSurfaces = buildLayerPreviewSurfaces(
        bucket,
        request.layerEntries,
        request.frameSize
      );
      if (
        !compositeRetainedPreviewLayers({
          targetCanvas: bucket.outputCanvas,
          layerSurfaces,
          region: compositeRegion,
        })
      ) {
        throw new Error("Failed to compose retained preview layers.");
      }

      await applyTimestampOverlay(
        bucket.outputCanvas,
        request.document.adjustments,
        request.timestampText
      );

      if (signal.aborted) {
        throw createAbortError();
      }

      return {
        outputCanvas: bucket.outputCanvas,
        renderedRoi: resolveCompositeViewportRoi(request),
        renderVersion: requestId,
        renderedRotate: request.document.adjustments.rotate,
      };
    },
    onError: (error, request) => {
      console.warn("[FilmLab] Preview render failed.", request.documentKey, request.quality, error);
    },
    onResult: (result) => {
      const previewCanvas = canvasRef.current;
      if (previewCanvas) {
        copyPreviewCanvas(previewCanvas, result.outputCanvas);
      }
      startTransition(() => {
        setRenderedRotate(result.renderedRotate);
        setPreviewResult({
          requestId: result.requestId,
          quality: result.quality,
          renderedRoi: result.renderedRoi,
          renderVersion: result.renderVersion,
        });
      });
    },
  });

  return {
    canvasRef,
    overlayCanvasRef,
    originalImageRef,
    previewResult,
    renderVersion: previewResult?.renderVersion ?? 0,
    renderedRotate,
  };
}
