import { useNavigate } from "@tanstack/react-router";
import { CirclePlus, Download, Redo2, Undo2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasHistory } from "./hooks/useCanvasHistory";

interface CanvasAppBarProps {
  onExport: () => void;
}

export function CanvasAppBar({ onExport }: CanvasAppBarProps) {
  const navigate = useNavigate();
  const activeWorkbenchId = useCanvasStore((state) => state.activeWorkbenchId);
  const activeWorkbenchName = useCanvasStore((state) => {
    const activeWorkbench = state.workbenches.find((entry) => entry.id === state.activeWorkbenchId);
    return activeWorkbench?.name ?? "";
  });
  const createWorkbench = useCanvasStore((state) => state.createWorkbench);
  const upsertWorkbench = useCanvasStore((state) => state.upsertWorkbench);
  const zoom = useCanvasStore((state) => state.zoom);
  const { canUndo, canRedo, undo, redo } = useCanvasHistory();

  return (
    <div className="absolute inset-x-0 top-0 z-20 flex h-[52px] items-center justify-between gap-4 border-b border-white/6 bg-black/50 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        {activeWorkbenchId ? (
          <Input
            value={activeWorkbenchName}
            onChange={(event) => {
              const currentWorkbench = useCanvasStore
                .getState()
                .workbenches.find((entry) => entry.id === activeWorkbenchId);
              if (!currentWorkbench) {
                return;
              }

              void upsertWorkbench({
                ...currentWorkbench,
                name: event.target.value || "\u672a\u547d\u540d\u5de5\u4f5c\u53f0",
              });
            }}
            className="h-8 w-[220px] rounded-lg border-white/10 bg-white/[0.06] px-2.5 text-sm text-zinc-100 placeholder:text-zinc-500"
            placeholder="\u5de5\u4f5c\u53f0\u540d\u79f0"
          />
        ) : (
          <span className="text-sm text-zinc-500">{`\u6682\u65e0\u5de5\u4f5c\u53f0`}</span>
        )}
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const created = await createWorkbench(undefined, { activate: false });
              await navigate({
                to: "/canvas/$workbenchId",
                params: { workbenchId: created.id },
              });
            })();
          }}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-xs text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
        >
          <CirclePlus className="h-3.5 w-3.5" />
          {`\u65b0\u5efa\u5de5\u4f5c\u53f0`}
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
          {`\u5bfc\u51fa`}
        </button>
      </div>
    </div>
  );
}
