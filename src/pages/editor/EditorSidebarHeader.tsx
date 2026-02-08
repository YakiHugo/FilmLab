import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/stores/editorStore";
import { EditorHistogram } from "./EditorHistogram";
import { useEditorState } from "./useEditorState";

export const EditorSidebarHeader = memo(function EditorSidebarHeader() {
  const { selectedAsset, presetLabel, filmProfileLabel, showOriginal, toggleOriginal } =
    useEditorState();
  const histogram = useEditorStore((state) => state.previewHistogram);

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
        <EditorHistogram histogram={histogram} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge size="control" variant={showOriginal ? "default" : "secondary"}>
          {showOriginal ? "当前：原图" : "当前：调整后"}
        </Badge>
        <Badge size="control" variant="secondary">直方图：RGB</Badge>
        <Button
          size="sm"
          variant={showOriginal ? "default" : "secondary"}
          aria-pressed={showOriginal}
          disabled={!selectedAsset}
          onClick={toggleOriginal}
        >
          对比原图
        </Button>
      </div>
      {selectedAsset && (
        <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-xs text-slate-300">
          <div className="flex items-center justify-between">
            <span>当前预设</span>
            <span className="text-slate-100">{presetLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>胶片档案</span>
            <span className="text-slate-100">{filmProfileLabel}</span>
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
