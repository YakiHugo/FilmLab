import type Konva from "konva";
import { useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasExport, type CanvasExportFormat } from "./hooks/useCanvasExport";

interface CanvasExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: Konva.Stage | null;
}

export function CanvasExportDialog({ open, onOpenChange, stage }: CanvasExportDialogProps) {
  const [format, setFormat] = useState<CanvasExportFormat>("png");
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1350);
  const [quality, setQuality] = useState(0.92);
  const [pixelRatio, setPixelRatio] = useState(2);
  const [mode, setMode] = useState<"whole" | "slices">("whole");
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [documents, activeDocumentId]
  );
  const { download, downloadSlices, exportDataUrl } = useCanvasExport();

  useEffect(() => {
    if (!open || !stage) {
      return;
    }
    setWidth(Math.round(stage.width()));
    setHeight(Math.round(stage.height()));
  }, [open, stage]);

  useEffect(() => {
    if (activeDocument?.slices.length) {
      return;
    }
    setMode("whole");
  }, [activeDocument?.slices.length]);

  const previewUrl = exportDataUrl(stage, {
    format,
    width,
    height,
    quality,
    pixelRatio,
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogTitle>Export Canvas</AlertDialogTitle>
        <AlertDialogDescription>
          Choose format, dimensions, and quality before downloading.
        </AlertDialogDescription>

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Select value={mode} onValueChange={(value) => setMode(value as "whole" | "slices")}>
              <SelectTrigger>
                <SelectValue placeholder="Export mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whole">Whole Board</SelectItem>
                <SelectItem value="slices" disabled={!activeDocument?.slices.length}>
                  Slices ({activeDocument?.slices.length ?? 0})
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={format} onValueChange={(value) => setFormat(value as CanvasExportFormat)}>
              <SelectTrigger>
                <SelectValue placeholder="Format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="jpeg">JPEG</SelectItem>
              </SelectContent>
            </Select>

            <Select value={String(pixelRatio)} onValueChange={(value) => setPixelRatio(Number(value))}>
              <SelectTrigger>
                <SelectValue placeholder="DPI scale" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1x</SelectItem>
                <SelectItem value="2">2x</SelectItem>
                <SelectItem value="3">3x</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "whole" ? (
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                min={64}
                value={width}
                onChange={(event) => setWidth(Math.max(64, Number(event.target.value) || 64))}
                placeholder="Width"
              />
              <Input
                type="number"
                min={64}
                value={height}
                onChange={(event) => setHeight(Math.max(64, Number(event.target.value) || 64))}
                placeholder="Height"
              />
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-3 text-sm text-slate-300">
              {activeDocument?.slices.length ? (
                <div className="space-y-2">
                  <p>{activeDocument.slices.length} slices will be exported in sequence.</p>
                  <div className="max-h-[120px] space-y-1 overflow-y-auto text-xs text-slate-400">
                    {activeDocument.slices
                      .slice()
                      .sort((left, right) => left.order - right.order)
                      .map((slice) => (
                        <p key={slice.id}>
                          {String(slice.order).padStart(2, "0")} {slice.name} ({slice.width} × {slice.height})
                        </p>
                      ))}
                  </div>
                </div>
              ) : (
                <p>Create slices in Studio before using slice export.</p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Quality</span>
              <span>{Math.round(quality * 100)}%</span>
            </div>
            <Slider
              min={0.4}
              max={1}
              step={0.01}
              value={[quality]}
              onValueChange={(value) => setQuality(value[0] ?? 0.92)}
              disabled={format === "png"}
            />
          </div>

          {mode === "whole" && previewUrl && (
            <div className="overflow-hidden rounded-lg border border-white/10 bg-black/35">
              <img src={previewUrl} alt="Canvas export preview" className="max-h-[220px] w-full object-contain" />
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (mode === "slices") {
                downloadSlices(stage, activeDocument?.slices ?? [], {
                  format,
                  quality,
                  pixelRatio,
                  filePrefix: activeDocument?.name ?? "filmlab-story",
                });
                return;
              }

              download(stage, {
                format,
                width,
                height,
                quality,
                pixelRatio,
                fileName: `${activeDocument?.name ?? "filmlab-story"}.${format === "jpeg" ? "jpg" : "png"}`,
              });
            }}
          >
            Download
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
