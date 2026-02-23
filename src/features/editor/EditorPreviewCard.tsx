import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  resolveAspectRatio,
  resolveOrientedAspectRatio,
  renderImageToCanvas,
} from "@/lib/imageProcessing";
import { resolveAssetTimestampText } from "@/lib/timestamp";
import { cn } from "@/lib/utils";
import {
  buildHistogramFromCanvas,
  buildHistogramFromDrawable,
  forceMonochromeHistogramMode,
} from "./histogram";
import { useEditorState } from "./useEditorState";
import { useViewportZoom } from "./useViewportZoom";
import { useEditorKeyboard } from "./useEditorKeyboard";
import { CropOverlay } from "./CropOverlay";
import {
  buildCropImagePolygon,
  clampRange,
  CROP_RECT_MIN_SIZE,
  fitCenteredRectToPolygon,
  getCropHandlePoint,
  isCropRectInsidePolygon,
  toCenteredRect,
  type CropDragMode,
  type CropRect,
} from "./cropGeometry";
import { clamp } from "@/lib/math";

export function EditorPreviewCard() {
  const {
    selectedAsset,
    previewAdjustments: adjustments,
    previewFilmProfile: filmProfile,
    activeToolPanelId,
    showOriginal,
    pointColorPicking,
    toggleOriginal,
    cancelPointColorPick,
    commitPointColorSample,
    handleUndo,
    handleRedo,
    handlePreviewHistogramChange,
    previewCropAdjustments,
    commitCropAdjustments,
  } = useEditorState();

  const imageAreaRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const sampleBufferRef = useRef<HTMLCanvasElement | null>(null);
  const workingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropDragRef = useRef<{
    mode: CropDragMode;
    startX: number;
    startY: number;
    startRect: CropRect;
    startHorizontal: number;
    startVertical: number;
    startScale: number;
    startCustomAspectRatio: number;
    startTime: number;
    moveArmed: boolean;
  } | null>(null);
  const cropLastPatchRef = useRef<
    Partial<
      Pick<
        NonNullable<typeof adjustments>,
        "horizontal" | "vertical" | "scale" | "customAspectRatio"
      >
    >
  >({});
  const cropMovePreviewFrameRef = useRef<number | null>(null);
  const cropResizeFrameRef = useRef<number | null>(null);
  const cropResizePendingRectRef = useRef<CropRect | null>(null);
  const latestAdjustmentsRef = useRef(adjustments);
  latestAdjustmentsRef.current = adjustments;
  const isCropModeRef = useRef(false);
  const showOriginalRef = useRef(showOriginal);
  showOriginalRef.current = showOriginal;
  const histogramDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAbortTimeRef = useRef(0);
  // Track the rotation angle that was last rendered to the canvas.
  // The crop rect effect uses this instead of adjustments.rotate so the
  // crop overlay stays in sync with what the canvas actually shows.
  const [renderedRotate, setRenderedRotate] = useState(adjustments?.rotate ?? 0);
  const prevRightAngleRef = useRef(adjustments?.rightAngleRotation ?? 0);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [imageNaturalSize, setImageNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [isSourceMonochrome, setIsSourceMonochrome] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [activeCropDragMode, setActiveCropDragMode] = useState<CropDragMode | null>(null);

  const {
    viewScale,
    setViewScale,
    viewOffset,
    setViewOffset,
    isPanning,
    setIsPanning,
    panStartRef,
    resetView,
    handleZoom,
  } = useViewportZoom({ imageAreaRef, isCropModeRef });

  const previewRenderSeed = useMemo(() => {
    if (!selectedAsset?.id) {
      return 0;
    }
    let hash = 2166136261;
    for (let i = 0; i < selectedAsset.id.length; i += 1) {
      hash ^= selectedAsset.id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }, [selectedAsset?.id]);

  const sourceAspectRatio = useMemo(() => {
    if (imageNaturalSize) {
      return imageNaturalSize.width / imageNaturalSize.height;
    }
    if (selectedAsset?.metadata?.width && selectedAsset?.metadata?.height) {
      return selectedAsset.metadata.width / selectedAsset.metadata.height;
    }
    return 4 / 3;
  }, [imageNaturalSize, selectedAsset?.metadata?.width, selectedAsset?.metadata?.height]);

  const orientedSourceAspectRatio = useMemo(() => {
    const rightAngleRotation = adjustments?.rightAngleRotation ?? 0;
    return resolveOrientedAspectRatio(sourceAspectRatio, rightAngleRotation);
  }, [adjustments?.rightAngleRotation, sourceAspectRatio]);

  const isCropMode =
    activeToolPanelId === "crop" && Boolean(adjustments) && !showOriginal && !pointColorPicking;
  isCropModeRef.current = isCropMode;

  const previewAspectRatio = useMemo(() => {
    if (showOriginal || !adjustments) {
      return sourceAspectRatio;
    }
    if (isCropMode) {
      // Use the oriented source aspect ratio so the frame swaps width/height
      // together with 90° rotations.
      return orientedSourceAspectRatio;
    }
    return resolveAspectRatio(
      adjustments.aspectRatio,
      adjustments.customAspectRatio,
      orientedSourceAspectRatio
    );
  }, [adjustments, isCropMode, orientedSourceAspectRatio, showOriginal, sourceAspectRatio]);

  const frameSize = useMemo(() => {
    if (!containerSize.width || !containerSize.height) {
      return { width: 0, height: 0 };
    }
    const pad = 32;
    const availWidth = Math.max(1, containerSize.width - pad * 2);
    const availHeight = Math.max(1, containerSize.height - pad * 2);

    if (isCropMode) {
      // In crop mode, compute the frame from the unrotated source ratio
      // first, then swap width/height for 90° rotations.  This keeps the
      // image area (long-edge × short-edge) identical before and after
      // rotation so the preview doesn't jump in size.
      const baseRatio = sourceAspectRatio;
      let w = availWidth;
      let h = w / baseRatio;
      if (h > availHeight) {
        h = availHeight;
        w = h * baseRatio;
      }
      const rightAngle = adjustments?.rightAngleRotation ?? 0;
      const isSwapped = rightAngle === 90 || rightAngle === 270;
      const fw = isSwapped ? h : w;
      const fh = isSwapped ? w : h;
      // Clamp in case the swapped dimension exceeds the available space.
      const scale = Math.min(1, availWidth / fw, availHeight / fh);
      return {
        width: Math.max(1, Math.floor(fw * scale)),
        height: Math.max(1, Math.floor(fh * scale)),
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
    adjustments?.rightAngleRotation,
    containerSize.height,
    containerSize.width,
    isCropMode,
    previewAspectRatio,
    sourceAspectRatio,
  ]);

  const timestampText = useMemo(
    () => resolveAssetTimestampText(selectedAsset?.metadata, selectedAsset?.createdAt),
    [selectedAsset?.createdAt, selectedAsset?.metadata]
  );

  const cropTargetRatio = useMemo(() => {
    if (!adjustments) {
      return sourceAspectRatio;
    }
    return resolveAspectRatio(
      adjustments.aspectRatio,
      adjustments.customAspectRatio,
      orientedSourceAspectRatio
    );
  }, [adjustments, orientedSourceAspectRatio]);

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

  const buildRectFromAdjustments = useCallback(
    (nextAdjustments: NonNullable<typeof adjustments>): CropRect => {
      const frameWidth = frameSize.width;
      const frameHeight = frameSize.height;
      const frameRatio = frameWidth / frameHeight;
      const targetRatio = resolveAspectRatio(
        nextAdjustments.aspectRatio,
        nextAdjustments.customAspectRatio,
        frameRatio
      );

      let fitWidth = frameWidth;
      let fitHeight = fitWidth / targetRatio;
      if (fitHeight > frameHeight) {
        fitHeight = frameHeight;
        fitWidth = fitHeight * targetRatio;
      }

      const scaleFactor = clamp(nextAdjustments.scale / 100, 0.7, 1.3);
      const width = clamp(fitWidth / scaleFactor, CROP_RECT_MIN_SIZE, frameWidth);
      const height = clamp(fitHeight / scaleFactor, CROP_RECT_MIN_SIZE, frameHeight);

      const centerX = frameWidth / 2;
      const centerY = frameHeight / 2;

      const rect: CropRect = {
        x: centerX - width / 2,
        y: centerY - height / 2,
        width,
        height,
      };

      // Clamp to rotated image polygon so crop box never exceeds image bounds
      const imagePolygon = buildCropImagePolygon(
        frameWidth,
        frameHeight,
        nextAdjustments.rotate,
        nextAdjustments.horizontal,
        nextAdjustments.vertical
      );
      if (!isCropRectInsidePolygon(rect, imagePolygon)) {
        const fitted = fitCenteredRectToPolygon(
          centerX,
          centerY,
          0,
          0,
          width / 2,
          height / 2,
          imagePolygon
        );
        return toCenteredRect(centerX, centerY, fitted.halfWidth, fitted.halfHeight);
      }

      return rect;
    },
    [frameSize.height, frameSize.width]
  );

  const toCropPatch = useCallback(
    (rect: CropRect) => {
      if (!adjustments || frameSize.width <= 0 || frameSize.height <= 0) {
        return {};
      }

      const horizontal = adjustments.horizontal;
      const vertical = adjustments.vertical;

      const ratio =
        adjustments.aspectRatio === "free"
          ? clamp(rect.width / Math.max(1, rect.height), 0.5, 2.5)
          : cropTargetRatio;
      let fitWidth = frameSize.width;
      let fitHeight = fitWidth / ratio;
      if (fitHeight > frameSize.height) {
        fitHeight = frameSize.height;
        fitWidth = fitHeight * ratio;
      }
      const scale = clamp((fitWidth / Math.max(rect.width, 1)) * 100, 80, 120);

      const patch: Partial<
        Pick<
          NonNullable<typeof adjustments>,
          "horizontal" | "vertical" | "scale" | "customAspectRatio"
        >
      > = {
        horizontal,
        vertical,
        scale,
      };

      if (adjustments.aspectRatio === "free") {
        patch.customAspectRatio = clamp(ratio, 0.5, 2.5);
      } else {
        patch.customAspectRatio = adjustments.customAspectRatio;
      }

      return patch;
    },
    [adjustments, cropTargetRatio, frameSize.height, frameSize.width]
  );

  // Release canvas backing stores on unmount to free GPU/bitmap memory
  useEffect(() => {
    return () => {
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
      if (workingCanvasRef.current) {
        workingCanvasRef.current.width = 0;
        workingCanvasRef.current.height = 0;
        workingCanvasRef.current = null;
      }
      if (sampleBufferRef.current) {
        sampleBufferRef.current.width = 0;
        sampleBufferRef.current.height = 0;
        sampleBufferRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedAsset?.objectUrl) {
      setImageNaturalSize(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setImageNaturalSize({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.src = selectedAsset.objectUrl;
  }, [selectedAsset?.objectUrl]);

  useEffect(() => {
    if (!selectedAsset?.objectUrl) {
      setIsSourceMonochrome(false);
      return undefined;
    }
    let isCancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.src = selectedAsset.objectUrl;

    const detect = async () => {
      try {
        await image.decode();
      } catch {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("Failed to load source image"));
        });
      }
      if (isCancelled) {
        return;
      }
      const sourceHistogram = buildHistogramFromDrawable(
        image as CanvasImageSource,
        image.naturalWidth,
        image.naturalHeight
      );
      const sourceMonochrome = Boolean(sourceHistogram?.analysis.isMonochrome);
      setIsSourceMonochrome(sourceMonochrome);
      // Use current showOriginal value at detection time (not as a dep)
      if (!showOriginalRef.current) {
        handlePreviewHistogramChange(
          sourceMonochrome ? forceMonochromeHistogramMode(sourceHistogram) : sourceHistogram
        );
      }
    };

    void detect().catch(() => {
      if (!isCancelled) {
        setIsSourceMonochrome(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [handlePreviewHistogramChange, selectedAsset?.id, selectedAsset?.objectUrl]);

  useLayoutEffect(() => {
    if (!imageAreaRef.current) {
      return undefined;
    }
    const updateContainerSize = (width: number, height: number) => {
      const nextWidth = Math.max(1, Math.floor(width));
      const nextHeight = Math.max(1, Math.floor(height));
      setContainerSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) {
          return prev;
        }
        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    };

    const element = imageAreaRef.current;
    const initialWidth = element.clientWidth;
    const initialHeight = element.clientHeight;
    if (initialWidth > 0 && initialHeight > 0) {
      updateContainerSize(initialWidth, initialHeight);
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      updateContainerSize(width, height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    resetView();
    setImageNaturalSize(null);
  }, [resetView, selectedAsset?.id]);

  useEffect(() => {
    if (!isCropMode || !adjustments || frameSize.width <= 0 || frameSize.height <= 0) {
      setCropRect(null);
      return;
    }
    if (cropDragRef.current) {
      return;
    }
    // Read from ref to ensure we use the absolute latest values, but
    // override rotate with the value that was actually rendered to the
    // canvas so the crop overlay stays visually in sync.
    const currentAdj = latestAdjustmentsRef.current;
    if (!currentAdj) return;
    const syncedAdj = { ...currentAdj, rotate: renderedRotate };
    const fw = frameSize.width;
    const fh = frameSize.height;
    const centerX = fw / 2;
    const centerY = fh / 2;

    const imagePolygon = buildCropImagePolygon(
      fw,
      fh,
      renderedRotate,
      syncedAdj.horizontal,
      syncedAdj.vertical
    );

    const currentRightAngle = adjustments.rightAngleRotation;
    const rightAngleChanged = currentRightAngle !== prevRightAngleRef.current;
    prevRightAngleRef.current = currentRightAngle;

    setCropRect((prev) => {
      // After a 90° rotation the frame swaps width/height, so the old
      // crop rect is no longer meaningful — always recompute.
      if (rightAngleChanged) {
        return buildRectFromAdjustments(syncedAdj);
      }

      // If we already have a crop rect, try to preserve it.
      // Only shrink if it now exceeds the rotated image polygon.
      if (prev) {
        if (isCropRectInsidePolygon(prev, imagePolygon)) {
          return prev; // Still valid, keep it
        }
        // Shrink existing rect to fit inside the polygon
        const fitted = fitCenteredRectToPolygon(
          centerX,
          centerY,
          0,
          0,
          prev.width / 2,
          prev.height / 2,
          imagePolygon
        );
        const shrunk = toCenteredRect(centerX, centerY, fitted.halfWidth, fitted.halfHeight);
        if (shrunk.width >= CROP_RECT_MIN_SIZE && shrunk.height >= CROP_RECT_MIN_SIZE) {
          return shrunk;
        }
        // Too small after shrink — fall through to full recompute
      }

      // No previous rect or shrunk too small — compute fresh (already polygon-clamped)
      return buildRectFromAdjustments(syncedAdj);
    });
    // Recompute on scale/ratio/straighten changes. Use renderedRotate
    // instead of adjustments.rotate so the crop rect waits for the canvas.
    // Keep pan excluded so move-drag remains stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    adjustments?.scale,
    adjustments?.aspectRatio,
    adjustments?.customAspectRatio,
    adjustments?.rightAngleRotation,
    renderedRotate,
    buildRectFromAdjustments,
    frameSize.height,
    frameSize.width,
    isCropMode,
  ]);

  useEffect(() => {
    if (!selectedAsset) {
      handlePreviewHistogramChange(null);
      return undefined;
    }
    if (!showOriginal) {
      return undefined;
    }
    let isCancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.src = selectedAsset.objectUrl;

    const compute = async () => {
      try {
        await image.decode();
      } catch {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("Failed to load preview image"));
        });
      }
      if (isCancelled) {
        return;
      }
      const sourceHistogram = buildHistogramFromDrawable(
        image as CanvasImageSource,
        image.naturalWidth,
        image.naturalHeight
      );
      const sourceMonochrome = Boolean(sourceHistogram?.analysis.isMonochrome);
      setIsSourceMonochrome(sourceMonochrome);
      handlePreviewHistogramChange(
        sourceMonochrome ? forceMonochromeHistogramMode(sourceHistogram) : sourceHistogram
      );
    };

    void compute().catch(() => {
      if (!isCancelled) {
        setIsSourceMonochrome(false);
        handlePreviewHistogramChange(null);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [handlePreviewHistogramChange, selectedAsset, showOriginal]);

  useEffect(() => {
    if (!selectedAsset || !adjustments || showOriginal) {
      if (!selectedAsset || !adjustments) {
        handlePreviewHistogramChange(null);
      }
      return undefined;
    }
    const canvas = canvasRef.current;
    if (!canvas || frameSize.width === 0 || frameSize.height === 0) {
      return undefined;
    }
    const controller = new AbortController();
    const dpr = window.devicePixelRatio || 1;
    // If the previous render was aborted very recently, the user is likely
    // dragging a slider — skip the expensive halation/bloom pass for snappier
    // feedback.  The final render after they release will include it.
    const isRapidUpdate = performance.now() - lastAbortTimeRef.current < 100;
    const renderPreview = async () => {
      // Reuse a single offscreen canvas across renders to avoid DOM allocation
      if (!workingCanvasRef.current) {
        workingCanvasRef.current = document.createElement("canvas");
      }
      const workingCanvas = workingCanvasRef.current;
      const renderAdjustments = isCropMode
        ? {
            ...adjustments,
            aspectRatio: "original" as const,
            customAspectRatio: orientedSourceAspectRatio,
            scale: 100,
          }
        : adjustments;
      await renderImageToCanvas({
        canvas: workingCanvas,
        source: selectedAsset.blob ?? selectedAsset.objectUrl,
        adjustments: renderAdjustments,
        filmProfile: filmProfile ?? undefined,
        timestampText,
        targetSize: {
          width: Math.round(frameSize.width * dpr),
          height: Math.round(frameSize.height * dpr),
        },
        seedKey: selectedAsset.id,
        renderSeed: previewRenderSeed,
        skipHalationBloom: isRapidUpdate,
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      const outputContext = canvas.getContext("2d", { willReadFrequently: true });
      if (!outputContext) {
        return;
      }
      if (canvas.width !== workingCanvas.width || canvas.height !== workingCanvas.height) {
        canvas.width = workingCanvas.width;
        canvas.height = workingCanvas.height;
      }
      outputContext.clearRect(0, 0, canvas.width, canvas.height);
      outputContext.drawImage(workingCanvas, 0, 0, canvas.width, canvas.height);

      // Mark the rotation that is now visible on the canvas so the crop
      // rect effect can stay in sync with the rendered image.
      const justRenderedRotate = renderAdjustments.rotate;
      setRenderedRotate(justRenderedRotate);

      if (!controller.signal.aborted) {
        if (histogramDebounceRef.current !== null) {
          clearTimeout(histogramDebounceRef.current);
        }
        histogramDebounceRef.current = setTimeout(() => {
          histogramDebounceRef.current = null;
          if (controller.signal.aborted) {
            return;
          }
          const previewHistogram = buildHistogramFromCanvas(canvas);
          handlePreviewHistogramChange(
            isSourceMonochrome ? forceMonochromeHistogramMode(previewHistogram) : previewHistogram
          );
        }, 150);
      }
    };

    void renderPreview().catch(() => undefined);

    return () => {
      controller.abort();
      lastAbortTimeRef.current = performance.now();
      if (histogramDebounceRef.current !== null) {
        clearTimeout(histogramDebounceRef.current);
        histogramDebounceRef.current = null;
      }
    };
  }, [
    adjustments,
    filmProfile,
    frameSize.height,
    frameSize.width,
    handlePreviewHistogramChange,
    isCropMode,
    isSourceMonochrome,
    previewRenderSeed,
    selectedAsset,
    showOriginal,
    orientedSourceAspectRatio,
    timestampText,
  ]);

  useEffect(() => {
    if (pointColorPicking) {
      resetView();
      setIsPanning(false);
    }
  }, [pointColorPicking, resetView]);

  useEffect(() => {
    if (isCropMode) {
      // Reset zoom when entering crop mode — crop is independent of zoom
      setViewScale(1);
      setViewOffset({ x: 0, y: 0 });
      return;
    }
    cropDragRef.current = null;
    cropLastPatchRef.current = {};
    if (cropMovePreviewFrameRef.current !== null) {
      cancelAnimationFrame(cropMovePreviewFrameRef.current);
      cropMovePreviewFrameRef.current = null;
    }
    if (cropResizeFrameRef.current !== null) {
      cancelAnimationFrame(cropResizeFrameRef.current);
      cropResizeFrameRef.current = null;
    }
    cropResizePendingRectRef.current = null;
    setActiveCropDragMode(null);
  }, [isCropMode]);

  useEffect(() => {
    if (!selectedAsset && pointColorPicking) {
      cancelPointColorPick();
    }
  }, [cancelPointColorPick, pointColorPicking, selectedAsset]);

  const samplePixelColor = useCallback(
    (normalizedX: number, normalizedY: number) => {
      const x = clamp(normalizedX, 0, 1);
      const y = clamp(normalizedY, 0, 1);

      if (showOriginal || !adjustments) {
        const image = originalImageRef.current;
        if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
          return null;
        }
        const canvas = sampleBufferRef.current ?? document.createElement("canvas");
        sampleBufferRef.current = canvas;
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          return null;
        }
        const sx = clamp(Math.floor(x * image.naturalWidth), 0, image.naturalWidth - 1);
        const sy = clamp(Math.floor(y * image.naturalHeight), 0, image.naturalHeight - 1);
        context.clearRect(0, 0, 1, 1);
        context.drawImage(image, sx, sy, 1, 1, 0, 0, 1, 1);
        const pixel = context.getImageData(0, 0, 1, 1).data;
        return {
          red: pixel[0] ?? 0,
          green: pixel[1] ?? 0,
          blue: pixel[2] ?? 0,
        };
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        return null;
      }
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return null;
      }
      const sx = clamp(Math.floor(x * canvas.width), 0, canvas.width - 1);
      const sy = clamp(Math.floor(y * canvas.height), 0, canvas.height - 1);
      const pixel = context.getImageData(sx, sy, 1, 1).data;
      return {
        red: pixel[0] ?? 0,
        green: pixel[1] ?? 0,
        blue: pixel[2] ?? 0,
      };
    },
    [adjustments, showOriginal]
  );

  const { actionMessage, setActionMessage } = useEditorKeyboard({
    selectedAsset,
    showOriginal,
    isCropMode,
    viewScale,
    toggleOriginal,
    handleUndo,
    handleRedo,
    resetView,
    handleZoom,
  });

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

  const handleCropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isCropMode || !cropRect || !adjustments) {
      return;
    }
    const target = event.target as HTMLElement;
    const handle = target
      .closest("[data-crop-handle]")
      ?.getAttribute("data-crop-handle") as CropDragMode | null;
    const isBody = Boolean(target.closest("[data-crop-body]"));
    const mode: CropDragMode | null = handle ?? (isBody ? "move" : null);
    if (!mode) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const startPatch = toCropPatch(cropRect);
    cropDragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startRect: cropRect,
      startHorizontal: adjustments.horizontal,
      startVertical: adjustments.vertical,
      startScale: startPatch.scale ?? adjustments.scale,
      startCustomAspectRatio: startPatch.customAspectRatio ?? adjustments.customAspectRatio,
      startTime: performance.now(),
      moveArmed: mode !== "move",
    };
    cropLastPatchRef.current = {};
    setActiveCropDragMode(mode === "move" ? null : mode);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCropPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isCropMode || !cropDragRef.current || !adjustments) {
      return;
    }

    const drag = cropDragRef.current;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const frameWidth = frameSize.width;
    const frameHeight = frameSize.height;
    if (frameWidth <= 0 || frameHeight <= 0) {
      return;
    }
    const startRect = drag.startRect;
    const mode = drag.mode;
    let nextRect: CropRect;

    if (mode === "move") {
      if (!drag.moveArmed) {
        const elapsed = performance.now() - drag.startTime;
        if (elapsed < 140) {
          return;
        }
        drag.moveArmed = true;
        drag.startX = event.clientX;
        drag.startY = event.clientY;
        drag.startHorizontal = adjustments.horizontal;
        drag.startVertical = adjustments.vertical;
        return;
      }
      const moveDx = event.clientX - drag.startX;
      const moveDy = event.clientY - drag.startY;
      const targetHorizontal = clamp(
        drag.startHorizontal + (moveDx / Math.max(frameWidth, 1)) * 500,
        -100,
        100
      );
      const targetVertical = clamp(
        drag.startVertical + (moveDy / Math.max(frameHeight, 1)) * 500,
        -100,
        100
      );
      let nextHorizontal = targetHorizontal;
      let nextVertical = targetVertical;
      const canContainCropRect = (horizontal: number, vertical: number) => {
        const imagePolygon = buildCropImagePolygon(
          frameWidth,
          frameHeight,
          adjustments.rotate,
          horizontal,
          vertical
        );
        return isCropRectInsidePolygon(startRect, imagePolygon);
      };
      if (!canContainCropRect(nextHorizontal, nextVertical)) {
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 18; i += 1) {
          const mid = (lo + hi) / 2;
          const testHorizontal =
            drag.startHorizontal + (targetHorizontal - drag.startHorizontal) * mid;
          const testVertical = drag.startVertical + (targetVertical - drag.startVertical) * mid;
          if (canContainCropRect(testHorizontal, testVertical)) {
            lo = mid;
          } else {
            hi = mid;
          }
        }
        nextHorizontal = drag.startHorizontal + (targetHorizontal - drag.startHorizontal) * lo;
        nextVertical = drag.startVertical + (targetVertical - drag.startVertical) * lo;
      }
      const patch: Partial<
        Pick<
          NonNullable<typeof adjustments>,
          "horizontal" | "vertical" | "scale" | "customAspectRatio"
        >
      > = {
        horizontal: nextHorizontal,
        vertical: nextVertical,
        scale: drag.startScale,
        customAspectRatio: drag.startCustomAspectRatio,
      };
      cropLastPatchRef.current = patch;
      if (cropMovePreviewFrameRef.current === null) {
        cropMovePreviewFrameRef.current = requestAnimationFrame(() => {
          cropMovePreviewFrameRef.current = null;
          const latestPatch = cropLastPatchRef.current;
          if (latestPatch && Object.keys(latestPatch).length > 0) {
            previewCropAdjustments(latestPatch);
          }
        });
      }
      return;
    }

    const startHandle = getCropHandlePoint(startRect, mode);
    const pointerX = startHandle.x + dx;
    const pointerY = startHandle.y + dy;
    const isCorner = mode === "nw" || mode === "ne" || mode === "sw" || mode === "se";
    const isVerticalEdge = mode === "n" || mode === "s";
    const isHorizontalEdge = mode === "w" || mode === "e";
    const lockAspect = adjustments.aspectRatio !== "free";
    const centerX = frameWidth / 2;
    const centerY = frameHeight / 2;
    const maxHalfWidth = frameWidth / 2;
    const maxHalfHeight = frameHeight / 2;
    const minHalfWidth = Math.min(CROP_RECT_MIN_SIZE / 2, maxHalfWidth);
    const minHalfHeight = Math.min(CROP_RECT_MIN_SIZE / 2, maxHalfHeight);

    let halfWidth = startRect.width / 2;
    let halfHeight = startRect.height / 2;

    if (lockAspect) {
      const ratio = Math.max(0.001, cropTargetRatio);
      const minHalfWidthByRatio = Math.max(minHalfWidth, minHalfHeight * ratio);
      const maxHalfWidthByRatio = Math.min(maxHalfWidth, maxHalfHeight * ratio);
      const widthRangeMin = Math.min(minHalfWidthByRatio, maxHalfWidthByRatio);
      const widthRangeMax = Math.max(minHalfWidthByRatio, maxHalfWidthByRatio);

      let halfWidthCandidate = halfWidth;
      if (isVerticalEdge) {
        halfWidthCandidate = Math.abs(pointerY - centerY) * ratio;
      } else if (isHorizontalEdge) {
        halfWidthCandidate = Math.abs(pointerX - centerX);
      } else if (isCorner) {
        const widthFromX = Math.abs(pointerX - centerX);
        const widthFromY = Math.abs(pointerY - centerY) * ratio;
        halfWidthCandidate = Math.abs(dx) >= Math.abs(dy) ? widthFromX : widthFromY;
      }

      halfWidth = clampRange(halfWidthCandidate, widthRangeMin, widthRangeMax);
      halfHeight = halfWidth / ratio;
    } else {
      if (isCorner || isHorizontalEdge) {
        halfWidth = clamp(Math.abs(pointerX - centerX), minHalfWidth, maxHalfWidth);
      }
      if (isCorner || isVerticalEdge) {
        halfHeight = clamp(Math.abs(pointerY - centerY), minHalfHeight, maxHalfHeight);
      }
    }

    nextRect = {
      x: centerX - halfWidth,
      y: centerY - halfHeight,
      width: halfWidth * 2,
      height: halfHeight * 2,
    };
    const currentImagePolygon = buildCropImagePolygon(
      frameWidth,
      frameHeight,
      adjustments.rotate,
      adjustments.horizontal,
      adjustments.vertical
    );
    if (!isCropRectInsidePolygon(nextRect, currentImagePolygon)) {
      const fittedHalf = fitCenteredRectToPolygon(
        centerX,
        centerY,
        startRect.width / 2,
        startRect.height / 2,
        halfWidth,
        halfHeight,
        currentImagePolygon
      );
      halfWidth = fittedHalf.halfWidth;
      halfHeight = fittedHalf.halfHeight;
      nextRect = {
        x: centerX - halfWidth,
        y: centerY - halfHeight,
        width: halfWidth * 2,
        height: halfHeight * 2,
      };
    }

    const patch = toCropPatch(nextRect);
    cropLastPatchRef.current = patch;
    cropResizePendingRectRef.current = nextRect;
    if (cropResizeFrameRef.current === null) {
      cropResizeFrameRef.current = requestAnimationFrame(() => {
        cropResizeFrameRef.current = null;
        const pending = cropResizePendingRectRef.current;
        if (pending) {
          setCropRect(pending);
          cropResizePendingRectRef.current = null;
        }
      });
    }
  };

  const handleCropPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isCropMode || !cropDragRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (cropMovePreviewFrameRef.current !== null) {
      cancelAnimationFrame(cropMovePreviewFrameRef.current);
      cropMovePreviewFrameRef.current = null;
    }
    if (cropResizeFrameRef.current !== null) {
      cancelAnimationFrame(cropResizeFrameRef.current);
      cropResizeFrameRef.current = null;
    }
    if (cropResizePendingRectRef.current) {
      setCropRect(cropResizePendingRectRef.current);
      cropResizePendingRectRef.current = null;
    }
    const patch = cropLastPatchRef.current;
    if (patch && Object.keys(patch).length > 0) {
      previewCropAdjustments(patch);
      void commitCropAdjustments(patch);
    }
    cropDragRef.current = null;
    cropLastPatchRef.current = {};
    setActiveCropDragMode(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const previewScale = isCropMode ? 1 : viewScale;

  return (
    <div className="relative h-full min-h-[300px] w-full">
      <div
        ref={imageAreaRef}
        className={cn(
          "relative flex h-full w-full items-center justify-center bg-black touch-none",
          pointColorPicking ? "cursor-crosshair" : viewScale > 1 && "cursor-grab",
          !pointColorPicking && isPanning && "cursor-grabbing"
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
              const normalizedX = (event.clientX - rect.left) / rect.width;
              const normalizedY = (event.clientY - rect.top) / rect.height;
              const sampled = samplePixelColor(normalizedX, normalizedY);
              if (!sampled) {
                setActionMessage({
                  type: "error",
                  text: "取色失败，请重试。",
                });
                return;
              }
              const mappedColor = commitPointColorSample(sampled);
              setActionMessage({
                type: "success",
                text: `已取色并映射到 ${mappedColor} 通道。`,
              });
            }}
          >
            <div
              className="h-full w-full"
              style={{
                transform: `translate3d(${viewOffset.x}px, ${viewOffset.y}px, 0) scale(${previewScale})`,
                transformOrigin: "center",
              }}
            >
              {selectedAsset ? (
                showOriginal || !adjustments ? (
                  <img
                    ref={originalImageRef}
                    src={selectedAsset.objectUrl}
                    alt={selectedAsset.name}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <canvas
                    ref={canvasRef}
                    role="img"
                    aria-label={`${selectedAsset.name} preview`}
                    className="block h-full w-full"
                  />
                )
              ) : null}
            </div>
            {isCropMode && cropRect && (
              <CropOverlay
                cropRect={cropRect}
                frameWidth={frameSize.width}
                frameHeight={frameSize.height}
                activeCropDragMode={activeCropDragMode}
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
              />
            )}
          </div>
        )}
      </div>

      {actionMessage && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "absolute bottom-4 right-4 rounded-full border px-3 py-1 text-xs shadow-lg",
            actionMessage.type === "success"
              ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
              : "border-rose-300/30 bg-rose-300/10 text-rose-200"
          )}
        >
          {actionMessage.text}
        </p>
      )}
    </div>
  );
}
