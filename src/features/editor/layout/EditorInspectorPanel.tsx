import { cn } from "@/lib/utils";
import { EditorHistogramCard } from "../EditorHistogramCard";
import { EditorInspectorContent } from "../EditorAdjustmentPanel";
import { EditorToolRail } from "./EditorToolRail";
import { useEditorState } from "../useEditorState";

interface EditorInspectorPanelProps {
  className?: string;
}

export function EditorInspectorPanel({ className }: EditorInspectorPanelProps) {
  const { activeToolPanelId } = useEditorState();
  const showHistogram = activeToolPanelId === "edit";

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col border-t border-white/10 bg-[#121316] lg:border-l lg:border-t-0",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-medium text-slate-100">Tools</span>
          <span className="text-slate-500">Edits</span>
          <span className="h-1 w-1 rounded-full bg-white/70" />
        </div>
      </div>

      <EditorToolRail layout="horizontal" />

      {showHistogram ? <EditorHistogramCard /> : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <EditorInspectorContent panelId={activeToolPanelId} />
      </div>
    </aside>
  );
}
