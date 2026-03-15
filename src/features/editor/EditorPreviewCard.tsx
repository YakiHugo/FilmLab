import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  resolveAspectRatio,
  resolveOrientedAspectRatio,
} from "@/lib/imageProcessing";
import { clamp } from "@/lib/math";
import { resolvePreviewRoiFromViewport } from "@/lib/previewRoi";
import { resolveAssetTimestampText } from "@/lib/timestamp";
import { cn } from "@/lib/utils";
import { CropOverlay } from "./CropOverlay";
import { useEditorKeyboard } from "./useEditorKeyboard";
import {
  buildRenderDocumentDirtyKeys,
  resolveDirtyReasons,
} from "./renderGraph";
import {
  useEditorAdjustmentActions,
  useEditorAdjustmentState,
  useEditorDocumentState,
  useEditorHistoryState,
  useEditorSelectionState,
  useEditorViewState,
} from "./useEditorSlices";
import { useViewportZoom } from "./useViewportZoom";
import { applyBrushPreviewToAdjustments, useBrushMaskPainting } from "./preview/useBrushMaskPainting";
import type { EditorPreviewDocument } from "./preview/contracts";
import { createPreviewInteractionSampler } from "./preview/interactionPerformance";
import { applySelectedLayerPreviewAdjustments } from "./preview/layerPreviewEntries";
import { drawLocalMaskOverlay } from "./preview/maskOverlay";
import { useCropInteraction } from "./preview/useCropInteraction";
import { useHistogramSync } from "./preview/useHistogramSync";
import { usePerspectiveAssist } from "./preview/usePerspectiveAssist";
import { usePreviewRenderPipeline } from "./preview/usePreviewRenderPipeline";

