import type { ComponentType } from "react";
import {
  Aperture,
  Bot,
  Crop,
  Download,
  Droplets,
  Layers,
  Sparkles,
  SunMedium,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EDITOR_TOOL_PANELS,
  type EditorToolPanelId,
} from "../editorPanelConfig";
import { useEditorState } from "../useEditorState";

const ICON_BY_PANEL: Record<EditorToolPanelId, ComponentType<{ className?: string }>> = {
  preset: Layers,
  light: SunMedium,
  color: Droplets,
  effects: Sparkles,
  detail: Aperture,
  geometry: Crop,
  local: Wand2,
  ai: Bot,
  export: Download,
};

interface EditorToolRailProps {
  className?: string;
}

export function EditorToolRail({ className }: EditorToolRailProps) {
  const {
    activeToolPanelId,
    setActiveToolPanelId,
    setMobilePanelExpanded,
  } = useEditorState();

  return (
    <nav
      aria-label="编辑工具面板"
      className={cn(
        "shrink-0 border-y border-white/10 bg-slate-950/80 px-2 py-2 backdrop-blur-sm lg:h-full lg:border-l lg:border-y-0 lg:px-1 lg:py-3",
        className
      )}
    >
      <div className="flex gap-2 overflow-x-auto lg:h-full lg:flex-col lg:overflow-visible">
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
                "group flex shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/40 lg:w-full lg:flex-col lg:gap-1 lg:px-1.5 lg:py-2 lg:text-[11px]",
                isActive && "border-sky-300/50 bg-sky-300/15 text-sky-100",
                disabled && "cursor-not-allowed border-white/5 text-slate-500"
              )}
              title={disabled ? `${panel.label}（即将上线）` : panel.description}
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
                  isActive ? "text-sky-100" : "text-slate-300",
                  disabled && "text-slate-500"
                )}
              />
              <span className="whitespace-nowrap">{panel.label}</span>
              {disabled && (
                <span className="text-[10px] text-slate-500 lg:hidden">即将上线</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
