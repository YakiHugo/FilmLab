import { type ComponentType } from "react";
import { Bot, Crop, Download, Eraser, Layers, SlidersHorizontal, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EDITOR_TOOL_PANELS, type EditorToolPanelId } from "../editorPanelConfig";
import { useEditorState } from "../useEditorState";

const ICON_BY_PANEL: Record<EditorToolPanelId, ComponentType<{ className?: string }>> = {
  preset: Layers,
  edit: SlidersHorizontal,
  crop: Crop,
  mask: Wand2,
  remove: Eraser,
  export: Download,
  ai: Bot,
};

interface EditorToolRailProps {
  className?: string;
}

export function EditorToolRail({ className }: EditorToolRailProps) {
  const { activeToolPanelId, setActiveToolPanelId, setMobilePanelExpanded } = useEditorState();

  return (
    <nav
      aria-label="Editor tools"
      className={cn(
        "relative flex h-full w-12 shrink-0 flex-col bg-[#121214]",
        className
      )}
    >
      <div className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto px-1.5 py-2">
        {EDITOR_TOOL_PANELS.map((panel) => {
          const Icon = ICON_BY_PANEL[panel.id] ?? Layers;
          const isActive = panel.id === activeToolPanelId;
          const disabled = Boolean(panel.disabled);

          return (
            <button
              key={panel.id}
              type="button"
              aria-pressed={isActive}
              aria-label={panel.label}
              disabled={disabled}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#0f1114] text-zinc-300 transition hover:border-white/20 hover:bg-[#161a1f]",
                isActive && "border-white/40 bg-white/10 text-white",
                disabled && "cursor-not-allowed border-white/5 text-zinc-600"
              )}
              title={disabled ? `${panel.label} (coming soon)` : panel.description}
              onClick={() => {
                if (disabled) {
                  return;
                }
                setActiveToolPanelId(panel.id);
                setMobilePanelExpanded(true);
              }}
            >
              <Icon className={cn("h-4 w-4", disabled && "text-zinc-600")} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
