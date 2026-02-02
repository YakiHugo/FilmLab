import { useEffect, useMemo, useRef, useState } from "react";
import type { EditingAdjustments, Asset } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ASPECT_RATIOS } from "./constants";
import { renderImageToCanvas } from "@/lib/imageProcessing";

interface EditorPreviewCardProps {
  selectedAsset: Asset | null;
  adjustments: EditingAdjustments | null;
  presetLabel?: string;
  showOriginal: boolean;
  onToggleOriginal: () => void;
  onResetAll: () => void;
  onCopy: () => void;
  onPaste: () => void;
  canPaste: boolean;
}

export function EditorPreviewCard({
  selectedAsset,
  adjustments,
  presetLabel,
  showOriginal,
  onToggleOriginal,
  onResetAll,
  onCopy,
  onPaste,
  canPaste,
}: EditorPreviewCardProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  const previewAspectRatio = useMemo(() => {
    if (!adjustments) {
      return "4 / 3";
    }
    if (adjustments.aspectRatio === "original") {
      if (selectedAsset?.metadata?.width && selectedAsset?.metadata?.height) {
        return `${selectedAsset.metadata.width} / ${selectedAsset.metadata.height}`;
      }
      return "4 / 3";
    }
    return (
      ASPECT_RATIOS.find((ratio) => ratio.value === adjustments.aspectRatio)?.ratio ??
      "4 / 3"
    );
  }, [adjustments, selectedAsset?.metadata?.height, selectedAsset?.metadata?.width]);

  useEffect(() => {
    if (!frameRef.current) {
      return undefined;
    }
    const element = frameRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      setFrameSize({
        width: Math.max(1, Math.floor(width)),
        height: Math.max(1, Math.floor(height)),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedAsset || !adjustments || showOriginal) {
      return undefined;
    }
    const canvas = canvasRef.current;
    if (!canvas || frameSize.width === 0 || frameSize.height === 0) {
      return undefined;
    }
    const controller = new AbortController();
    const dpr = window.devicePixelRatio || 1;
    void renderImageToCanvas({
      canvas,
      source: selectedAsset.blob ?? selectedAsset.objectUrl,
      adjustments,
      targetSize: {
        width: Math.round(frameSize.width * dpr),
        height: Math.round(frameSize.height * dpr),
      },
      signal: controller.signal,
    }).catch(() => undefined);
    return () => controller.abort();
  }, [adjustments, frameSize.height, frameSize.width, selectedAsset, showOriginal]);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle>预览</CardTitle>
          {selectedAsset && (
            <p className="text-xs text-slate-400 line-clamp-1">{selectedAsset.name}</p>
          )}
        </div>
        {selectedAsset && (
          <span className="text-xs text-slate-400">预设：{presetLabel ?? "未设置"}</span>
        )}
      </CardHeader>
      <CardContent className="min-w-0">
        {selectedAsset ? (
          <div className="space-y-4">
            <div
              ref={frameRef}
              className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60"
              style={{ aspectRatio: previewAspectRatio }}
            >
              {showOriginal || !adjustments ? (
                <img
                  src={selectedAsset.objectUrl}
                  alt={selectedAsset.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label={`${selectedAsset.name} 预览`}
                  className="block h-full w-full"
                />
              )}
              {showOriginal && (
                <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 text-xs text-slate-200">
                  原图
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={showOriginal ? "default" : "secondary"}
                onClick={onToggleOriginal}
              >
                对比原图
              </Button>
              <Button size="sm" variant="secondary" onClick={onResetAll}>
                重置全部
              </Button>
              <Button size="sm" variant="secondary" onClick={onCopy}>
                复制设置
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={onPaste}
                disabled={!canPaste}
              >
                粘贴设置
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">请选择一张照片进行编辑。</p>
        )}
      </CardContent>
    </Card>
  );
}