export function EditorPreviewCard() {
  const { selectedAsset, selectedLayer } = useEditorSelectionState();
  const { previewRenderDocument } = useEditorDocumentState();
  const {
    previewFilmProfile,
    previewAdjustments,
  } = useEditorAdjustmentState();
  const {
    cancelPointColorPick,
    commitCropAdjustments,
    commitLocalMaskColorSample,
    commitPointColorSample,
    commitAdjustmentPatch,
    setPreviewHistogram,
    updateAdjustments,
  } = useEditorAdjustmentActions();
  const { handleRedo, handleUndo } = useEditorHistoryState();
  const {
    activeToolPanelId,
    autoPerspectiveMode,
    autoPerspectiveRequestId,
    cropGuideMode,
    cropGuideRotation,
    cycleCropGuideMode,
    pointColorPickTarget,
    pointColorPicking,
    rotateCropGuide,
    setPreviewWaveform,
    selectedLocalAdjustmentId,
    showOriginal,
    toggleOriginal,
  } = useEditorViewState();

  const imageAreaRef = useRef<HTMLDivElement | null>(null);
  const isCropModeRef = useRef(false);
  const colorSampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropPerformanceSamplerRef = useRef(createPreviewInteractionSampler("crop-drag"));
  const brushPerformanceSamplerRef = useRef(createPreviewInteractionSampler("brush-paint"));

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(
    null
  );
  const [renderedRotate, setRenderedRotate] = useState(previewAdjustments?.rotate ?? 0);

  const {
    handleZoom,
    isPanning,
    panStartRef,
    resetView,
    setIsPanning,
    setViewOffset,
    viewOffset,
    viewScale,
  } = useViewportZoom({ imageAreaRef, isCropModeRef });

  const previewRenderSeed = useMemo(() => {
    if (!selectedAsset?.id) {
      return 0;
    }
    let hash = 2166136261;
    for (let index = 0; index < selectedAsset.id.length; index += 1) {
      hash ^= selectedAsset.id.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }, [selectedAsset?.id]);

  useEffect(() => {
    if (!selectedAsset?.objectUrl) {
      setImageNaturalSize(null);
      return;
    }
    const image = new Image();
    image.onload = () => {
      setImageNaturalSize({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.src = selectedAsset.objectUrl;
  }, [selectedAsset?.objectUrl]);

  const sourceAspectRatio = useMemo(() => {
    if (imageNaturalSize) {
      return imageNaturalSize.width / imageNaturalSize.height;
    }
    if (selectedAsset?.metadata?.width && selectedAsset?.metadata?.height) {
      return selectedAsset.metadata.width / selectedAsset.metadata.height;
    }
    return 4 / 3;
  }, [imageNaturalSize, selectedAsset?.metadata?.height, selectedAsset?.metadata?.width]);

  const orientedSourceAspectRatio = useMemo(() => {
    const rightAngleRotation = previewAdjustments?.rightAngleRotation ?? 0;
    return resolveOrientedAspectRatio(sourceAspectRatio, rightAngleRotation);
  }, [previewAdjustments?.rightAngleRotation, sourceAspectRatio]);

  const isCropMode =
    activeToolPanelId === "crop" &&
    Boolean(previewAdjustments) &&
    !showOriginal &&
    !pointColorPicking;
  isCropModeRef.current = isCropMode;

  const shouldRenderLayerComposite =
    (previewRenderDocument?.renderGraph.layers.length ?? 0) > 1 && !isCropMode;
  const usesOriginalImageElement = (showOriginal && !shouldRenderLayerComposite) || !previewAdjustments;

  const previewAspectRatio = useMemo(() => {
    if (showOriginal || !previewAdjustments) {
      return sourceAspectRatio;
    }
    if (isCropMode) {
      return orientedSourceAspectRatio;
    }
    return resolveAspectRatio(
      previewAdjustments.aspectRatio,
      previewAdjustments.customAspectRatio,
      orientedSourceAspectRatio
    );
  }, [
    isCropMode,
    orientedSourceAspectRatio,
    previewAdjustments,
    showOriginal,
    sourceAspectRatio,
  ]);

  const frameSize = useMemo(() => {
    if (!containerSize.width || !containerSize.height) {
      return { width: 0, height: 0 };
    }
    const pad = 32;
    const availWidth = Math.max(1, containerSize.width - pad * 2);
    const availHeight = Math.max(1, containerSize.height - pad * 2);

    if (isCropMode) {
      const baseRatio = sourceAspectRatio;
      let width = availWidth;
      let height = width / baseRatio;
      if (height > availHeight) {
        height = availHeight;
        width = height * baseRatio;
      }
      const rightAngleRotation = previewAdjustments?.rightAngleRotation ?? 0;
      const isSwapped = rightAngleRotation === 90 || rightAngleRotation === 270;
      const frameWidth = isSwapped ? height : width;
      const frameHeight = isSwapped ? width : height;
      const scale = Math.min(1, availWidth / frameWidth, availHeight / frameHeight);
      return {
        width: Math.max(1, Math.floor(frameWidth * scale)),
        height: Math.max(1, Math.floor(frameHeight * scale)),
      };
    }

    let width = availWidth;
    let height = width / previewAspectRatio;
    if (height > availHeight) {
      height = availHeight;
      width = height * previewAspectRatio;
    }
    return {
      width: Math.max(1, Math.floor(width)),
      height: Math.max(1, Math.floor(height)),
    };
  }, [
    containerSize.height,
    containerSize.width,
    isCropMode,
    previewAdjustments?.rightAngleRotation,
    previewAspectRatio,
    sourceAspectRatio,
  ]);

  const cropTargetRatio = useMemo(() => {
    if (!previewAdjustments) {
      return sourceAspectRatio;
    }
    return resolveAspectRatio(
      previewAdjustments.aspectRatio,
      previewAdjustments.customAspectRatio,
      orientedSourceAspectRatio
    );
  }, [orientedSourceAspectRatio, previewAdjustments, sourceAspectRatio]);

  const timestampText = useMemo(
    () => resolveAssetTimestampText(selectedAsset?.metadata, selectedAsset?.createdAt),
    [selectedAsset?.createdAt, selectedAsset?.metadata]
  );

  const previewRoi = useMemo(
    () =>
      resolvePreviewRoiFromViewport({
        frameWidth: frameSize.width,
        frameHeight: frameSize.height,
        viewScale,
        viewOffset,
      }),
    [frameSize.height, frameSize.width, viewOffset, viewScale]
  );

  const brushMaskPainting = useBrushMaskPainting({
    activeToolPanelId,
    adjustments: previewAdjustments,
    commitAdjustmentPatch,
    isCropMode,
    performanceSampler: brushPerformanceSamplerRef.current,
    pointColorPicking,
    previewRoi: isCropMode ? null : previewRoi,
    selectedLocalAdjustmentId,
    showOriginal,
  });

  const effectivePreviewAdjustments = useMemo(() => {
    if (!previewAdjustments) {
      return null;
    }
    let nextAdjustments = previewAdjustments;
    if (brushMaskPainting.previewState) {
      nextAdjustments = applyBrushPreviewToAdjustments(
        nextAdjustments,
        brushMaskPainting.previewState
      );
    }
    return nextAdjustments;
  }, [brushMaskPainting.previewState, previewAdjustments]);

  const cropInteraction = useCropInteraction({
    adjustments: previewAdjustments,
    commitCropAdjustments,
    cropTargetRatio,
    enabled: isCropMode,
    frameSize,
    performanceSampler: cropPerformanceSamplerRef.current,
    renderedRotate,
  });

  const renderedPreviewAdjustments = useMemo(() => {
    if (!effectivePreviewAdjustments) {
      return null;
    }
    if (!cropInteraction.previewPatch) {
      return effectivePreviewAdjustments;
    }
    return {
      ...effectivePreviewAdjustments,
      ...cropInteraction.previewPatch,
    };
  }, [cropInteraction.previewPatch, effectivePreviewAdjustments]);

  const effectiveRenderGraph = useMemo(() => {
    if (!previewRenderDocument) {
      return null;
    }
    return applySelectedLayerPreviewAdjustments(
      previewRenderDocument.renderGraph,
      selectedLayer?.id ?? null,
      renderedPreviewAdjustments,
      previewFilmProfile ?? previewRenderDocument.filmProfile ?? undefined
    );
  }, [
    previewFilmProfile,
    previewRenderDocument,
    renderedPreviewAdjustments,
    selectedLayer?.id,
  ]);

  const previewDocument = useMemo<EditorPreviewDocument | null>(() => {
    if (!previewRenderDocument || !renderedPreviewAdjustments || !effectiveRenderGraph) {
      return null;
    }
    const filmProfile =
      previewFilmProfile ?? previewRenderDocument.filmProfile ?? undefined;
    const dirtyKeys = buildRenderDocumentDirtyKeys({
      documentKey: previewRenderDocument.documentKey,
      sourceAsset: previewRenderDocument.sourceAsset,
      adjustments: renderedPreviewAdjustments,
      filmProfile,
      showOriginal,
      renderGraph: effectiveRenderGraph,
    });
    return {
      ...previewRenderDocument,
      adjustments: renderedPreviewAdjustments,
      filmProfile,
      renderGraph: effectiveRenderGraph,
      dirtyKeys,
      dirtyReasons: resolveDirtyReasons(previewRenderDocument.dirtyKeys, dirtyKeys),
      showOriginal,
    };
  }, [
    effectiveRenderGraph,
    previewFilmProfile,
    previewRenderDocument,
    renderedPreviewAdjustments,
    showOriginal,
  ]);

  const previewRenderPipeline = usePreviewRenderPipeline({
    document: previewDocument,
    frameSize,
    isCropMode,
    orientedSourceAspectRatio,
    previewRenderSeed,
    shouldRenderLayerComposite,
    sourceAsset: selectedAsset,
    timestampText,
    viewOffset,
    viewScale,
  });

  useEffect(() => {
    setRenderedRotate(previewRenderPipeline.renderedRotate);
  }, [previewRenderPipeline.renderedRotate]);

  useHistogramSync({
    canvasRef: previewRenderPipeline.canvasRef,
    onHistogramChange: setPreviewHistogram,
    onWaveformChange: setPreviewWaveform,
    previewResult: previewRenderPipeline.previewResult,
    selectedAsset,
    usesOriginalImageElement,
  });

  const activeMaskOverlayAdjustment = useMemo(() => {
    if (
      activeToolPanelId !== "mask" ||
      !previewAdjustments ||
      showOriginal ||
      isCropMode
    ) {
      return null;
    }
    const localAdjustments = previewAdjustments.localAdjustments ?? [];
    if (localAdjustments.length === 0) {
      return null;
    }
    const targetId = selectedLocalAdjustmentId ?? localAdjustments[0]?.id ?? null;
    return targetId ? localAdjustments.find((item) => item.id === targetId) ?? null : null;
  }, [
    activeToolPanelId,
    isCropMode,
    previewAdjustments,
    selectedLocalAdjustmentId,
    showOriginal,
  ]);

  useEffect(() => {
    const overlayCanvas = previewRenderPipeline.overlayCanvasRef.current;
    if (!overlayCanvas || frameSize.width <= 0 || frameSize.height <= 0) {
      return;
    }
    drawLocalMaskOverlay({
      canvas: overlayCanvas,
      frameWidth: frameSize.width,
      frameHeight: frameSize.height,
      localAdjustment: activeMaskOverlayAdjustment,
      previewRoi: usesOriginalImageElement ? null : previewRoi,
      previewState: brushMaskPainting.previewState,
    });
  }, [
    activeMaskOverlayAdjustment,
    brushMaskPainting.previewState,
    frameSize.height,
    frameSize.width,
    previewRenderPipeline.overlayCanvasRef,
    previewRenderPipeline.renderVersion,
    previewRoi,
    usesOriginalImageElement,
  ]);

  const perspectiveAssist = usePerspectiveAssist({
    adjustments: previewAdjustments,
    autoPerspectiveMode,
    autoPerspectiveRequestId,
    enabled: isCropMode,
    previewCanvasRef: previewRenderPipeline.canvasRef,
    showOriginal,
    updateAdjustments,
  });

  const maxOffset = useMemo(() => {
    if (viewScale <= 1 || frameSize.width === 0 || frameSize.height === 0) {
      return { x: 0, y: 0 };
    }
    return {
      x: Math.max(0, (frameSize.width * (viewScale - 1)) / 2),
      y: Math.max(0, (frameSize.height * (viewScale - 1)) / 2),
    };
  }, [frameSize.height, frameSize.width, viewScale]);

  const clampOffset = useCallback(
    (offset: { x: number; y: number }) => ({
      x: clamp(offset.x, -maxOffset.x, maxOffset.x),
      y: clamp(offset.y, -maxOffset.y, maxOffset.y),
    }),
    [maxOffset.x, maxOffset.y]
  );

  useLayoutEffect(() => {
    if (!imageAreaRef.current) {
      return undefined;
    }
    const updateContainerSize = (width: number, height: number) => {
      const nextWidth = Math.max(1, Math.floor(width));
      const nextHeight = Math.max(1, Math.floor(height));
      setContainerSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : {
              width: nextWidth,
              height: nextHeight,
            }
      );
    };

    const element = imageAreaRef.current;
    if (element.clientWidth > 0 && element.clientHeight > 0) {
      updateContainerSize(element.clientWidth, element.clientHeight);
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      updateContainerSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    resetView();
  }, [resetView, selectedAsset?.id]);

  useEffect(() => {
    if (!pointColorPicking) {
      return;
    }
    resetView();
    setIsPanning(false);
  }, [pointColorPicking, resetView, setIsPanning]);

  useEffect(() => {
    if (!isCropMode) {
      return;
    }
    resetView();
    setIsPanning(false);
  }, [isCropMode, resetView, setIsPanning]);

  useEffect(() => {
    if (!selectedAsset && pointColorPicking) {
      cancelPointColorPick();
    }
  }, [cancelPointColorPick, pointColorPicking, selectedAsset]);

  useEditorKeyboard({
    selectedAsset,
    isCropMode,
    viewScale,
    cycleCropGuideMode,
    rotateCropGuide,
    toggleOriginal,
    handleUndo,
    handleRedo,
    resetView,
    handleZoom,
  });

  const samplePixelColor = useCallback(
    (normalizedX: number, normalizedY: number) => {
      const x = clamp(normalizedX, 0, 1);
      const y = clamp(normalizedY, 0, 1);

      if (usesOriginalImageElement) {
        const image = previewRenderPipeline.originalImageRef.current;
        if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
          return null;
        }
        const sampleCanvas = colorSampleCanvasRef.current ?? document.createElement("canvas");
        colorSampleCanvasRef.current = sampleCanvas;
        sampleCanvas.width = 1;
        sampleCanvas.height = 1;
        const context = sampleCanvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          return null;
        }
        const sampleX = clamp(Math.floor(x * image.naturalWidth), 0, image.naturalWidth - 1);
        const sampleY = clamp(Math.floor(y * image.naturalHeight), 0, image.naturalHeight - 1);
        context.clearRect(0, 0, 1, 1);
        context.drawImage(image, sampleX, sampleY, 1, 1, 0, 0, 1, 1);
        const pixel = context.getImageData(0, 0, 1, 1).data;
        return {
          red: pixel[0] ?? 0,
          green: pixel[1] ?? 0,
          blue: pixel[2] ?? 0,
        };
      }

      const previewCanvas = previewRenderPipeline.canvasRef.current;
      if (!previewCanvas) {
        return null;
      }
      const context = previewCanvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return null;
      }
      const sampleX = clamp(Math.floor(x * previewCanvas.width), 0, previewCanvas.width - 1);
      const sampleY = clamp(Math.floor(y * previewCanvas.height), 0, previewCanvas.height - 1);
      const pixel = context.getImageData(sampleX, sampleY, 1, 1).data;
      return {
        red: pixel[0] ?? 0,
        green: pixel[1] ?? 0,
        blue: pixel[2] ?? 0,
        };
    },
    [previewRenderPipeline.canvasRef, previewRenderPipeline.originalImageRef, usesOriginalImageElement]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isCropMode || pointColorPicking || event.button !== 0 || viewScale <= 1) {
      return;
    }
    event.preventDefault();
    setIsPanning(true);
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: viewOffset.x,
      offsetY: viewOffset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning || !panStartRef.current) {
      return;
    }
    const dx = event.clientX - panStartRef.current.x;
    const dy = event.clientY - panStartRef.current.y;
    setViewOffset(
      clampOffset({
        x: panStartRef.current.offsetX + dx,
        y: panStartRef.current.offsetY + dy,
      })
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) {
      return;
    }
    setIsPanning(false);
    panStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const usesRenderedPreviewRoi = Boolean(previewRoi) && !usesOriginalImageElement && !isCropMode;
  const previewScale = isCropMode || usesRenderedPreviewRoi ? 1 : viewScale;
  const previewOffset =
    isCropMode || usesRenderedPreviewRoi ? { x: 0, y: 0 } : viewOffset;

  return (
    <div className="relative h-full min-h-[300px] w-full">
      <div
        ref={imageAreaRef}
        className={cn(
          "relative flex h-full w-full items-center justify-center bg-black touch-none",
          pointColorPicking || brushMaskPainting.brushPaintEnabled || perspectiveAssist.guidedPerspectiveActive
            ? "cursor-crosshair"
            : viewScale > 1 && "cursor-grab",
          !pointColorPicking &&
            !brushMaskPainting.brushPaintEnabled &&
            !perspectiveAssist.guidedPerspectiveActive &&
            isPanning &&
            "cursor-grabbing"
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={resetView}
      >
        {frameSize.width > 0 && frameSize.height > 0 && (
          <div
            className="relative"
            style={{
              width: frameSize.width,
              height: frameSize.height,
            }}
            onPointerDown={
              perspectiveAssist.guidedPerspectiveActive
                ? perspectiveAssist.handleGuidedPointerDown
                : brushMaskPainting.handleBrushPointerDown
            }
            onPointerMove={
              perspectiveAssist.guidedPerspectiveActive
                ? perspectiveAssist.handleGuidedPointerMove
                : brushMaskPainting.handleBrushPointerMove
            }
            onPointerUp={
              perspectiveAssist.guidedPerspectiveActive
                ? perspectiveAssist.handleGuidedPointerUp
                : brushMaskPainting.handleBrushPointerUp
            }
            onPointerCancel={
              perspectiveAssist.guidedPerspectiveActive
                ? perspectiveAssist.handleGuidedPointerUp
                : brushMaskPainting.handleBrushPointerUp
            }
            onClick={(event) => {
              if (!pointColorPicking || !selectedAsset) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) {
                return;
              }
              const sampled = samplePixelColor(
                (event.clientX - rect.left) / rect.width,
                (event.clientY - rect.top) / rect.height
              );
              if (!sampled) {
                return;
              }
              if (pointColorPickTarget === "localMask") {
                void commitLocalMaskColorSample(sampled);
                return;
              }
              commitPointColorSample(sampled);
            }}
          >
            <div
              className="relative h-full w-full"
              style={{
                transform: `translate3d(${previewOffset.x}px, ${previewOffset.y}px, 0) scale(${previewScale})`,
                transformOrigin: "center",
              }}
            >
              {selectedAsset ? (
                usesOriginalImageElement ? (
                  <img
                    ref={previewRenderPipeline.originalImageRef}
                    src={selectedAsset.objectUrl}
                    alt={selectedAsset.name}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <canvas
                    ref={previewRenderPipeline.canvasRef}
                    role="img"
                    aria-label={`${selectedAsset.name} preview`}
                    className="block h-full w-full"
                  />
                )
              ) : null}
              <canvas
                ref={previewRenderPipeline.overlayCanvasRef}
                className={cn(
                  "pointer-events-none absolute inset-0 h-full w-full",
                  (!activeMaskOverlayAdjustment || usesOriginalImageElement) && "hidden"
                )}
              />
            </div>

            {perspectiveAssist.guidedOverlayVisible && (
              <>
                <svg className="pointer-events-none absolute inset-0 h-full w-full">
                  {perspectiveAssist.guidedOverlayLines.map((line, index) => (
                    <line
                      key={`${index}-${line.start.x.toFixed(4)}-${line.start.y.toFixed(4)}`}
                      x1={line.start.x * frameSize.width}
                      y1={line.start.y * frameSize.height}
                      x2={line.end.x * frameSize.width}
                      y2={line.end.y * frameSize.height}
                      vectorEffect="non-scaling-stroke"
                      stroke="rgba(255, 255, 255, 0.95)"
                      strokeWidth={1.75}
                      strokeLinecap="round"
                      strokeDasharray={
                        perspectiveAssist.guidedDraftLine &&
                        index === perspectiveAssist.guidedOverlayLines.length - 1
                          ? "6 4"
                          : "0"
                      }
                    />
                  ))}
                </svg>
                {perspectiveAssist.guidedPerspectiveActive && (
                  <div className="absolute left-3 top-3 z-10 max-w-[260px] rounded-lg border border-white/20 bg-black/65 px-3 py-2 text-xs text-white/90 shadow-lg backdrop-blur">
                    <p className="font-medium">Guided Perspective</p>
                    <p className="mt-1 text-white/70">
                      Draw up to two reference lines, then apply correction.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded border border-white/25 px-2 py-1 text-[11px] text-white transition hover:border-white/40 hover:bg-white/10"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          perspectiveAssist.resetGuidedLines();
                        }}
                      >
                        Reset Lines
                      </button>
                      <button
                        type="button"
                        className="rounded border border-emerald-300/40 bg-emerald-300/20 px-2 py-1 text-[11px] text-emerald-100 transition hover:bg-emerald-300/30 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={perspectiveAssist.guidedOverlayLines.length === 0}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          perspectiveAssist.applyGuidedPerspective(
                            perspectiveAssist.guidedOverlayLines
                          );
                        }}
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        className="rounded border border-rose-300/40 bg-rose-300/20 px-2 py-1 text-[11px] text-rose-100 transition hover:bg-rose-300/30"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          perspectiveAssist.cancelGuidedPerspective();
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {isCropMode && cropInteraction.cropRect && !perspectiveAssist.guidedPerspectiveActive && (
              <CropOverlay
                cropRect={cropInteraction.cropRect}
                frameWidth={frameSize.width}
                frameHeight={frameSize.height}
                activeCropDragMode={cropInteraction.activeCropDragMode}
                cropGuideMode={cropGuideMode}
                cropGuideRotation={cropGuideRotation}
                onPointerDown={cropInteraction.handleCropPointerDown}
                onPointerMove={cropInteraction.handleCropPointerMove}
                onPointerUp={cropInteraction.handleCropPointerUp}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
