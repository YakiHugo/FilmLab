import { Link } from "@tanstack/react-router";
import { CirclePlus, Images, PanelsTopLeft, PencilLine, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import { getStudioCanvasPreset } from "./studioPresets";

const formatUpdatedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export function CanvasProjectPanel() {
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const createDocument = useCanvasStore((state) => state.createDocument);
  const deleteDocument = useCanvasStore((state) => state.deleteDocument);
  const setActiveDocumentId = useCanvasStore((state) => state.setActiveDocumentId);
  const upsertDocument = useCanvasStore((state) => state.upsertDocument);

  const activeDocument = documents.find((document) => document.id === activeDocumentId) ?? null;
  const boardCount = documents.length;

  const createBoard = () => {
    const nextIndex = documents.length + 1;
    void createDocument(`Board ${String(nextIndex).padStart(2, "0")}`);
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 p-4">
      <section className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">Project Canvas</p>
            <div className="space-y-1">
              <h2 className="font-['Syne'] text-2xl text-stone-100">Canvas-first workspace.</h2>
              <p className="text-sm leading-6 text-stone-400">
                Keep the project centered here. Library feeds source material, image refinement
                stays attached to placed assets, and AI remains contextual.
              </p>
            </div>
          </div>
          <span className="rounded-full border border-amber-300/20 bg-amber-200/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-amber-100/80">
            V1
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-stone-500">Boards</p>
            <p className="mt-2 text-lg font-semibold text-stone-100">{boardCount || 1}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-stone-500">Active Ratio</p>
            <p className="mt-2 text-lg font-semibold text-stone-100">
              {activeDocument ? getStudioCanvasPreset(activeDocument.presetId).shortLabel : "4:5"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-white/10 bg-black/25 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Active Board</p>
            <h3 className="mt-1 font-['Syne'] text-lg text-zinc-100">Name and handoff</h3>
          </div>
          <PencilLine className="h-4 w-4 text-zinc-500" />
        </div>

        {activeDocument ? (
          <div className="mt-4 space-y-3">
            <Input
              value={activeDocument.name}
              onChange={(event) =>
                void upsertDocument({
                  ...activeDocument,
                  name: event.target.value || "Untitled board",
                })
              }
              className="h-10 rounded-2xl border-white/10 bg-black/35 text-sm text-zinc-100"
            />

            <div className="grid grid-cols-2 gap-2 text-xs text-stone-300">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Canvas</p>
                <p className="mt-2 font-medium text-zinc-100">
                  {activeDocument.width} x {activeDocument.height}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Updated</p>
                <p className="mt-2 font-medium text-zinc-100">
                  {formatUpdatedAt(activeDocument.updatedAt)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="secondary" className="rounded-2xl" asChild>
                <Link to="/library">
                  <Images className="mr-2 h-4 w-4" />
                  Open Library
                </Link>
              </Button>
              <Button size="sm" variant="secondary" className="rounded-2xl" asChild>
                <Link to="/assist">
                  <Wand2 className="mr-2 h-4 w-4" />
                  AI Tools
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">
            Create a board to start building the project canvas.
          </p>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-[24px] border border-white/10 bg-black/25 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Boards</p>
            <h3 className="mt-1 font-['Syne'] text-lg text-zinc-100">Switch the working board.</h3>
          </div>
          <PanelsTopLeft className="h-4 w-4 text-zinc-500" />
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {documents.map((document, index) => {
            const preset = getStudioCanvasPreset(document.presetId);
            const active = document.id === activeDocumentId;
            return (
              <button
                key={document.id}
                type="button"
                onClick={() => setActiveDocumentId(document.id)}
                className={cn(
                  "rounded-[22px] border px-3 py-3 text-left transition",
                  active
                    ? "border-amber-300/30 bg-amber-200/10"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {document.name || `Board ${String(index + 1).padStart(2, "0")}`}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {preset.shortLabel} - {document.elements.length} layer
                      {document.elements.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] tracking-[0.24em] text-zinc-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
              </button>
            );
          })}

          {documents.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-zinc-500">
              No boards yet. Start with a portrait board and build outward from there.
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button size="sm" className="rounded-2xl" onClick={createBoard}>
            <CirclePlus className="mr-2 h-4 w-4" />
            New Board
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-2xl text-rose-200 hover:text-rose-100"
            disabled={!activeDocument || documents.length <= 1}
            onClick={() => {
              if (activeDocument) {
                void deleteDocument(activeDocument.id);
              }
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </section>
    </div>
  );
}
