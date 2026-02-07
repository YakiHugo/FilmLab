import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import type { Asset } from "@/types";
import { EditorHistogram } from "./EditorHistogram";

interface EditorSidebarHeaderProps {
  selectedAsset: Asset | null;
  presetLabel: string;
}

export const EditorSidebarHeader = memo(function EditorSidebarHeader({
  selectedAsset,
  presetLabel,
}: EditorSidebarHeaderProps) {
  return (
    <div className="shrink-0 border-b border-white/10 p-4">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="uppercase tracking-[0.24em] text-slate-500">直方图</span>
        {selectedAsset ? (
          <span className="line-clamp-1 text-slate-300">{selectedAsset.name}</span>
        ) : (
          <span className="text-slate-500">未选择</span>
        )}
      </div>
      <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/70 p-3">
        <EditorHistogram asset={selectedAsset} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="secondary">自动</Badge>
        <Badge variant="secondary">黑白</Badge>
        <Badge variant="secondary">HDR</Badge>
        <Badge variant="outline">Luma</Badge>
      </div>
      {selectedAsset && (
        <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300">
          <div className="flex items-center justify-between">
            <span>当前预设</span>
            <span className="text-slate-100">{presetLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>强度</span>
            <span>{selectedAsset.intensity ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>分组</span>
            <span>{selectedAsset.group ?? "未分组"}</span>
          </div>
        </div>
      )}
    </div>
  );
});
