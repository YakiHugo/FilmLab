import { memo, useCallback } from "react";
import { RotateCcw, Settings2 } from "lucide-react";
import type { EditingAdjustments, Asset } from "@/types";
import type { HistogramSummary } from "@/lib/ai/colorAnalysis";
import { useAiEditSession } from "./useAiEditSession";
import { AiChatThread } from "./AiChatThread";
import { AiChatInput } from "./AiChatInput";
import { AiStyleChips } from "./AiStyleChips";
import { AiModelSelector } from "./AiModelSelector";
import { AiReferenceImagePicker } from "./AiReferenceImagePicker";
import { useState } from "react";

interface AiEditPanelProps {
  selectedAsset: Asset | null;
  adjustments: EditingAdjustments | null;
  histogramSummary?: HistogramSummary;
  onUpdateAdjustments: (partial: Partial<EditingAdjustments>) => void;
  onSelectFilmProfile: (filmProfileId: string | undefined) => void;
}

export const AiEditPanel = memo(function AiEditPanel({
  selectedAsset,
  adjustments,
  histogramSummary,
  onUpdateAdjustments,
  onSelectFilmProfile,
}: AiEditPanelProps) {
  const [showSettings, setShowSettings] = useState(false);

  const session = useAiEditSession({
    selectedAsset,
    adjustments,
    histogramSummary,
    onApply: onUpdateAdjustments,
    onApplyFilmProfile: onSelectFilmProfile,
  });

  const handleStyleSelect = useCallback(
    (prompt: string) => {
      session.sendMessage(prompt);
    },
    [session]
  );

  if (!selectedAsset) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-center text-xs text-slate-400">
        请先在工作区选择一张图片
      </div>
    );
  }

  return (
    <div className="flex h-[520px] flex-col rounded-2xl border border-white/10 bg-slate-950/80">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <span className="text-xs font-medium text-slate-300">AI 修图</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => session.clearChat()}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
            title="清空对话"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className={`rounded-md p-1 transition-colors hover:bg-white/5 ${
              showSettings ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
            }`}
            title="设置"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Settings drawer */}
      {showSettings && (
        <div className="space-y-2.5 border-b border-white/5 px-3 py-2.5">
          <div className="space-y-1">
            <label className="text-[11px] text-slate-500">模型</label>
            <AiModelSelector
              value={session.selectedModel}
              onChange={session.setSelectedModel}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-slate-500">参考图 (追色)</label>
            <AiReferenceImagePicker
              images={session.referenceImages}
              onAdd={session.addReferenceImage}
              onRemove={session.removeReferenceImage}
              disabled={session.isLoading}
            />
          </div>
        </div>
      )}

      {/* Style chips (only when no messages) */}
      {session.messages.length === 0 && (
        <div className="border-b border-white/5 px-3 py-2.5">
          <AiStyleChips onSelect={handleStyleSelect} disabled={session.isLoading} />
        </div>
      )}

      {/* Chat thread */}
      <AiChatThread
        messages={session.messages}
        isLoading={session.isLoading}
        pendingResult={session.pendingResult}
        isPreviewActive={session.isPreviewActive}
        onApply={session.applyResult}
        onPreview={session.previewResult}
        onRevert={session.revertPreview}
        onDismiss={session.dismissResult}
      />

      {/* Input */}
      <div className="border-t border-white/5 p-2">
        <AiChatInput
          value={session.input}
          onChange={session.setInput}
          onSend={session.sendMessage}
          onStop={session.stop}
          isLoading={session.isLoading}
        />
      </div>
    </div>
  );
});
