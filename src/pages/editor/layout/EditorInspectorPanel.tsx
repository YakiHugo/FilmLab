import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EditorHistogramCard } from "../EditorHistogramCard";
import { EditorInspectorContent } from "../EditorAdjustmentPanel";
import { EDITOR_TOOL_PANELS } from "../editorPanelConfig";
import { useEditorState } from "../useEditorState";

interface EditorInspectorPanelProps {
  className?: string;
}

export function EditorInspectorPanel({ className }: EditorInspectorPanelProps) {
  const {
    activeToolPanelId,
    mobilePanelExpanded,
    setMobilePanelExpanded,
  } = useEditorState();
  const activePanel = EDITOR_TOOL_PANELS.find((panel) => panel.id === activeToolPanelId);
  const showContent = mobilePanelExpanded;

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col border-t border-white/10 bg-slate-950/90 lg:border-l lg:border-t-0",
        className
      )}
    >
      <div className="shrink-0 border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-slate-100">
              {activePanel?.label ?? "编辑"}
            </p>
            <p className="text-xs text-slate-500">
              {activePanel?.description ?? "参数面板"}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="lg:hidden"
            onClick={() => setMobilePanelExpanded(!mobilePanelExpanded)}
          >
            {mobilePanelExpanded ? (
              <>
                收起
                <ChevronUp className="ml-1 h-4 w-4" />
              </>
            ) : (
              <>
                展开
                <ChevronDown className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>

      <EditorHistogramCard />

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto p-4",
          !showContent && "hidden",
          "lg:block"
        )}
      >
        <EditorInspectorContent panelId={activeToolPanelId} />
      </div>
    </aside>
  );
}
