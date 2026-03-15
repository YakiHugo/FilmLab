import type React from "react";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { createDefaultAdjustments } from "@/lib/adjustments";
import { releaseRenderSlots, renderImageToCanvas } from "@/lib/imageProcessing";
import { resolveViewportRenderRegion } from "@/lib/renderer/viewportRegion";
import { applyTimestampOverlay } from "@/lib/timestampOverlay";
import type { Asset, EditingAdjustments } from "@/types";
import {
  copyPreviewCanvas,
} from "./composite";
import {
  buildViewportRoiDirtyKey,
  type DirtyReason,
  type RenderLayerNode,
} from "../renderGraph";
import {
  composeRenderGraphToCanvas,
  type RenderGraphCanvasWorkspace,
} from "../renderGraphComposition";
import {
  requiresLayerComposite,
  resolveSingleRenderableLayerEntry,
} from "../rendering";
import type {
  EditorPreviewDocument,
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

const resolvePreviewSourceCacheToken = (asset: Asset) =>
  asset.contentHash?.trim() || asset.objectUrl || `${asset.id}:${asset.size}`;

export const resolvePreviewSourceCacheKey = (
  asset: Asset,
  suffix = "base"
) => `preview:source:${suffix}:${asset.id}:${asset.size}:${resolvePreviewSourceCacheToken(asset)}`;

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

const createPreviewWorkspace = (bucket: PreviewCanvasBucket): RenderGraphCanvasWorkspace => ({
  getLayerCanvas: (layerId) => getRetainedCanvas(bucket.layerCanvases, layerId),
  getLayerMaskCanvas: (layerId) => getRetainedCanvas(bucket.layerMaskCanvases, layerId),
  getLayerMaskScratchCanvas: (layerId) =>
    getRetainedCanvas(bucket.layerMaskScratchCanvases, layerId),
  getMaskedLayerCanvas: (layerId) => getRetainedCanvas(bucket.maskedLayerCanvases, layerId),
});

const clearRetainedCanvasEntries = (
  map: Map<string, HTMLCanvasElement>,
  activeKeys: Set<string>
) => {
  for (const [key, canvas] of map.entries()) {
    if (!activeKeys.has(key)) {
      continue;
    }
    releaseCanvas(canvas);
  }
};

const resetRetainedCanvasesForDirtyReasons = (
  bucket: PreviewCanvasBucket,
  activeLayerIds: Set<string>,
  dirtyReasons: DirtyReason[]
) => {
  if (
    dirtyReasons.some((reason) =>
      [
        "source",
        "layer-stack",
        "layer-adjustments",
        "document-adjustments",
        "film-profile",
        "local-adjustments",
      ].includes(reason)
    )
  ) {
    clearRetainedCanvasEntries(bucket.layerCanvases, activeLayerIds);
  }

  if (
    dirtyReasons.some((reason) =>
      ["layer-stack", "layer-mask", "local-adjustments"].includes(reason)
    )
  ) {
    clearRetainedCanvasEntries(bucket.layerMaskCanvases, activeLayerIds);
    clearRetainedCanvasEntries(bucket.layerMaskScratchCanvases, activeLayerIds);
    clearRetainedCanvasEntries(bucket.maskedLayerCanvases, activeLayerIds);
  }
};

const renderSinglePreviewLayer = async (
  bucket: PreviewCanvasBucket,
  request: PreviewRequest,
  signal: AbortSignal,
  requestId: number,
  viewportRoi: PreviewResult["renderedRoi"]
): Promise<PreviewRenderExecutionResult> => {
  const node = resolveSingleRenderableLayerEntry(request.renderGraph.layers);
  if (!node) {
    throw new Error("Single-layer preview requested without a renderable layer.");
  }

  const activeLayerIds = new Set([node.id]);
  pruneRetainedCanvasMap(bucket.layerCanvases, activeLayerIds);
  pruneRetainedCanvasMap(bucket.layerMaskCanvases, activeLayerIds);
  pruneRetainedCanvasMap(bucket.layerMaskScratchCanvases, activeLayerIds);
  pruneRetainedCanvasMap(bucket.maskedLayerCanvases, activeLayerIds);
  resetRetainedCanvasesForDirtyReasons(bucket, activeLayerIds, request.dirtyReasons);

  const layerAdjustments = resolveLayerPreviewAdjustments(request, node.adjustments);
  const layerSource = resolveRenderSource(node.sourceAsset);
  if (!layerSource) {
    throw new Error(`Preview source missing for asset ${node.sourceAsset.id}.`);
  }
  const layerFilmProfile = resolveLayerPreviewFilmProfile(request, node.sourceAsset);
  const needsComposite = requiresLayerComposite(node);

  if (!needsComposite) {
    await renderImageToCanvas({
      canvas: bucket.outputCanvas,
      source: layerSource,
      adjustments: layerAdjustments,
      filmProfile: layerFilmProfile,
      timestampText: request.timestampText,
      targetSize: request.frameSize,
      intent:
        request.quality === "interactive"
          ? "preview-interactive"
          : "preview-full",
      renderSeed: request.previewRenderSeed + 1,
      seedKey: `${request.graphKey}:${node.id}`,
      signal,
      sourceCacheKey: resolvePreviewSourceCacheKey(node.sourceAsset, `layer:${node.id}`),
      renderSlot: buildPreviewRenderSlot(
        request.documentKey,
        `${request.graphKey}:layer:${node.id}`
      ),
      viewportRoi,
    });
    return {
      outputCanvas: bucket.outputCanvas,
      renderedRoi: viewportRoi,
      renderVersion: requestId,
      renderedRotate: layerAdjustments.rotate,
    };
  }

  const compositeRegion = resolveViewportRenderRegion(
    request.frameSize.width,
    request.frameSize.height,
    resolveCompositeViewportRoi(request)
  );
  const didCompose = await composeRenderGraphToCanvas({
    targetCanvas: bucket.outputCanvas,
    renderGraph: {
      ...request.renderGraph,
      layers: [node],
    },
    workspace: createPreviewWorkspace(bucket),
    region: compositeRegion,
    targetSize: request.frameSize,
    renderLayerNode: async (layerNode, retainedCanvas) => {
      const retainedSource = resolveRenderSource(layerNode.sourceAsset);
      if (!retainedSource) {
        throw new Error(`Preview source missing for asset ${layerNode.sourceAsset.id}.`);
      }
      await renderImageToCanvas({
        canvas: retainedCanvas,
        source: retainedSource,
        adjustments: resolveLayerPreviewAdjustments(request, layerNode.adjustments),
        filmProfile: resolveLayerPreviewFilmProfile(request, layerNode.sourceAsset),
        timestampText: null,
        targetSize: request.frameSize,
        intent:
          request.quality === "interactive"
            ? "preview-interactive"
            : "preview-full",
        renderSeed: request.previewRenderSeed + layerNode.id.length,
        seedKey: `${request.graphKey}:${layerNode.id}`,
        signal,
        sourceCacheKey: resolvePreviewSourceCacheKey(
          layerNode.sourceAsset,
          `layer:${layerNode.id}`
        ),
        renderSlot: buildPreviewRenderSlot(
          request.documentKey,
          `${request.graphKey}:layer:${layerNode.id}:composite`
        ),
        viewportRoi,
      });
    },
  });
  if (!didCompose) {
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
      dirtyKeys: {
        ...document.dirtyKeys,
        roi: buildViewportRoiDirtyKey(viewportRoi),
      },
      createRequest: (quality, dirtyReasons) => ({
        document,
        documentKey: document.documentKey,
        graphKey: document.renderGraph.key,
        quality,
        frameSize,
        viewportRoi,
        renderGraph: document.renderGraph,
        showOriginal: document.showOriginal,
        timestampText,
        isCropMode,
        orientedSourceAspectRatio,
        previewRenderSeed,
        sourceAsset,
        shouldRenderLayerComposite,
        dirtyReasons,
      }),
    };
  }, [
    canRenderPreview,
    document,
    frameSize,
    isCropMode,
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
      const singleLayerNode = resolveSingleRenderableLayerEntry(request.renderGraph.layers);

      if (singleLayerNode) {
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
          seedKey: `${request.graphKey}:main`,
          signal,
          sourceCacheKey: resolvePreviewSourceCacheKey(request.sourceAsset),
          renderSlot: buildPreviewRenderSlot(request.documentKey, `${request.graphKey}:main`),
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

      const activeLayerIds = new Set(request.renderGraph.layers.map((layer) => layer.id));
      pruneRetainedCanvasMap(bucket.layerCanvases, activeLayerIds);
      pruneRetainedCanvasMap(bucket.layerMaskCanvases, activeLayerIds);
      pruneRetainedCanvasMap(bucket.layerMaskScratchCanvases, activeLayerIds);
      pruneRetainedCanvasMap(bucket.maskedLayerCanvases, activeLayerIds);
      resetRetainedCanvasesForDirtyReasons(bucket, activeLayerIds, request.dirtyReasons);

      const compositeRegion = resolveViewportRenderRegion(
        request.frameSize.width,
        request.frameSize.height,
        resolveCompositeViewportRoi(request)
      );
      const didCompose = await composeRenderGraphToCanvas({
        targetCanvas: bucket.outputCanvas,
        renderGraph: request.renderGraph,
        workspace: createPreviewWorkspace(bucket),
        region: compositeRegion,
        targetSize: request.frameSize,
        renderLayerNode: async (layerNode: RenderLayerNode, layerCanvas, layerIndex) => {
          const layerSource = resolveRenderSource(layerNode.sourceAsset);
          if (!layerSource) {
            throw new Error(`Preview source missing for asset ${layerNode.sourceAsset.id}.`);
          }

          await renderImageToCanvas({
            canvas: layerCanvas,
            source: layerSource,
            adjustments: resolveLayerPreviewAdjustments(request, layerNode.adjustments),
            filmProfile: resolveLayerPreviewFilmProfile(request, layerNode.sourceAsset),
            timestampText: null,
            targetSize: request.frameSize,
            intent:
              request.quality === "interactive"
                ? "preview-interactive"
                : "preview-full",
            renderSeed: request.previewRenderSeed + layerIndex + 1,
            seedKey: `${request.graphKey}:${layerNode.id}`,
            signal,
            sourceCacheKey: resolvePreviewSourceCacheKey(
              layerNode.sourceAsset,
              `layer:${layerNode.id}`
            ),
            renderSlot: buildPreviewRenderSlot(
              request.documentKey,
              `${request.graphKey}:layer:${layerNode.id}`
            ),
            viewportRoi: effectiveViewportRoi,
          });

          if (signal.aborted) {
            throw createAbortError();
          }
        },
      });
      if (!didCompose) {
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
