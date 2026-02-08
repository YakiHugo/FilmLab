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
} from "./histogram";
import { useEditorState } from "./useEditorState";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.05;

export function EditorPreviewCard() {
  const {
    selectedAsset,
    previewAdjustments: adjustments,
    previewFilmProfile: filmProfile,
    presetLabel,
    showOriginal,
    copiedAdjustments,
    toggleOriginal,
    handleResetAll,
    handleCopy,
    handlePaste,
    handlePreviewHistogramChange,
  } = useEditorState();

  const canPaste = Boolean(copiedAdjustments);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageAreaRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  useLayoutEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }
    const element = containerRef.current;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setContainerSize({
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      });
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      setContainerSize({
        width: Math.max(1, Math.floor(width)),
        height: Math.max(1, Math.floor(height)),
      });
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
      handlePreviewHistogramChange(
        buildHistogramFromDrawable(
          image as CanvasImageSource,
          image.naturalWidth,
          image.naturalHeight
        )
      );
    };

    void compute().catch(() => {
      if (!isCancelled) {
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
      handlePreviewHistogramChange(null);
      return undefined;
    }
    const controller = new AbortController();
    const dpr = window.devicePixelRatio || 1;
    const renderPreview = async () => {
      await renderImageToCanvas({
        canvas,
        source: selectedAsset.blob ?? selectedAsset.objectUrl,
        adjustments,
        filmProfile: filmProfile ?? undefined,
        targetSize: {
          width: Math.round(frameSize.width * dpr),
          height: Math.round(frameSize.height * dpr),
        },
        seedKey: selectedAsset.id,
        seedSalt: selectedAsset.seedSalt ?? 0,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        handlePreviewHistogramChange(buildHistogramFromCanvas(canvas));
      }
    };

    void renderPreview().catch(() => {
      if (!controller.signal.aborted) {
        handlePreviewHistogramChange(null);
      }
    });

    return () => controller.abort();
  }, [
    adjustments,
    filmProfile,
    frameSize.height,
    frameSize.width,
    handlePreviewHistogramChange,
    selectedAsset,
    showOriginal,
  ]);

  const handleZoom = (nextScale: number) => {
    setViewScale(clamp(nextScale, ZOOM_MIN, ZOOM_MAX));
  };

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (!selectedAsset) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const delta = -event.deltaY;
      handleZoom(viewScale + delta * 0.002);
    },
    [selectedAsset, viewScale]
  );

  useEffect(() => {
    const element = imageAreaRef.current;
    if (!element) {
      return;
    }
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || viewScale <= 1) {
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
    <div className="flex h-full w-full min-h-0 flex-col gap-4">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
            编辑预览
          </p>
          <p className="text-sm text-slate-300">
            {selectedAsset ? selectedAsset.name : "请选择一张照片开始编辑。"}
          </p>
          {selectedAsset && (
            <p className="text-xs text-slate-500">预设：{presetLabel ?? "未设置"}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={showOriginal ? "default" : "secondary"}
            onClick={toggleOriginal}
            disabled={!selectedAsset}
          >
            对比原图
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleResetAll}
            disabled={!selectedAsset}
          >
            重置全部
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleCopy}
            disabled={!selectedAsset}
          >
            复制设置
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handlePaste}
            disabled={!canPaste || !selectedAsset}
          >
            粘贴设置
          </Button>
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 min-h-0">
        <div
          ref={imageAreaRef}
          className={cn(
            "relative flex h-full w-full items-center justify-center rounded-[28px] border border-white/10 bg-black/40 touch-none",
            viewScale > 1 && "cursor-grab",
            isPanning && "cursor-grabbing"
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
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 px-0"
            onClick={() => handleZoom(viewScale + ZOOM_STEP)}
            disabled={!selectedAsset}
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
        </div>
      </div>
    </div>
  );
}
