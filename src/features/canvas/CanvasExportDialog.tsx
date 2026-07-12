import { Check, Download, FileImage, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasExport, type CanvasArtifactFormat } from "./hooks/useCanvasExport";
import { selectLoadedWorkbench } from "./store/canvasStoreSelectors";

interface CanvasExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FORMAT_OPTIONS: Array<{
  description: string;
  label: string;
  value: CanvasArtifactFormat;
}> = [
  { value: "png", label: "PNG", description: "Lossless / sharp type" },
  { value: "jpeg", label: "JPEG", description: "Compact / share ready" },
];

const SCALE_OPTIONS = [1, 2] as const;

export function CanvasExportDialog({ open, onOpenChange }: CanvasExportDialogProps) {
  const workbench = useCanvasStore(selectLoadedWorkbench);
  const { downloadArtifact, renderArtifactPreview } = useCanvasExport();
  const [format, setFormat] = useState<CanvasArtifactFormat>("png");
  const [quality, setQuality] = useState(0.92);
  const [pixelRatio, setPixelRatio] = useState<1 | 2>(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const previewRequestRef = useRef(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDownloadError(null);
    setProgress(0);
  }, [open]);

  useEffect(() => {
    if (!open || !workbench) {
      setPreviewUrl(null);
      setPreviewLoading(false);
      setPreviewError(workbench ? null : "没有可预览的作品。");
      return;
    }

    const requestId = ++previewRequestRef.current;
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);

    const timeoutId = window.setTimeout(() => {
      void renderArtifactPreview({ format, quality })
        .then((result) => {
          if (!cancelled && previewRequestRef.current === requestId) {
            setPreviewUrl(result.dataUrl);
          }
        })
        .catch((cause) => {
          if (!cancelled && previewRequestRef.current === requestId) {
            setPreviewUrl(null);
            setPreviewError(cause instanceof Error ? cause.message : "导出预览生成失败，请重试。");
          }
        })
        .finally(() => {
          if (!cancelled && previewRequestRef.current === requestId) {
            setPreviewLoading(false);
          }
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [format, open, quality, renderArtifactPreview, workbench]);

  const outputWidth = (workbench?.width ?? 0) * pixelRatio;
  const outputHeight = (workbench?.height ?? 0) * pixelRatio;
  const error = downloadError ?? previewError;

  const handleDownload = async () => {
    if (!workbench || exporting) {
      return;
    }
    setExporting(true);
    setDownloadError(null);
    setProgress(0);
    try {
      await downloadArtifact({
        fileName: workbench.name,
        format,
        pixelRatio,
        quality,
        onProgress: setProgress,
      });
      onOpenChange(false);
    } catch (cause) {
      setDownloadError(cause instanceof Error ? cause.message : "作品导出失败，请重试。");
    } finally {
      setExporting(false);
      setProgress(0);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!exporting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <AlertDialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto border-white/10 bg-[#0b0b0c] text-zinc-100">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-lime-300/70">
              Final artifact / canonical render
            </p>
            <AlertDialogTitle className="mt-2 text-2xl tracking-[-0.03em]">
              Render artifact
            </AlertDialogTitle>
            <AlertDialogDescription className="mt-2 max-w-lg text-sm leading-6 text-zinc-400">
              预览与下载使用同一条作品渲染链。1x / 2x 只改变像素密度，不改变裁切和叠层构图。
            </AlertDialogDescription>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-right font-mono">
            <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Frame</p>
            <p className="mt-1 text-xs text-zinc-200">
              {workbench?.width ?? 0} × {workbench?.height ?? 0}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1.25fr)_minmax(220px,0.75fr)]">
          <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-[10px] border border-white/10 bg-[#070708] p-4">
            <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:18px_18px]" />
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Canonical artifact preview"
                className={cn(
                  "relative max-h-[420px] max-w-full object-contain shadow-[0_24px_60px_rgba(0,0,0,0.55)] transition-opacity",
                  previewLoading && "opacity-35"
                )}
              />
            ) : (
              <div className="relative flex flex-col items-center gap-3 text-zinc-600">
                <FileImage className="h-8 w-8" />
                <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
                  Preview unavailable
                </span>
              </div>
            )}
            {previewLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <LoaderCircle className="h-6 w-6 animate-spin text-lime-200" />
              </div>
            ) : null}
          </div>

          <div className="space-y-5">
            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Format
              </p>
              <div className="grid grid-cols-2 gap-2">
                {FORMAT_OPTIONS.map((option) => {
                  const active = format === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={exporting}
                      onClick={() => setFormat(option.value)}
                      className={cn(
                        "relative rounded-[8px] border px-3 py-3 text-left transition disabled:cursor-wait disabled:opacity-50",
                        active
                          ? "border-lime-300/45 bg-lime-300/[0.08]"
                          : "border-white/10 bg-white/[0.035] hover:border-white/20"
                      )}
                    >
                      <span className="font-mono text-xs text-zinc-100">{option.label}</span>
                      <span className="mt-1 block text-[10px] leading-4 text-zinc-500">
                        {option.description}
                      </span>
                      {active ? (
                        <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-lime-300" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Pixel density
              </p>
              <div className="grid grid-cols-2 gap-2">
                {SCALE_OPTIONS.map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    disabled={exporting}
                    onClick={() => setPixelRatio(scale)}
                    className={cn(
                      "rounded-[8px] border px-3 py-2.5 font-mono text-xs transition disabled:cursor-wait disabled:opacity-50",
                      pixelRatio === scale
                        ? "border-lime-300/45 bg-lime-300/[0.08] text-lime-100"
                        : "border-white/10 bg-white/[0.035] text-zinc-400 hover:border-white/20"
                    )}
                  >
                    {scale}x
                  </button>
                ))}
              </div>
              <p className="mt-2 font-mono text-[10px] text-zinc-500">
                {outputWidth} × {outputHeight} PX
              </p>
            </div>

            <div className={cn("space-y-2", format === "png" && "opacity-40")}>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>JPEG quality</span>
                <span className="font-mono">{Math.round(quality * 100)}%</span>
              </div>
              <Slider
                min={0.6}
                max={1}
                step={0.01}
                value={[quality]}
                onValueChange={(value) => setQuality(value[0] ?? 0.92)}
                disabled={format === "png" || exporting}
              />
            </div>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-[8px] border border-red-400/20 bg-red-400/[0.07] px-3 py-2.5 text-xs leading-5 text-red-200"
          >
            {error}
          </div>
        ) : null}

        {exporting ? (
          <div className="mt-4">
            <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              <span>Rendering</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-lime-300 transition-[width] duration-150"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-3">
          <AlertDialogCancel
            disabled={exporting}
            className="border-white/10 bg-transparent text-zinc-300 hover:bg-white/[0.06] hover:text-white"
          >
            取消
          </AlertDialogCancel>
          <Button
            disabled={exporting || previewLoading || Boolean(previewError) || !workbench}
            onClick={() => void handleDownload()}
            className="min-w-[150px] bg-lime-300 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0a0c07] hover:bg-lime-200 disabled:cursor-wait"
          >
            {exporting ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {exporting ? "Rendering" : `Download ${format.toUpperCase()}`}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
