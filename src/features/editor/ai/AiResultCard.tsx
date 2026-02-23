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
  exposure: "曝光",
  contrast: "对比度",
  highlights: "高光",
  shadows: "阴影",
  whites: "白色",
  blacks: "黑色",
  temperature: "色温",
  tint: "色调",
  vibrance: "自然饱和度",
  saturation: "饱和度",
  clarity: "清晰度",
  dehaze: "去雾",
  curveHighlights: "曲线高光",
  curveLights: "曲线亮调",
  curveDarks: "曲线暗调",
  curveShadows: "曲线阴影",
  grain: "颗粒",
  grainSize: "颗粒大小",
  grainRoughness: "颗粒粗糙度",
  vignette: "暗角",
  sharpening: "锐化",
  noiseReduction: "降噪",
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
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-2.5">
      <div className="text-xs font-medium text-blue-300">AI 调参结果</div>

      {result.filmProfileId && (
        <div className="text-xs text-slate-300">
          胶片档案: <span className="text-blue-300">{result.filmProfileId}</span>
        </div>
      )}

      {summary.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
          {summary.slice(0, 12).map((line) => (
            <span key={line}>{line}</span>
          ))}
          {summary.length > 12 && <span className="text-slate-500">+{summary.length - 12} 项</span>}
        </div>
      )}

      <div className="flex gap-2">
        {!isPreviewActive ? (
          <button
            type="button"
            onClick={onPreview}
            className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10"
          >
            <Eye className="h-3 w-3" />
            预览
          </button>
        ) : (
          <button
            type="button"
            onClick={onRevert}
            className="flex items-center gap-1 rounded-lg bg-yellow-500/10 px-2.5 py-1.5 text-xs text-yellow-300 transition-colors hover:bg-yellow-500/20"
          >
            <X className="h-3 w-3" />
            撤回预览
          </button>
        )}
        <button
          type="button"
          onClick={onApply}
          className="flex items-center gap-1 rounded-lg bg-blue-600/80 px-2.5 py-1.5 text-xs text-white transition-colors hover:bg-blue-600"
        >
          <Check className="h-3 w-3" />
          应用
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:bg-white/10"
        >
          <X className="h-3 w-3" />
          放弃
        </button>
      </div>
    </div>
  );
});
