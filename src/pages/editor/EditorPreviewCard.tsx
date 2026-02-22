import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const clampRange = (value: number, min: number, max: number) => {
  if (max < min) {
    return max;
  }
  return clamp(value, min, max);
};

const isEditableElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
};

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.05;
const CROP_RECT_MIN_SIZE = 72;

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Point = {
  x: number;
  y: number;
};

type CropDragMode = "move" | "nw" | "ne" | "sw" | "se" | "n" | "e" | "s" | "w";

const CROP_CORNER_HANDLES = ["nw", "ne", "sw", "se"] as const;
const CROP_EDGE_HANDLES = ["n", "e", "s", "w"] as const;
type CropCornerHandle = (typeof CROP_CORNER_HANDLES)[number];
type CropEdgeHandle = (typeof CROP_EDGE_HANDLES)[number];

const isCropCornerHandle = (mode: CropDragMode): mode is CropCornerHandle =>
  CROP_CORNER_HANDLES.includes(mode as CropCornerHandle);

const isCropEdgeHandle = (mode: CropDragMode): mode is CropEdgeHandle =>
  CROP_EDGE_HANDLES.includes(mode as CropEdgeHandle);

const CROP_CORNER_EDGE_MAP: Record<
  CropCornerHandle,
  readonly [CropEdgeHandle, CropEdgeHandle]
> = {
  nw: ["n", "w"],
  ne: ["n", "e"],
  sw: ["s", "w"],
  se: ["s", "e"],
};

const getCropHandlePoint = (rect: CropRect, mode: CropDragMode) => {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  switch (mode) {
    case "nw":
      return { x: rect.x, y: rect.y };
    case "ne":
      return { x: right, y: rect.y };
    case "sw":
      return { x: rect.x, y: bottom };
    case "se":
      return { x: right, y: bottom };
    case "n":
      return { x: centerX, y: rect.y };
    case "e":
      return { x: right, y: centerY };
    case "s":
      return { x: centerX, y: bottom };
    case "w":
      return { x: rect.x, y: centerY };
    default:
      return { x: centerX, y: centerY };
  }
};

const toCenteredRect = (
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight: number
): CropRect => ({
  x: centerX - halfWidth,
  y: centerY - halfHeight,
  width: halfWidth * 2,
  height: halfHeight * 2,
});

const buildCropImagePolygon = (
  frameWidth: number,
  frameHeight: number,
  rotate: number,
  horizontal: number,
  vertical: number
): Point[] => {
  const normalizedHorizontal = clamp(horizontal / 5, -20, 20);
  const normalizedVertical = clamp(vertical / 5, -20, 20);
  const translateX = (normalizedHorizontal / 100) * frameWidth;
  const translateY = (normalizedVertical / 100) * frameHeight;
  const centerX = frameWidth / 2 + translateX;
  const centerY = frameHeight / 2 + translateY;
  const angle = (rotate * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // No cover-scale: the image is rendered at its original size in crop mode,
  // so the polygon matches the frame exactly (before rotation).
  const halfWidth = frameWidth / 2;
  const halfHeight = frameHeight / 2;
  const localCorners: Point[] = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];
  return localCorners.map((corner) => ({
    x: centerX + corner.x * cos - corner.y * sin,
    y: centerY + corner.x * sin + corner.y * cos,
  }));
};

const isPointInsideConvexPolygon = (point: Point, polygon: Point[]) => {
  let hasPositive = false;
  let hasNegative = false;
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    if (!current || !next) {
      continue;
    }
    const cross =
      (next.x - current.x) * (point.y - current.y) -
      (next.y - current.y) * (point.x - current.x);
    if (Math.abs(cross) <= 0.0001) {
      continue;
    }
    if (cross > 0) {
      hasPositive = true;
    } else {
      hasNegative = true;
    }
    if (hasPositive && hasNegative) {
      return false;
    }
  }
  return true;
};

const isCropRectInsidePolygon = (rect: CropRect, polygon: Point[]) => {
  const corners: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  return corners.every((corner) => isPointInsideConvexPolygon(corner, polygon));
};

