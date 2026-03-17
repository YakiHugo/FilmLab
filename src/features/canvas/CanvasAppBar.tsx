import { CirclePlus, Download, Redo2, Undo2 } from "lucide-react";
import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasHistory } from "./hooks/useCanvasHistory";

interface CanvasAppBarProps {
  onExport: () => void;
}

export function CanvasAppBar({ onExport }: CanvasAppBarProps) {
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const createDocument = useCanvasStore((state) => state.createDocument);
  const upsertDocument = useCanvasStore((state) => state.upsertDocument);
  const zoom = useCanvasStore((state) => state.zoom);
  const { canUndo, canRedo, undo, redo } = useCanvasHistory();

  const activeDocument = useMemo(
    () => documents.find((d) => d.id === activeDocumentId) ?? null,
    [documents, activeDocumentId]
  );

  return (
    <div className="absolute inset-x-0 top-0 z-20 flex h-[52px] items-center justify-between gap-4 border-b border-white/6 bg-black/50 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        {activeDocument ? (
          <Input
            value={activeDocument.name}
            onChange={(e) =>
              void upsertDocument({
                ...activeDocument,
                name: e.target.value || "Untitled board",
              })
            }
            className="h-8 w-[200px] rounded-lg border-white/10 bg-white/[0.06] px-2.5 text-sm text-zinc-100 placeholder:text-zinc-500"
            placeholder="Board name"
          />
        ) : (
          <span className="text-sm text-zinc-500">No board</span>
        )}
        <button
          type="button"
          onClick={() => {
            void createDocument();
          }}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-xs text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
        >
          <CirclePlus className="h-3.5 w-3.5" />
          New Board
        </button>
      </div>

      <div className="flex items-center gap-1">
        <div className="mr-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-zinc-300">
          {Math.round(zoom * 100)}%
        </div>
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Redo"
        >
          <Redo2 className="h-4 w-4" />
        </button>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <button
          type="button"
          onClick={onExport}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-xs text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>
      </div>
    </div>
  );
}
