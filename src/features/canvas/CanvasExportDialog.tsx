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
  const activeWorkbenchId = useCanvasStore((state) => state.loadedWorkbenchId);
  const activeWorkbenchSlices = useCanvasStore((state) => {
    const activeWorkbench = state.workbenchDraft ?? state.workbench;
    return activeWorkbench?.slices ?? [];
  });
  const { download, downloadSlices, exportDataUrl } = useCanvasExport();

  useEffect(() => {
    if (!open || !stage) {
      return;
    }
    setWidth(Math.round(stage.width()));
    setHeight(Math.round(stage.height()));
  }, [open, stage]);

  useEffect(() => {
    if (activeWorkbenchSlices.length === 0) {
      setMode("whole");
    }
  }, [activeWorkbenchSlices.length]);

  const previewUrl =
    open && mode === "whole"
      ? exportDataUrl(stage, {
          format,
          width,
          height,
          quality,
          pixelRatio,
        })
      : null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogTitle>{`\u5bfc\u51fa\u5de5\u4f5c\u53f0`}</AlertDialogTitle>
        <AlertDialogDescription>
          {`\u5148\u786e\u8ba4\u683c\u5f0f\u3001\u5c3a\u5bf8\u548c\u8d28\u91cf\uff0c\u518d\u5bfc\u51fa\u5f53\u524d\u5de5\u4f5c\u53f0\u6216\u5b83\u7684\u5207\u7247\u5e8f\u5217\u3002`}
        </AlertDialogDescription>

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Select value={mode} onValueChange={(value) => setMode(value as "whole" | "slices")}>
              <SelectTrigger>
                <SelectValue placeholder={"\u5bfc\u51fa\u6a21\u5f0f"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whole">{`\u6574\u4e2a\u5de5\u4f5c\u53f0`}</SelectItem>
                <SelectItem value="slices" disabled={activeWorkbenchSlices.length === 0}>
                  {`\u5207\u7247\u5e8f\u5217`} ({activeWorkbenchSlices.length})
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={format} onValueChange={(value) => setFormat(value as CanvasExportFormat)}>
              <SelectTrigger>
                <SelectValue placeholder={"\u683c\u5f0f"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="jpeg">JPEG</SelectItem>
              </SelectContent>
            </Select>

            <Select value={String(pixelRatio)} onValueChange={(value) => setPixelRatio(Number(value))}>
              <SelectTrigger>
                <SelectValue placeholder={"\u50cf\u7d20\u500d\u7387"} />
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
                placeholder={"\u5bbd\u5ea6"}
              />
              <Input
                type="number"
                min={64}
                value={height}
                onChange={(event) => setHeight(Math.max(64, Number(event.target.value) || 64))}
                placeholder={"\u9ad8\u5ea6"}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-black/35 px-3 py-3 text-sm text-slate-300">
              {activeWorkbenchSlices.length ? (
                <div className="space-y-2">
                  <p>{`\u5c06\u6309\u987a\u5e8f\u5bfc\u51fa`} {activeWorkbenchSlices.length} {`\u4e2a\u5207\u7247\u3002`}</p>
                  <div className="max-h-[120px] space-y-1 overflow-y-auto text-xs text-slate-400">
                    {activeWorkbenchSlices
                      .slice()
                      .sort((left, right) => left.order - right.order)
                      .map((slice) => (
                        <p key={slice.id}>
                          {String(slice.order).padStart(2, "0")} {slice.name} ({slice.width} x{" "}
                          {slice.height})
                        </p>
                      ))}
                  </div>
                </div>
              ) : (
                <p>{`\u5148\u5728\u5de5\u4f5c\u53f0\u91cc\u521b\u5efa\u5207\u7247\uff0c\u518d\u4f7f\u7528\u5e8f\u5217\u5bfc\u51fa\u3002`}</p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{`\u8d28\u91cf`}</span>
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

          {mode === "whole" && previewUrl ? (
            <div className="overflow-hidden rounded-lg border border-white/10 bg-black/35">
              <img
                src={previewUrl}
                alt={"\u5de5\u4f5c\u53f0\u5bfc\u51fa\u9884\u89c8"}
                className="max-h-[220px] w-full object-contain"
              />
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <AlertDialogCancel>{`\u53d6\u6d88`}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const canvasState = useCanvasStore.getState();
              const currentWorkbench =
                canvasState.loadedWorkbenchId === activeWorkbenchId
                  ? canvasState.workbenchDraft ?? canvasState.workbench
                  : null;

              if (mode === "slices") {
                void downloadSlices(stage, currentWorkbench?.slices ?? [], {
                  format,
                  quality,
                  pixelRatio,
                  filePrefix: currentWorkbench?.name ?? "filmlab-workbench",
                });
                return;
              }

              void download(stage, {
                format,
                width,
                height,
                quality,
                pixelRatio,
                fileName: `${currentWorkbench?.name ?? "filmlab-workbench"}.${
                  format === "jpeg" ? "jpg" : "png"
                }`,
              });
            }}
          >
            {`\u4e0b\u8f7d`}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
