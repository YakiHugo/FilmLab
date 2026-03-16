import { Frame, LayoutTemplate, ScissorsLineDashed, Shield } from "lucide-react";
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

const actionChipClass =
  "h-9 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-xs text-zinc-300 transition hover:bg-white/[0.08] hover:text-zinc-100";

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

  const updateSafeArea = (key: keyof typeof activeDocument.safeArea, rawValue: string) => {
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
    <div className="space-y-3 p-4">
      <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,20,0.96),rgba(10,10,11,0.94))] p-4 shadow-[0_30px_90px_-48px_rgba(0,0,0,0.95)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Board Format</p>
            <h2 className="mt-1 font-['Syne'] text-xl text-zinc-100">Choose the feed frame first.</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Set the social ratio before layering so export boundaries stay predictable.
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
            <Frame className="h-4 w-4 text-zinc-400" />
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {STUDIO_CANVAS_PRESETS.map((preset) => {
            const active = activeDocument.presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={cn(
                  "rounded-[22px] border px-3 py-3 text-left transition",
                  active
                    ? "border-amber-300/30 bg-amber-200/10 text-zinc-100"
                    : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{preset.label}</p>
                    <p className="mt-1 text-xs text-zinc-500">{preset.description}</p>
                  </div>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] tracking-[0.22em] text-zinc-400">
                    {preset.shortLabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-zinc-300">
          <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Canvas</p>
            <p className="mt-2 font-medium text-zinc-100">
              {activeDocument.width} x {activeDocument.height}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Layers</p>
            <p className="mt-2 font-medium text-zinc-100">{activeDocument.elements.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Current</p>
            <p className="mt-2 font-medium text-zinc-100">{currentPreset.shortLabel}</p>
          </div>
        </div>
      </section>

      <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,20,0.96),rgba(10,10,11,0.94))] p-4 shadow-[0_30px_90px_-48px_rgba(0,0,0,0.95)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Export Sequence</p>
            <h3 className="mt-1 font-['Syne'] text-xl text-zinc-100">Split one board into deliverables.</h3>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
            <ScissorsLineDashed className="h-4 w-4 text-zinc-400" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            className={actionChipClass}
            onClick={() => {
              onSelectSlice(null);
              commitDocument(clearCanvasSlices(activeDocument));
            }}
          >
            Single Frame
          </Button>
          {[2, 3, 4].map((count) => (
            <Button
              key={count}
              size="sm"
              variant="secondary"
              className={actionChipClass}
              onClick={() => {
                const nextDocument = buildStripSlices(activeDocument, count);
                onSelectSlice(nextDocument.slices[0]?.id ?? null);
                commitDocument(nextDocument);
              }}
            >
              {count} Frames
            </Button>
          ))}
          <Button
            size="sm"
            variant="secondary"
            className={actionChipClass}
            onClick={() => {
              const nextDocument = appendCanvasSlice(activeDocument);
              onSelectSlice(nextDocument.slices[nextDocument.slices.length - 1]?.id ?? null);
              commitDocument(nextDocument);
            }}
          >
            Add Frame
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
                    "flex w-full items-center justify-between rounded-[22px] border px-3 py-3 text-left transition",
                    active
                      ? "border-amber-300/30 bg-amber-200/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  )}
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{slice.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {slice.width} x {slice.height} at {slice.x}, {slice.y}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] tracking-[0.22em] text-zinc-400">
                    {String(slice.order).padStart(2, "0")}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-zinc-500">
            Export the full board as a single post, or split it when a carousel or grid sequence is
            needed.
          </div>
        )}

        {selectedSlice ? (
          <div className="mt-4 space-y-3 rounded-[24px] border border-white/10 bg-black/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-zinc-100">Selected frame</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-2xl px-2 text-xs text-rose-300 hover:text-rose-200"
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
              className="h-10 rounded-2xl border-white/10 bg-black/35 text-sm"
            />

            <div className="grid grid-cols-2 gap-3">
              {([
                ["x", selectedSlice.x],
                ["y", selectedSlice.y],
                ["width", selectedSlice.width],
                ["height", selectedSlice.height],
              ] as const).map(([key, value]) => (
                <label key={key} className="space-y-1.5">
                  <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{key}</span>
                  <Input
                    type="number"
                    min={0}
                    value={Math.round(value)}
                    onChange={(event) =>
                      updateSelectedSlice({
                        [key]: Math.max(
                          key === "x" || key === "y" ? 0 : 1,
                          Number(event.target.value) || 0
                        ),
                      })
                    }
                    className="h-10 rounded-2xl border-white/10 bg-black/35 text-sm"
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,20,0.96),rgba(10,10,11,0.94))] p-4 shadow-[0_30px_90px_-48px_rgba(0,0,0,0.95)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Guides & Safe Area</p>
            <h3 className="mt-1 font-['Syne'] text-xl text-zinc-100">Guard the social crop.</h3>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
            <LayoutTemplate className="h-4 w-4 text-zinc-400" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            className={cn(actionChipClass, activeDocument.guides.showThirds && "border-amber-300/30 bg-amber-200/10 text-zinc-100")}
            onClick={() => updateGuide("showThirds", !activeDocument.guides.showThirds)}
          >
            Thirds
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className={cn(actionChipClass, activeDocument.guides.showCenter && "border-amber-300/30 bg-amber-200/10 text-zinc-100")}
            onClick={() => updateGuide("showCenter", !activeDocument.guides.showCenter)}
          >
            Center
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className={cn(actionChipClass, activeDocument.guides.showSafeArea && "border-amber-300/30 bg-amber-200/10 text-zinc-100")}
            onClick={() => updateGuide("showSafeArea", !activeDocument.guides.showSafeArea)}
          >
            Safe Area
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {(["top", "right", "bottom", "left"] as const).map((key) => (
            <label key={key} className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{key}</span>
              <Input
                type="number"
                min={0}
                value={activeDocument.safeArea[key]}
                onChange={(event) => updateSafeArea(key, event.target.value)}
                className="h-10 rounded-2xl border-white/10 bg-black/35 text-sm"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-zinc-400">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-200/70" />
          <p>
            Keep type and focal subjects inside the safe area. It makes multi-frame export much more
            resilient across feed crop differences.
          </p>
        </div>
      </section>
    </div>
  );
}
