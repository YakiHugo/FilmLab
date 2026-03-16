import type Konva from "konva";
import {
  Copy,
  Download,
  Hand,
  MousePointer2,
  Redo2,
  Shapes,
  Trash2,
  Type,
  Undo2,
  Wand2,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCanvasStore } from "@/stores/canvasStore";
import { CanvasExportDialog } from "./CanvasExportDialog";
import { useCanvasHistory } from "./hooks/useCanvasHistory";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";

interface CanvasToolbarProps {
  stageRef: RefObject<Konva.Stage>;
}

export function CanvasToolbar({ stageRef }: CanvasToolbarProps) {
  const tool = useCanvasStore((state) => state.tool);
  const setTool = useCanvasStore((state) => state.setTool);
  const shapeType = useCanvasStore((state) => state.shapeType);
  const setShapeType = useCanvasStore((state) => state.setShapeType);
  const zoom = useCanvasStore((state) => state.zoom);
  const { canUndo, canRedo, undo, redo } = useCanvasHistory();
  const { selectedElementIds, duplicateSelection, deleteSelection } = useCanvasInteraction();
  const [exportOpen, setExportOpen] = useState(false);
  const selectedCount = selectedElementIds.length;

  return (
    <>
      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,20,0.96),rgba(10,10,11,0.94))] px-4 py-4 shadow-[0_30px_90px_-48px_rgba(0,0,0,0.95)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Canvas Controls</p>
              <h3 className="mt-1 font-['Syne'] text-xl text-zinc-100">Compose on canvas, branch when needed.</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={tool === "select" ? "default" : "secondary"}
                className="rounded-2xl"
                onClick={() => setTool("select")}
              >
                <MousePointer2 className="mr-2 h-4 w-4" />
                Select
              </Button>
              <Button
                size="sm"
                variant={tool === "hand" ? "default" : "secondary"}
                className="rounded-2xl"
                onClick={() => setTool("hand")}
              >
                <Hand className="mr-2 h-4 w-4" />
                Pan
              </Button>
              <Button
                size="sm"
                variant={tool === "text" ? "default" : "secondary"}
                className="rounded-2xl"
                onClick={() => setTool("text")}
              >
                <Type className="mr-2 h-4 w-4" />
                Text
              </Button>
              <Button
                size="sm"
                variant={tool === "shape" ? "default" : "secondary"}
                className="rounded-2xl"
                onClick={() => setTool("shape")}
              >
                <Shapes className="mr-2 h-4 w-4" />
                Shape
              </Button>

              {tool === "shape" ? (
                <Select
                  value={shapeType}
                  onValueChange={(value) => setShapeType(value as "rect" | "circle" | "line")}
                >
                  <SelectTrigger className="h-9 w-[132px] rounded-2xl border-white/10 bg-black/40 text-xs text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rect">Rectangle</SelectItem>
                    <SelectItem value="circle">Circle</SelectItem>
                    <SelectItem value="line">Line</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-300">
              {selectedCount > 0 ? `${selectedCount} selected` : `Zoom ${Math.round(zoom * 100)}%`}
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="rounded-2xl"
              onClick={undo}
              disabled={!canUndo}
            >
              <Undo2 className="mr-2 h-4 w-4" />
              Undo
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="rounded-2xl"
              onClick={redo}
              disabled={!canRedo}
            >
              <Redo2 className="mr-2 h-4 w-4" />
              Redo
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="rounded-2xl"
              onClick={() => void duplicateSelection()}
              disabled={selectedCount === 0}
            >
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="rounded-2xl text-rose-200 hover:text-rose-100"
              onClick={() => void deleteSelection()}
              disabled={selectedCount === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            <Button size="sm" variant="secondary" className="rounded-2xl" asChild>
              <Link to="/assist">
                <Wand2 className="mr-2 h-4 w-4" />
                AI Tools
              </Link>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="rounded-2xl"
              onClick={() => setExportOpen(true)}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        <p className="mt-3 text-xs leading-6 text-zinc-500">
          V1 keeps AI contextual and non-destructive. Use Canvas for layout, Library for source
          collection, and Editor when a single image needs deeper correction.
        </p>
      </div>

      <CanvasExportDialog open={exportOpen} onOpenChange={setExportOpen} stage={stageRef.current} />
    </>
  );
}
