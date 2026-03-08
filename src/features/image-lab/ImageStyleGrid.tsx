import { Loader2 } from "lucide-react";
import type { ImageStylePreset } from "@/lib/ai/imageStylePresets";
import { ImageResultCard } from "./ImageResultCard";

interface ImageStyleGridProps {
  presets: ImageStylePreset[];
  selectedPresetId: string | null;
  status: "idle" | "loading" | "done" | "error";
  error: string | null;
  results: Array<{
    imageUrl: string;
    provider: string;
    model: string;
    assetId: string | null;
    selected: boolean;
    saved: boolean;
    index: number;
  }>;
  isSavingSelection: boolean;
  onSelectPreset: (preset: ImageStylePreset) => void;
  onToggleResultSelection: (index: number) => void;
  onSaveSelectedResults: () => void;
  onAddToCanvas: (assetId: string | null) => void;
}

export function ImageStyleGrid({
  presets,
  selectedPresetId,
  status,
  error,
  results,
  isSavingSelection,
  onSelectPreset,
  onToggleResultSelection,
  onSaveSelectedResults,
  onAddToCanvas,
}: ImageStyleGridProps) {
  const hasSelectedUnsavedResults = results.some((entry) => entry.selected && !entry.saved);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_40%),radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_45%),#0a0d14] p-4 sm:p-6">
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 sm:text-5xl">
          为图片选择风格
        </h2>
        <p className="mt-2 max-w-xl text-sm text-zinc-400">
          先选一个视觉基调，再在底部输入你想生成的场景、人物和镜头语言。
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:grid-cols-3 lg:grid-cols-4">
          {presets.map((preset) => {
            const selected = selectedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset)}
                className={[
                  "group relative overflow-hidden rounded-3xl border text-left transition duration-300",
                  selected
                    ? "border-amber-300 shadow-[0_0_0_2px_rgba(251,191,36,0.35)]"
                    : "border-white/15 hover:border-white/35",
                ].join(" ")}
              >
                <img
                  src={preset.previewUrl}
                  alt={preset.title}
                  className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 py-2">
                  <p className="text-lg font-semibold text-white">{preset.title}</p>
                </div>
                {selected && (
                  <div className="absolute right-2 top-2 rounded-full bg-amber-300 px-2 py-0.5 text-[11px] font-semibold text-zinc-950">
                    已选
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {status === "loading" && (
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-sm text-zinc-100">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在生成图片...
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-rose-300/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        )}

        {results.length > 0 && (
          <div className="mt-8 space-y-3">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/15 px-4 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isSavingSelection || !hasSelectedUnsavedResults}
              onClick={onSaveSelectedResults}
            >
              {isSavingSelection ? "Saving..." : "Save Selected to Library"}
            </button>
            <p className="text-lg font-medium text-zinc-200">最新生成</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((entry, index) => (
                <ImageResultCard
                  key={`${entry.imageUrl}-${index}`}
                  imageUrl={entry.imageUrl}
                  provider={entry.provider}
                  model={entry.model}
                  assetId={entry.assetId}
                  selected={entry.selected}
                  saved={entry.saved}
                  onToggleSelection={() => onToggleResultSelection(entry.index)}
                  onAddToCanvas={() => onAddToCanvas(entry.assetId)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
