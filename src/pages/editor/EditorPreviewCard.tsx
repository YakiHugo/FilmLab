import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { renderImageToCanvas } from "@/lib/imageProcessing";
import {
  buildHistogramFromCanvas,
  buildHistogramFromDrawable,
  forceMonochromeHistogramMode,
} from "./histogram";
import { useEditorState } from "./useEditorState";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

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

export function EditorPreviewCard() {
  const {
    selectedAsset,
    previewAdjustments: adjustments,
    previewFilmProfile: filmProfile,
    showOriginal,
    pointColorPicking,
    toggleOriginal,
    cancelPointColorPick,
    commitPointColorSample,
    handleUndo,
    handleRedo,
    handlePreviewHistogramChange,
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

  const triggerUndo = useCallback(() => {
    const undone = handleUndo();
    setActionMessage(
      undone
        ? { type: "success", text: "已撤销上一步。" }
        : { type: "error", text: "没有可撤销的操作。" }
    );
    return undone;
  }, [handleUndo]);

  const triggerRedo = useCallback(() => {
    const redone = handleRedo();
    setActionMessage(
      redone
        ? { type: "success", text: "已重做上一步。" }
        : { type: "error", text: "没有可重做的操作。" }
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

  const imageAspectRatio = useMemo(() => {
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

  const frameSize = useMemo(() => {
    if (!containerSize.width || !containerSize.height) {
      return { width: 0, height: 0 };
    }
    let width = containerSize.width;
    let height = width / imageAspectRatio;
    if (height > containerSize.height) {
      height = containerSize.height;
      width = height * imageAspectRatio;
    }
    return {
      width: Math.max(1, Math.floor(width)),
      height: Math.max(1, Math.floor(height)),
    };
  }, [containerSize.height, containerSize.width, imageAspectRatio]);

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
      await renderImageToCanvas({
        canvas: workingCanvas,
        source: selectedAsset.blob ?? selectedAsset.objectUrl,
        adjustments,
        filmProfile: filmProfile ?? undefined,
        preferPixi: false,
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

      if (!controller.signal.aborted) {
        const previewHistogram = buildHistogramFromCanvas(canvas);
        handlePreviewHistogramChange(
          isSourceMonochrome
            ? forceMonochromeHistogramMode(previewHistogram)
            : previewHistogram
        );
      }
    };

    void renderPreview().catch(() => undefined);

    return () => controller.abort();
  }, [
    adjustments,
    filmProfile,
    frameSize.height,
    frameSize.width,
    handlePreviewHistogramChange,
    isSourceMonochrome,
    previewRenderSeed,
    selectedAsset,
    showOriginal,
  ]);

  useEffect(() => {
    if (pointColorPicking) {
      resetView();
      setIsPanning(false);
    }
  }, [pointColorPicking, resetView]);

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
      if (event.ctrlKey || event.metaKey) {
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
          text: !showOriginal ? "已切换到原图对比。" : "已切换回调后预览。",
        });
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
    toggleOriginal,
    triggerRedo,
    triggerUndo,
    viewScale,
  ]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointColorPicking || event.button !== 0 || viewScale <= 1) {
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

  const zoomLabel = `${Math.round(viewScale * 100)}%`;

  return (
    <div className="relative h-full min-h-[300px] w-full">
      <div
        ref={imageAreaRef}
        className={cn(
          "relative flex h-full w-full items-center justify-center rounded-[24px] border border-white/10 bg-black/50 touch-none",
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
            className="relative overflow-hidden bg-black/40 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
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
                  text: "取色失败，请稍后重试。",
                });
                return;
              }
              const mappedColor = commitPointColorSample(sampled);
              setActionMessage({
                type: "success",
                text: `已取样并定位到 ${mappedColor} 通道。`,
              });
            }}
          >
            <div
              className="h-full w-full"
              style={{
                transform: `translate3d(${viewOffset.x}px, ${viewOffset.y}px, 0) scale(${0.9 * viewScale})`,
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
                    aria-label={`${selectedAsset.name} 预览`}
                    className="block h-full w-full"
                  />
                )
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
                  请先选择一张照片。
                </div>
              )}
            </div>
            {pointColorPicking && (
              <span className="absolute right-3 top-3 rounded-full border border-sky-300/40 bg-sky-300/10 px-3 py-1 text-xs text-sky-100">
                点击图像取色
              </span>
            )}
            {showOriginal && selectedAsset && (
              <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 text-xs text-slate-200">
                原图
              </span>
            )}
          </div>
        )}
      </div>

      <div
        className="absolute bottom-4 left-4 flex items-center gap-3 rounded-full border border-white/10 bg-slate-950/80 px-3 py-2 text-xs text-slate-200 shadow-lg"
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <Button
          size="sm"
          variant="secondary"
          className="h-8 w-8 px-0"
          onClick={() => handleZoom(viewScale - ZOOM_STEP)}
          disabled={!selectedAsset}
          aria-label="缩小预览"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="w-28">
          <Slider
            value={[viewScale]}
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={ZOOM_STEP}
            onValueChange={(value) => handleZoom(value[0] ?? ZOOM_MIN)}
            disabled={!selectedAsset}
            aria-label="预览缩放"
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 w-8 px-0"
          onClick={() => handleZoom(viewScale + ZOOM_STEP)}
          disabled={!selectedAsset}
          aria-label="放大预览"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <span className="w-12 text-right">{zoomLabel}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          onClick={resetView}
          disabled={!selectedAsset}
        >
          适配
        </Button>
        <span className="hidden text-[11px] text-slate-400 lg:inline">
          双击适配，拖拽平移
        </span>
        <span className="hidden text-[11px] text-slate-500 xl:inline">
          快捷键：O 对比，+/- 缩放，0 适配
        </span>
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
