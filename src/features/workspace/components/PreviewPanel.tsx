import { memo, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { renderImageToCanvas } from "@/lib/imageProcessing";
import { resolveAssetTimestampText } from "@/lib/timestamp";
import type { Asset, EditingAdjustments, FilmProfile } from "@/types";

interface PreviewPanelProps {
  activeAsset: Asset | null;
  previewAdjustments: EditingAdjustments | null;
  previewFilmProfile: FilmProfile | null;
  showOriginal: boolean;
  setShowOriginal: Dispatch<SetStateAction<boolean>>;
}

export const PreviewPanel = memo(
  ({
    activeAsset,
    previewAdjustments,
    previewFilmProfile,
    showOriginal,
    setShowOriginal,
  }: PreviewPanelProps) => {
    const frameRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
    const [renderFailed, setRenderFailed] = useState(false);

    const previewRatio = useMemo(() => {
      if (!activeAsset?.metadata?.width || !activeAsset?.metadata?.height) {
        return "4 / 3";
      }
      return `${activeAsset.metadata.width} / ${activeAsset.metadata.height}`;
    }, [activeAsset?.metadata?.height, activeAsset?.metadata?.width]);

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
      setRenderFailed(false);
    }, [activeAsset?.id, previewAdjustments, previewFilmProfile]);

    useEffect(() => {
      if (!activeAsset || !previewAdjustments || showOriginal) {
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
        source: activeAsset.blob ?? activeAsset.objectUrl,
        adjustments: previewAdjustments,
        filmProfile: previewFilmProfile ?? undefined,
        timestampText: resolveAssetTimestampText(
          activeAsset.metadata,
          activeAsset.createdAt
        ),
        targetSize: {
          width: Math.round(frameSize.width * dpr),
          height: Math.round(frameSize.height * dpr),
        },
        seedKey: activeAsset.id,
        signal: controller.signal,
      })
        .then(() => {
          if (!controller.signal.aborted) {
            setRenderFailed(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setRenderFailed(true);
          }
        });
      return () => controller.abort();
    }, [
      activeAsset?.blob,
      activeAsset?.id,
      activeAsset?.objectUrl,
      frameSize.height,
      frameSize.width,
      previewAdjustments,
      previewFilmProfile,
      showOriginal,
    ]);

    const shouldShowProcessedPreview =
      !showOriginal &&
      Boolean(previewAdjustments) &&
      !renderFailed &&
      frameSize.width > 0 &&
      frameSize.height > 0;

    return (
      <Card className="min-w-0">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>棰勮</CardTitle>
            <p className="text-xs text-slate-400 line-clamp-1">
              {activeAsset?.name ?? "灏氭湭閫夋嫨绱犳潗"}
            </p>
          </div>
          <Button
            size="sm"
            variant={showOriginal ? "default" : "secondary"}
            onClick={() => setShowOriginal((prev) => !prev)}
            disabled={!activeAsset}
          >
            瀵规瘮鍘熷浘
          </Button>
        </CardHeader>
        <CardContent>
          {activeAsset ? (
            <div
              ref={frameRef}
              className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60"
              style={{ aspectRatio: previewRatio }}
            >
              <img
                src={activeAsset.objectUrl}
                alt={activeAsset.name}
                className="h-full w-full object-cover"
              />
              {shouldShowProcessedPreview && (
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label={`${activeAsset.name} 棰勮`}
                  className="absolute inset-0 block h-full w-full"
                />
              )}
              {showOriginal && (
                <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 text-xs text-slate-200">
                  鍘熷浘
                </span>
              )}
              {renderFailed && !showOriginal && (
                <span className="absolute left-3 top-3 rounded-full border border-amber-200/30 bg-amber-300/15 px-3 py-1 text-xs text-amber-100">
                  娓叉煋澶辫触锛屾樉绀哄師鍥?                </span>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-6 text-center text-sm text-slate-400">
              杩樻病鏈夌礌鏉愶紝瀵煎叆鍚庡嵆鍙瑙堛€?            </div>
          )}
        </CardContent>
      </Card>
    );
  },
);

PreviewPanel.displayName = "PreviewPanel";
