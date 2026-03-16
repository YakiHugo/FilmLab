import { Link } from "@tanstack/react-router";
import { LayoutTemplate, Plus, ScissorsLineDashed, Sparkles } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import type { CanvasPresetId } from "@/types";
import {
  applyCanvasPresetToDocument,
  getStudioCanvasPreset,
  STUDIO_CANVAS_PRESETS,
} from "./studioPresets";
import {
  appendCanvasSlice,
  buildStripSlices,
  clearCanvasSlices,
  deleteCanvasSlice,
  updateCanvasSlice,
} from "./slices";

interface CanvasStoryPanelProps {
  selectedSliceId: string | null;
  onSelectSlice: (sliceId: string | null) => void;
}

const toggleClass =
  "h-8 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs text-zinc-300 transition hover:bg-white/[0.08] hover:text-zinc-100";

export function CanvasStoryPanel({ selectedSliceId, onSelectSlice }: CanvasStoryPanelProps) {
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const upsertDocument = useCanvasStore((state) => state.upsertDocument);

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [documents, activeDocumentId]
  );

  const orderedSlices = useMemo(
    () => activeDocument?.slices.slice().sort((left, right) => left.order - right.order) ?? [],
    [activeDocument?.slices]
  );

  const selectedSlice =
    orderedSlices.find((slice) => slice.id === selectedSliceId) ?? orderedSlices[0] ?? null;
  const currentPreset = getStudioCanvasPreset(activeDocument?.presetId);

  useEffect(() => {
    if (!selectedSliceId && orderedSlices[0]) {
      onSelectSlice(orderedSlices[0].id);
      return;
    }
    if (selectedSliceId && !orderedSlices.some((slice) => slice.id === selectedSliceId)) {
      onSelectSlice(orderedSlices[0]?.id ?? null);
    }
  }, [onSelectSlice, orderedSlices, selectedSliceId]);

  if (!activeDocument) {
    return null;
  }

  const commitDocument = (nextDocument: typeof activeDocument) => {
    void upsertDocument(nextDocument);
  };

  const updateGuide = (key: keyof typeof activeDocument.guides, value: boolean) => {
    commitDocument({
      ...activeDocument,
      guides: {
        ...activeDocument.guides,
        [key]: value,
      },
    });
  };

  const updateSafeArea = (
    key: keyof typeof activeDocument.safeArea,
    rawValue: string
  ) => {
    const nextValue = Math.max(0, Number(rawValue) || 0);
    commitDocument({
      ...activeDocument,
      safeArea: {
        ...activeDocument.safeArea,
        [key]: nextValue,
      },
    });
  };

  const updateSelectedSlice = (patch: Parameters<typeof updateCanvasSlice>[2]) => {
    if (!selectedSlice) {
      return;
    }
    commitDocument(updateCanvasSlice(activeDocument, selectedSlice.id, patch));
  };

  const applyPreset = (presetId: CanvasPresetId) => {
    commitDocument(applyCanvasPresetToDocument(activeDocument, presetId));
  };

  return (
    <aside className="space-y-3">
      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(252,247,240,0.08),rgba(23,20,17,0.68))] p-4 shadow-[0_24px_60px_-36px_rgba(0,0,0,0.85)]">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.28em] text-amber-100/55">Story Setup</p>
            <h2 className="font-['Syne'] text-xl text-stone-100">Build for the feed, not the editor.</h2>
            <p className="max-w-sm text-sm leading-6 text-stone-300/80">
              Start with a social format, arrange freely, then slice the board into a carousel when
              you are ready to export.
            </p>
          </div>
          <Link
            to="/assist"
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs text-stone-200 transition hover:bg-white/[0.1]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI Assist
          </Link>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {STUDIO_CANVAS_PRESETS.map((preset) => {
            const active = activeDocument.presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={cn(
                  "rounded-2xl border px-3 py-3 text-left transition",
                  active
                    ? "border-amber-300/35 bg-amber-200/10 text-stone-100"
                    : "border-white/10 bg-black/20 text-stone-300 hover:bg-white/[0.05]"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{preset.label}</p>
                    <p className="mt-1 text-xs text-stone-400">{preset.description}</p>
                  </div>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] tracking-[0.22em] text-stone-300">
                    {preset.shortLabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-stone-400">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Board</p>
            <p className="mt-2 text-base font-medium text-stone-100">
              {activeDocument.width} × {activeDocument.height}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Slices</p>
            <p className="mt-2 text-base font-medium text-stone-100">
              {orderedSlices.length > 0 ? orderedSlices.length : "Whole"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-white/10 bg-black/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Slice Builder</p>
            <h3 className="mt-1 font-['Syne'] text-lg text-zinc-100">Turn one board into a set.</h3>
          </div>
          <ScissorsLineDashed className="h-4 w-4 text-amber-200/80" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            className={toggleClass}
            onClick={() => {
              onSelectSlice(null);
              commitDocument(clearCanvasSlices(activeDocument));
            }}
          >
            Single
          </Button>
          {[2, 3, 4].map((count) => (
            <Button
              key={count}
              size="sm"
              variant="secondary"
              className={toggleClass}
              onClick={() => {
                const nextDocument = buildStripSlices(activeDocument, count);
                onSelectSlice(nextDocument.slices[0]?.id ?? null);
                commitDocument(nextDocument);
              }}
            >
              {count} Slides
            </Button>
          ))}
          <Button
            size="sm"
            variant="secondary"
            className={toggleClass}
            onClick={() => {
              const nextDocument = appendCanvasSlice(activeDocument);
              onSelectSlice(nextDocument.slices[nextDocument.slices.length - 1]?.id ?? null);
              commitDocument(nextDocument);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Slide
          </Button>
        </div>

        {orderedSlices.length > 0 ? (
          <div className="mt-4 space-y-2">
            {orderedSlices.map((slice) => {
              const active = slice.id === selectedSlice?.id;
              return (
                <button
                  key={slice.id}
                  type="button"
                  onClick={() => onSelectSlice(slice.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition",
                    active
                      ? "border-amber-300/35 bg-amber-100/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  )}
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{slice.name}</p>
                    <p className="text-xs text-zinc-500">
                      {slice.width} × {slice.height} at {slice.x}, {slice.y}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] tracking-[0.24em] text-zinc-400">
                    {String(slice.order).padStart(2, "0")}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-zinc-500">
            Export the full board as a single post, or split it into slides when you want a carousel.
          </div>
        )}

        {selectedSlice ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-zinc-100">Selected slice</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-xl px-2 text-xs text-rose-300 hover:text-rose-200"
                onClick={() => {
                  const nextDocument = deleteCanvasSlice(activeDocument, selectedSlice.id);
                  onSelectSlice(nextDocument.slices[0]?.id ?? null);
                  commitDocument(nextDocument);
                }}
              >
                Remove
              </Button>
            </div>

            <Input
              value={selectedSlice.name}
              onChange={(event) => updateSelectedSlice({ name: event.target.value })}
              className="h-9 rounded-xl border-white/10 bg-black/35 text-sm"
            />

            <div className="grid grid-cols-2 gap-2">
              {([
                ["x", selectedSlice.x],
                ["y", selectedSlice.y],
                ["width", selectedSlice.width],
                ["height", selectedSlice.height],
              ] as const).map(([key, value]) => (
                <label key={key} className="space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                    {key}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={Math.round(value)}
                    onChange={(event) =>
                      updateSelectedSlice({
                        [key]: Math.max(key === "x" || key === "y" ? 0 : 1, Number(event.target.value) || 0),
                      })
                    }
                    className="h-9 rounded-xl border-white/10 bg-black/35 text-sm"
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-[24px] border border-white/10 bg-black/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Guides</p>
            <h3 className="mt-1 font-['Syne'] text-lg text-zinc-100">Keep the layout calm.</h3>
          </div>
          <LayoutTemplate className="h-4 w-4 text-zinc-400" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            className={cn(toggleClass, activeDocument.guides.showThirds && "border-amber-300/35 bg-amber-100/10 text-zinc-100")}
            onClick={() => updateGuide("showThirds", !activeDocument.guides.showThirds)}
          >
            Thirds
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className={cn(toggleClass, activeDocument.guides.showCenter && "border-amber-300/35 bg-amber-100/10 text-zinc-100")}
            onClick={() => updateGuide("showCenter", !activeDocument.guides.showCenter)}
          >
            Center
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className={cn(toggleClass, activeDocument.guides.showSafeArea && "border-amber-300/35 bg-amber-100/10 text-zinc-100")}
            onClick={() => updateGuide("showSafeArea", !activeDocument.guides.showSafeArea)}
          >
            Safe Area
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(["top", "right", "bottom", "left"] as const).map((key) => (
            <label key={key} className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                {key}
              </span>
              <Input
                type="number"
                min={0}
                value={activeDocument.safeArea[key]}
                onChange={(event) => updateSafeArea(key, event.target.value)}
                className="h-9 rounded-xl border-white/10 bg-black/35 text-sm"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-zinc-400">
          Current canvas preset: <span className="text-zinc-100">{currentPreset.label}</span>. Use
          guides for spacing, then export the whole board or each slice in order.
        </div>
      </section>
    </aside>
  );
}
