import type Konva from "konva";
import { Download, Hand, MousePointer2, Type } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasExport } from "./hooks/useCanvasExport";

interface CanvasToolbarProps {
  stageRef: RefObject<Konva.Stage>;
}

export function CanvasToolbar({ stageRef }: CanvasToolbarProps) {
  const tool = useCanvasStore((state) => state.tool);
  const setTool = useCanvasStore((state) => state.setTool);
  const { exportPng } = useCanvasExport();

  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/35 px-3 py-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={tool === "select" ? "default" : "secondary"}
          className="rounded-xl"
          onClick={() => setTool("select")}
        >
          <MousePointer2 className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant={tool === "hand" ? "default" : "secondary"}
          className="rounded-xl"
          onClick={() => setTool("hand")}
        >
          <Hand className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant={tool === "text" ? "default" : "secondary"}
          className="rounded-xl"
          onClick={() => setTool("text")}
        >
          <Type className="h-4 w-4" />
        </Button>
      </div>

      <Button
        size="sm"
        variant="secondary"
        className="rounded-xl border border-white/10 bg-black/45"
        onClick={() => {
          const dataUrl = exportPng(stageRef.current);
          if (!dataUrl) {
            return;
          }
          const link = document.createElement("a");
          link.href = dataUrl;
          link.download = "filmlab-canvas.png";
          link.click();
        }}
      >
        <Download className="mr-1 h-4 w-4" />
        Export
      </Button>
    </div>
  );
}
