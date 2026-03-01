import type { ComponentType } from "react";
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
  layout?: "auto" | "horizontal";
}

export function EditorToolRail({ className, layout = "auto" }: EditorToolRailProps) {
  const { activeToolPanelId, setActiveToolPanelId, setMobilePanelExpanded } = useEditorState();
  const isHorizontal = layout === "horizontal";

  return (
    <nav
      aria-label="Editor tool panels"
      className={cn(
        "shrink-0 bg-[#121316] backdrop-blur-sm",
        isHorizontal
          ? "border-b border-white/10 px-2 py-2"
          : "border-y border-white/10 px-2 py-2 lg:h-full lg:border-r lg:border-y-0 lg:px-1 lg:py-3",
        className
      )}
    >
      <div
        className={cn(
          "flex gap-2 overflow-x-auto",
          isHorizontal ? "pb-0.5" : "lg:h-full lg:flex-col lg:overflow-visible"
        )}
      >
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
                "group flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-[#0f1114]/75 px-3 py-2 text-xs text-zinc-300 transition hover:border-white/20 hover:bg-[#161a1f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
                !isHorizontal && "lg:w-full lg:flex-col lg:gap-1 lg:px-1.5 lg:py-2 lg:text-[11px]",
                isHorizontal && "text-[11px]",
                isActive && "border-white/40 bg-white/10 text-white",
                disabled && "cursor-not-allowed border-white/5 text-zinc-500"
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
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive ? "text-white" : "text-zinc-300",
                  disabled && "text-zinc-500"
                )}
              />
              <span className="whitespace-nowrap">{panel.label}</span>
              {disabled && <span className="text-[10px] text-zinc-500 lg:hidden">Soon</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

