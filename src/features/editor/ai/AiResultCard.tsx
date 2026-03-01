import { memo } from "react";
import { Check, Eye, X } from "lucide-react";
import type { AiPendingResult } from "./useAiEditSession";

interface AiResultCardProps {
  result: AiPendingResult;
  isPreviewActive: boolean;
  onApply: () => void;
  onPreview: () => void;
  onRevert: () => void;
  onDismiss: () => void;
}

const PARAM_LABELS: Record<string, string> = {
  exposure: "Exposure",
  contrast: "Contrast",
  highlights: "Highlights",
  shadows: "Shadows",
  whites: "Whites",
  blacks: "Blacks",
  temperature: "Temperature",
  tint: "Tint",
  vibrance: "Vibrance",
  saturation: "Saturation",
  clarity: "Clarity",
  dehaze: "Dehaze",
  curveHighlights: "Curve Highlights",
  curveLights: "Curve Lights",
  curveDarks: "Curve Darks",
  curveShadows: "Curve Shadows",
  grain: "Grain",
  grainSize: "Grain Size",
  grainRoughness: "Grain Roughness",
  vignette: "Vignette",
  sharpening: "Sharpening",
  noiseReduction: "Noise Reduction",
};

function summarizeAdjustments(adj: AiPendingResult["adjustments"]): string[] {
  const lines: string[] = [];
  const keys = Object.keys(PARAM_LABELS) as Array<keyof typeof PARAM_LABELS>;
  for (const key of keys) {
    const val = (adj as unknown as Record<string, number>)[key];
    if (
      val !== undefined &&
      val !== 0 &&
      !(key === "grainSize" && val === 50) &&
      !(key === "grainRoughness" && val === 50)
    ) {
      const sign = val > 0 ? "+" : "";
      lines.push(`${PARAM_LABELS[key]}: ${sign}${val}`);
    }
  }
  return lines;
}

export const AiResultCard = memo(function AiResultCard({
  result,
  isPreviewActive,
  onApply,
  onPreview,
  onRevert,
  onDismiss,
}: AiResultCardProps) {
  const summary = summarizeAdjustments(result.adjustments);

  return (
    <div className="space-y-2.5 rounded-xl border border-white/20 bg-white/5 p-3">
      <div className="text-xs font-medium text-white">AI adjustment result</div>

      {result.filmProfileId && (
        <div className="text-xs text-zinc-300">
          Film profile: <span className="text-white">{result.filmProfileId}</span>
        </div>
      )}

      {summary.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
          {summary.slice(0, 12).map((line) => (
            <span key={line}>{line}</span>
          ))}
          {summary.length > 12 && <span className="text-zinc-500">+{summary.length - 12} more</span>}
        </div>
      )}

      <div className="flex gap-2">
        {!isPreviewActive ? (
          <button
            type="button"
            onClick={onPreview}
            className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-white/10"
          >
            <Eye className="h-3 w-3" />
            Preview
          </button>
        ) : (
          <button
            type="button"
            onClick={onRevert}
            className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-white/15"
          >
            <X className="h-3 w-3" />
            Revert Preview
          </button>
        )}
        <button
          type="button"
          onClick={onApply}
          className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs text-zinc-900 transition-colors hover:bg-zinc-100"
        >
          <Check className="h-3 w-3" />
          Apply
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/10"
        >
          <X className="h-3 w-3" />
          Dismiss
        </button>
      </div>
    </div>
  );
});
