import { cn } from "@/lib/utils";
import { EditorHistogramCard } from "../EditorHistogramCard";
import { EditorInspectorContent } from "../EditorAdjustmentPanel";
import { useEditorState } from "../useEditorState";

interface EditorInspectorPanelProps {
  className?: string;
}

export function EditorInspectorPanel({ className }: EditorInspectorPanelProps) {
  const { activeToolPanelId } = useEditorState();

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col border-t border-white/10 bg-slate-950/90 lg:border-l lg:border-t-0",
        className
      )}
    >
      <EditorHistogramCard />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <EditorInspectorContent panelId={activeToolPanelId} />
      </div>
    </aside>
  );
}
