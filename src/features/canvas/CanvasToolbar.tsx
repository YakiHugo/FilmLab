import type Konva from "konva";
import {
  Download,
  Hand,
  MousePointer2,
  Redo2,
  Shapes,
  Type,
  Undo2,
} from "lucide-react";
import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCanvasStore } from "@/stores/canvasStore";
import { CanvasExportDialog } from "./CanvasExportDialog";
import { useCanvasHistory } from "./hooks/useCanvasHistory";

interface CanvasToolbarProps {
  stageRef: RefObject<Konva.Stage>;
}

export function CanvasToolbar({ stageRef }: CanvasToolbarProps) {
  const tool = useCanvasStore((state) => state.tool);
  const setTool = useCanvasStore((state) => state.setTool);
  const shapeType = useCanvasStore((state) => state.shapeType);
  const setShapeType = useCanvasStore((state) => state.setShapeType);
  const { canUndo, canRedo, undo, redo } = useCanvasHistory();
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <>
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
          <Button
            size="sm"
            variant={tool === "shape" ? "default" : "secondary"}
            className="rounded-xl"
            onClick={() => setTool("shape")}
          >
            <Shapes className="h-4 w-4" />
          </Button>
          <Select value={shapeType} onValueChange={(value) => setShapeType(value as "rect" | "circle" | "line")}>
            <SelectTrigger className="h-9 w-[110px] rounded-xl border-white/10 bg-black/45 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rect">Rectangle</SelectItem>
              <SelectItem value="circle">Circle</SelectItem>
              <SelectItem value="line">Line</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="rounded-xl border border-white/10 bg-black/45"
            onClick={undo}
            disabled={!canUndo}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-xl border border-white/10 bg-black/45"
            onClick={redo}
            disabled={!canRedo}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-xl border border-white/10 bg-black/45"
            onClick={() => setExportOpen(true)}
          >
            <Download className="mr-1 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <CanvasExportDialog open={exportOpen} onOpenChange={setExportOpen} stage={stageRef.current} />
    </>
  );
}
