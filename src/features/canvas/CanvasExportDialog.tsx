import type Konva from "konva";
import { useEffect, useState } from "react";
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
  const { download, exportDataUrl } = useCanvasExport();

  useEffect(() => {
    if (!open || !stage) {
      return;
    }
    setWidth(Math.round(stage.width()));
    setHeight(Math.round(stage.height()));
  }, [open, stage]);

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

          {previewUrl && (
            <div className="overflow-hidden rounded-lg border border-white/10 bg-black/35">
              <img src={previewUrl} alt="Canvas export preview" className="max-h-[220px] w-full object-contain" />
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              download(stage, {
                format,
                width,
                height,
                quality,
                pixelRatio,
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
