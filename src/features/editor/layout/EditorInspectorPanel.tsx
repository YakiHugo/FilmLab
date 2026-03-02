import { cn } from "@/lib/utils";
import { EditorHistogramCard } from "../EditorHistogramCard";
import { EditorInspectorContent } from "../EditorAdjustmentPanel";
import { EDITOR_TOOL_PANELS } from "../editorPanelConfig";
import { useEditorState } from "../useEditorState";

interface EditorInspectorPanelProps {
  className?: string;
}

export function EditorInspectorPanel({ className }: EditorInspectorPanelProps) {
  const { activeToolPanelId } = useEditorState();
  const showHistogram = activeToolPanelId === "edit";
  const panelLabel =
    EDITOR_TOOL_PANELS.find((panel) => panel.id === activeToolPanelId)?.label ?? "Edit";

  return (
    <aside
      className={cn(
        "flex min-h-0 w-full shrink-0 flex-col bg-[#121214] md:w-[360px]",
        className
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-medium text-slate-100">Tools</span>
          <span className="text-slate-500">{panelLabel}</span>
          <span className="h-1 w-1 rounded-full bg-white/70" />
        </div>
      </div>

      {showHistogram ? <EditorHistogramCard /> : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <EditorInspectorContent panelId={activeToolPanelId} />
      </div>
    </aside>
  );
}
