import { Link } from "@tanstack/react-router";
import { ArrowUpRight, RotateCw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EditorSliderRow } from "@/features/editor/EditorSliderRow";
import {
  useEditorAdjustmentActions,
  useEditorAdjustmentState,
  useEditorPresetActions,
  useEditorPresetState,
  useEditorSelectionState,
} from "@/features/editor/useEditorSlices";

const QUICK_RATIO_OPTIONS = [
  { id: "original", label: "Original" },
  { id: "1:1", label: "1:1" },
  { id: "4:5", label: "4:5" },
  { id: "9:16", label: "9:16" },
] as const;

const quickSliderClass =
  "rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4";

export function QuickAdjustPanel() {
  const { selectedAsset, selectedAssetId } = useEditorSelectionState();
  const { adjustments } = useEditorAdjustmentState();
  const { builtInFilmProfiles, filmProfileLabel } = useEditorPresetState();
  const {
    updateAdjustments,
    previewAdjustmentValue,
    updateAdjustmentValue,
  } = useEditorAdjustmentActions();
  const { handleResetAll, handleSelectFilmProfile, handleSetIntensity } = useEditorPresetActions();

  const quickProfiles = builtInFilmProfiles.slice(0, 6);
  const styleStrength = selectedAsset?.intensity ?? 100;

  if (!selectedAsset || !adjustments) {
    return null;
  }

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col bg-[#121214] pl-5 md:w-[360px]">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(252,247,240,0.08),rgba(23,20,17,0.66))] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">Quick Adjust</p>
              <h2 className="mt-1 font-['Syne'] text-xl text-stone-100">Keep the mood, skip the lab.</h2>
            </div>
            <SlidersHorizontal className="h-4 w-4 text-amber-200/80" />
          </div>
          <p className="mt-3 text-sm leading-6 text-stone-300/80">
            Default editing is intentionally light. Reach for atmosphere, balance, and crop first.
          </p>

          <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Current Mood</p>
              <p className="mt-1 text-sm text-stone-100">{filmProfileLabel || "Natural"}</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-xl px-2 text-xs text-stone-300 hover:text-stone-100"
              onClick={() => handleResetAll()}
            >
              Reset
            </Button>
          </div>
        </section>

        <section className={quickSliderClass}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Looks</p>
              <h3 className="mt-1 font-['Syne'] text-lg text-zinc-100">Choose a feeling.</h3>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {quickProfiles.map((profile) => {
              const active = profile.name === filmProfileLabel;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => handleSelectFilmProfile(profile.id)}
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-left transition",
                    active
                      ? "border-amber-300/35 bg-amber-100/10 text-zinc-100"
                      : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]"
                  )}
                >
                  <p className="text-sm font-medium">{profile.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">{profile.description || "Signature mood preset."}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <EditorSliderRow
              label="Style Strength"
              value={styleStrength}
              min={0}
              max={100}
              onChange={handleSetIntensity}
              onCommit={handleSetIntensity}
            />
          </div>
        </section>

        <section className={quickSliderClass}>
          <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Tone</p>
          <div className="mt-4 space-y-4">
            <EditorSliderRow
              label="Exposure"
              value={adjustments.exposure}
              min={-100}
              max={100}
              onChange={(value) => previewAdjustmentValue("exposure", value)}
              onCommit={(value) => updateAdjustmentValue("exposure", value)}
            />
            <EditorSliderRow
              label="Contrast"
              value={adjustments.contrast}
              min={-100}
              max={100}
              onChange={(value) => previewAdjustmentValue("contrast", value)}
              onCommit={(value) => updateAdjustmentValue("contrast", value)}
            />
            <EditorSliderRow
              label="Highlights"
              value={adjustments.highlights}
              min={-100}
              max={100}
              onChange={(value) => previewAdjustmentValue("highlights", value)}
              onCommit={(value) => updateAdjustmentValue("highlights", value)}
            />
            <EditorSliderRow
              label="Shadows"
              value={adjustments.shadows}
              min={-100}
              max={100}
              onChange={(value) => previewAdjustmentValue("shadows", value)}
              onCommit={(value) => updateAdjustmentValue("shadows", value)}
            />
          </div>
        </section>

        <section className={quickSliderClass}>
          <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Mood Controls</p>
          <div className="mt-4 space-y-4">
            <EditorSliderRow
              label="Warmth"
              value={adjustments.temperature}
              min={-100}
              max={100}
              onChange={(value) => previewAdjustmentValue("temperature", value)}
              onCommit={(value) => updateAdjustmentValue("temperature", value)}
            />
            <EditorSliderRow
              label="Saturation"
              value={adjustments.saturation}
              min={-100}
              max={100}
              onChange={(value) => previewAdjustmentValue("saturation", value)}
              onCommit={(value) => updateAdjustmentValue("saturation", value)}
            />
            <EditorSliderRow
              label="Fade"
              value={adjustments.blacks * -1}
              min={-100}
              max={100}
              onChange={(value) => previewAdjustmentValue("blacks", value * -1)}
              onCommit={(value) => updateAdjustmentValue("blacks", value * -1)}
            />
            <EditorSliderRow
              label="Grain"
              value={adjustments.grain}
              min={0}
              max={100}
              onChange={(value) => previewAdjustmentValue("grain", value)}
              onCommit={(value) => updateAdjustmentValue("grain", value)}
            />
            <EditorSliderRow
              label="Vignette"
              value={adjustments.vignette}
              min={-100}
              max={100}
              onChange={(value) => previewAdjustmentValue("vignette", value)}
              onCommit={(value) => updateAdjustmentValue("vignette", value)}
            />
          </div>
        </section>

        <section className={quickSliderClass}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Crop</p>
              <h3 className="mt-1 font-['Syne'] text-lg text-zinc-100">Frame for the platform.</h3>
            </div>
            <RotateCw className="h-4 w-4 text-zinc-400" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK_RATIO_OPTIONS.map((ratio) => (
              <button
                key={ratio.id}
                type="button"
                onClick={() => updateAdjustments({ aspectRatio: ratio.id })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition",
                  adjustments.aspectRatio === ratio.id
                    ? "border-amber-300/35 bg-amber-100/10 text-zinc-100"
                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]"
                )}
              >
                {ratio.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <EditorSliderRow
              label="Rotate"
              value={adjustments.rotate}
              min={-45}
              max={45}
              step={0.1}
              onChange={(value) => previewAdjustmentValue("rotate", value)}
              onCommit={(value) => updateAdjustmentValue("rotate", value)}
            />
          </div>
        </section>

        <section className="rounded-[26px] border border-dashed border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Advanced</p>
              <p className="mt-1 text-sm leading-6 text-zinc-400">
                Curves, HSL, local adjustments, and analysis tools still exist, but they are not part
                of the default editing path anymore.
              </p>
            </div>
            <Button asChild size="sm" variant="secondary" className="rounded-xl border border-white/10 bg-black/35">
              <Link
                to="/editor"
                search={{
                  assetId: selectedAssetId ?? undefined,
                  mode: "advanced",
                }}
              >
                Open Advanced
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </aside>
  );
}