const fitCenteredRectToPolygon = (
  centerX: number,
  centerY: number,
  startHalfWidth: number,
  startHalfHeight: number,
  targetHalfWidth: number,
  targetHalfHeight: number,
  polygon: Point[]
) => {
  const targetRect = toCenteredRect(
    centerX,
    centerY,
    targetHalfWidth,
    targetHalfHeight
  );
  if (isCropRectInsidePolygon(targetRect, polygon)) {
    return { halfWidth: targetHalfWidth, halfHeight: targetHalfHeight };
  }

  const startRect = toCenteredRect(
    centerX,
    centerY,
    startHalfWidth,
    startHalfHeight
  );
  const hasValidStart = isCropRectInsidePolygon(startRect, polygon);
  let anchorHalfWidth = hasValidStart ? startHalfWidth : 0;
  let anchorHalfHeight = hasValidStart ? startHalfHeight : 0;
  if (!hasValidStart) {
    const centerRect = toCenteredRect(centerX, centerY, 0, 0);
    if (!isCropRectInsidePolygon(centerRect, polygon)) {
      return { halfWidth: startHalfWidth, halfHeight: startHalfHeight };
    }
  }

  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i += 1) {
    const mid = (lo + hi) / 2;
    const testHalfWidth =
      anchorHalfWidth + (targetHalfWidth - anchorHalfWidth) * mid;
    const testHalfHeight =
      anchorHalfHeight + (targetHalfHeight - anchorHalfHeight) * mid;
    const testRect = toCenteredRect(
      centerX,
      centerY,
      testHalfWidth,
      testHalfHeight
    );
    if (isCropRectInsidePolygon(testRect, polygon)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const finalHalfWidth =
    anchorHalfWidth + (targetHalfWidth - anchorHalfWidth) * lo;
  const finalHalfHeight =
    anchorHalfHeight + (targetHalfHeight - anchorHalfHeight) * lo;

  // Shrink by 0.5px safety margin to avoid floating-point boundary touching
  const safeHalfWidth = Math.max(0, finalHalfWidth - 0.5);
  const safeHalfHeight = Math.max(0, finalHalfHeight - 0.5);
  const safeRect = toCenteredRect(centerX, centerY, safeHalfWidth, safeHalfHeight);
  if (isCropRectInsidePolygon(safeRect, polygon)) {
    return { halfWidth: safeHalfWidth, halfHeight: safeHalfHeight };
  }
  return { halfWidth: finalHalfWidth, halfHeight: finalHalfHeight };
};

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
  const panStartRef = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
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
  const histogramDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [viewScale, setViewScale] = useState(1);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isSourceMonochrome, setIsSourceMonochrome] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [activeCropDragMode, setActiveCropDragMode] =
    useState<CropDragMode | null>(null);

  const triggerUndo = useCallback(() => {
    const undone = handleUndo();
    setActionMessage(
      undone
        ? { type: "success", text: "Undo applied." }
        : { type: "error", text: "Nothing to undo." }
    );
    return undone;
  }, [handleUndo]);

  const triggerRedo = useCallback(() => {
    const redone = handleRedo();
    setActionMessage(
      redone
        ? { type: "success", text: "Redo applied." }
        : { type: "error", text: "Nothing to redo." }
    );
    return redone;
  }, [handleRedo]);

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
  }, [
    imageNaturalSize,
    selectedAsset?.metadata?.width,
    selectedAsset?.metadata?.height,
  ]);

  const orientedSourceAspectRatio = useMemo(() => {
    const rightAngleRotation = adjustments?.rightAngleRotation ?? 0;
    return resolveOrientedAspectRatio(sourceAspectRatio, rightAngleRotation);
  }, [adjustments?.rightAngleRotation, sourceAspectRatio]);

  const isCropMode =
    activeToolPanelId === "crop" &&
    Boolean(adjustments) &&
    !showOriginal &&
    !pointColorPicking;
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
  }, [
    adjustments,
    isCropMode,
    orientedSourceAspectRatio,
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
    () =>
      resolveAssetTimestampText(
        selectedAsset?.metadata,
        selectedAsset?.createdAt
      ),
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

  const resetView = useCallback(() => {
    setViewScale(1);
    setViewOffset({ x: 0, y: 0 });
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
      if (!showOriginal) {
        handlePreviewHistogramChange(
          sourceMonochrome
            ? forceMonochromeHistogramMode(sourceHistogram)
            : sourceHistogram
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
  }, [
    handlePreviewHistogramChange,
    selectedAsset?.id,
    selectedAsset?.objectUrl,
    showOriginal,
  ]);

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
    setViewOffset((prev) => clampOffset(prev));
    if (viewScale <= 1) {
      setViewOffset({ x: 0, y: 0 });
    }
  }, [clampOffset, viewScale]);

  useEffect(() => {
    if (!actionMessage) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setActionMessage(null);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

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
        sourceMonochrome
          ? forceMonochromeHistogramMode(sourceHistogram)
          : sourceHistogram
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
    const renderPreview = async () => {
      const workingCanvas = document.createElement("canvas");
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
        preferPixi: true,
        targetSize: {
          width: Math.round(frameSize.width * dpr),
          height: Math.round(frameSize.height * dpr),
        },
        seedKey: selectedAsset.id,
        renderSeed: previewRenderSeed,
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      const outputContext = canvas.getContext("2d", { willReadFrequently: true });
      if (!outputContext) {
        return;
      }
      if (
        canvas.width !== workingCanvas.width ||
        canvas.height !== workingCanvas.height
      ) {
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
            isSourceMonochrome
              ? forceMonochromeHistogramMode(previewHistogram)
              : previewHistogram
          );
        }, 150);
      }
    };

    void renderPreview().catch(() => undefined);

    return () => {
      controller.abort();
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

  const handleZoom = (nextScale: number) => {
    setViewScale(clamp(nextScale, ZOOM_MIN, ZOOM_MAX));
  };

  useEffect(() => {
    const element = imageAreaRef.current;
    if (!element) {
      return undefined;
    }
    const preventBrowserZoom = (event: WheelEvent) => {
      if (isCropModeRef.current || event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    element.addEventListener("wheel", preventBrowserZoom, { passive: false });
    return () => {
      element.removeEventListener("wheel", preventBrowserZoom);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      const withCommand = event.metaKey || event.ctrlKey;
      const isUndoShortcut = withCommand && !event.shiftKey && key === "z";
      const isRedoShortcut =
        withCommand &&
        ((event.shiftKey && key === "z") ||
          (event.ctrlKey && !event.metaKey && key === "y"));

      if (!event.altKey && selectedAsset && isUndoShortcut) {
        event.preventDefault();
        triggerUndo();
        return;
      }
      if (!event.altKey && selectedAsset && isRedoShortcut) {
        event.preventDefault();
        triggerRedo();
        return;
      }

      if (!selectedAsset || withCommand || event.altKey) {
        return;
      }

      if (key === "o") {
        event.preventDefault();
        toggleOriginal();
        setActionMessage({
          type: "success",
          text: !showOriginal ? "Switched to original preview." : "Switched back to edited preview.",
        });
        return;
      }

      if (isCropMode) {
        return;
      }

      if (key === "0") {
        event.preventDefault();
        resetView();
        return;
      }

      if (key === "=" || key === "+") {
        event.preventDefault();
        handleZoom(viewScale + ZOOM_STEP);
        return;
      }

      if (key === "-" || key === "_") {
        event.preventDefault();
        handleZoom(viewScale - ZOOM_STEP);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    resetView,
    selectedAsset,
    showOriginal,
    isCropMode,
    toggleOriginal,
    triggerRedo,
    triggerUndo,
    viewScale,
  ]);

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
      startCustomAspectRatio:
        startPatch.customAspectRatio ?? adjustments.customAspectRatio,
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
    let nextRect: CropRect = { ...startRect };

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
          const testVertical =
            drag.startVertical + (targetVertical - drag.startVertical) * mid;
          if (canContainCropRect(testHorizontal, testVertical)) {
            lo = mid;
          } else {
            hi = mid;
          }
        }
        nextHorizontal =
          drag.startHorizontal + (targetHorizontal - drag.startHorizontal) * lo;
        nextVertical =
          drag.startVertical + (targetVertical - drag.startVertical) * lo;
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
    const isCorner =
      mode === "nw" || mode === "ne" || mode === "sw" || mode === "se";
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

  const highlightedCropEdges = useMemo(() => {
    const highlighted = new Set<CropEdgeHandle>();
    if (!activeCropDragMode || activeCropDragMode === "move") {
      return highlighted;
    }
    if (isCropEdgeHandle(activeCropDragMode)) {
      highlighted.add(activeCropDragMode);
      return highlighted;
    }
    if (isCropCornerHandle(activeCropDragMode)) {
      const [edgeA, edgeB] = CROP_CORNER_EDGE_MAP[activeCropDragMode];
      highlighted.add(edgeA);
      highlighted.add(edgeB);
    }
    return highlighted;
  }, [activeCropDragMode]);

  const highlightedCropCorner = useMemo<CropCornerHandle | null>(() => {
    if (!activeCropDragMode || activeCropDragMode === "move") {
      return null;
    }
    return isCropCornerHandle(activeCropDragMode) ? activeCropDragMode : null;
  }, [activeCropDragMode]);

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
                  text: "Color sampling failed. Please try again.",
                });
                return;
              }
              const mappedColor = commitPointColorSample(sampled);
              setActionMessage({
                type: "success",
                text: `Sampled and mapped to ${mappedColor} channel.`,
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
              <div
                className="absolute inset-0 z-20 touch-none"
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                onPointerCancel={handleCropPointerUp}
              >
                {/* Crop darkening: four rectangles around the crop rect */}
                <div
                  className="pointer-events-none absolute left-0 right-0 top-0 bg-slate-950/45"
                  style={{ height: Math.max(0, cropRect.y) }}
                />
                <div
                  className="pointer-events-none absolute bottom-0 left-0 right-0 bg-slate-950/45"
                  style={{ height: Math.max(0, frameSize.height - cropRect.y - cropRect.height) }}
                />
                <div
                  className="pointer-events-none absolute left-0 bg-slate-950/45"
                  style={{
                    top: cropRect.y,
                    height: cropRect.height,
                    width: Math.max(0, cropRect.x),
                  }}
                />
                <div
                  className="pointer-events-none absolute right-0 bg-slate-950/45"
                  style={{
                    top: cropRect.y,
                    height: cropRect.height,
                    width: Math.max(0, frameSize.width - cropRect.x - cropRect.width),
                  }}
                />
                <div
                  data-crop-body
                  className="absolute cursor-move border border-white/80 bg-transparent"
                  style={{
                    left: cropRect.x,
                    top: cropRect.y,
                    width: cropRect.width,
                    height: cropRect.height,
                  }}
                >
                  <div className="pointer-events-none absolute left-1/3 top-0 h-full w-px bg-white/30" />
                  <div className="pointer-events-none absolute left-2/3 top-0 h-full w-px bg-white/30" />
                  <div className="pointer-events-none absolute left-0 top-1/3 h-px w-full bg-white/30" />
                  <div className="pointer-events-none absolute left-0 top-2/3 h-px w-full bg-white/30" />
                  {CROP_EDGE_HANDLES.map((handle) => (
                    <span
                      key={`${handle}-line`}
                      className={cn(
                        "pointer-events-none absolute z-[6] transition-colors duration-75",
                        handle === "n" && "left-0 right-0 top-0 h-[2px]",
                        handle === "s" && "bottom-0 left-0 right-0 h-[2px]",
                        handle === "w" && "bottom-0 left-0 top-0 w-[2px]",
                        handle === "e" && "bottom-0 right-0 top-0 w-[2px]",
                        highlightedCropEdges.has(handle) ? "bg-sky-300" : "bg-white/65"
                      )}
                    />
                  ))}
                  {CROP_EDGE_HANDLES.map((handle) => (
                    <span
                      key={`${handle}-hit`}
                      data-crop-handle={handle}
                      className={cn(
                        "absolute z-[5] bg-transparent",
                        handle === "n" && "left-2 right-2 -top-2 h-4 cursor-ns-resize",
                        handle === "s" && "left-2 right-2 -bottom-2 h-4 cursor-ns-resize",
                        handle === "w" && "-left-2 bottom-2 top-2 w-4 cursor-ew-resize",
                        handle === "e" && "-right-2 bottom-2 top-2 w-4 cursor-ew-resize"
                      )}
                    />
                  ))}
                  {CROP_CORNER_HANDLES.map((handle) => (
                    <span
                      key={handle}
                      data-crop-handle={handle}
                      className={cn(
                        "absolute z-10 h-3 w-3 rounded-full border",
                        highlightedCropCorner === handle
                          ? "border-sky-300 bg-sky-200 shadow-[0_0_0_2px_rgba(125,211,252,0.35)]"
                          : "border-white/90 bg-slate-100",
                        handle === "nw" && "-left-1.5 -top-1.5 cursor-nwse-resize",
                        handle === "ne" && "-right-1.5 -top-1.5 cursor-nesw-resize",
                        handle === "sw" && "-bottom-1.5 -left-1.5 cursor-nesw-resize",
                        handle === "se" && "-bottom-1.5 -right-1.5 cursor-nwse-resize"
                      )}
                    />
                  ))}
                  {CROP_EDGE_HANDLES.map((handle) => (
                    <span
                      key={handle}
                      data-crop-handle={handle}
                      className={cn(
                        "absolute z-10 rounded-full",
                        highlightedCropEdges.has(handle)
                          ? "bg-sky-300 shadow-[0_0_0_1px_rgba(125,211,252,0.7)]"
                          : "bg-white/95 shadow-[0_0_0_1px_rgba(255,255,255,0.45)]",
                        handle === "n" && "left-1/2 -top-0.5 h-1 w-14 -translate-x-1/2 cursor-ns-resize",
                        handle === "s" && "bottom-[-2px] left-1/2 h-1 w-14 -translate-x-1/2 cursor-ns-resize",
                        handle === "w" && "top-1/2 -left-0.5 h-14 w-1 -translate-y-1/2 cursor-ew-resize",
                        handle === "e" && "right-[-2px] top-1/2 h-14 w-1 -translate-y-1/2 cursor-ew-resize"
                      )}
                    />
                  ))}
                </div>
              </div>
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
