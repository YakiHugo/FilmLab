import { memo, useId, type ReactNode } from "react";
import { ChevronRight, Eye, EyeOff, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditorSectionProps {
  title: string;
  hint?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  hasChanges?: boolean;
  changesVisible?: boolean;
  onToggleVisibility?: () => void;
  onResetChanges?: () => void;
}

export const EditorSection = memo(function EditorSection({
  title,
  hint: _hint,
  isOpen,
  onToggle,
  children,
  icon,
  badge,
  hasChanges,
  changesVisible = true,
  onToggleVisibility,
  onResetChanges,
}: EditorSectionProps) {
  const contentId = useId();

  const showActionButtons = isOpen && (onToggleVisibility || onResetChanges);
  const hasActualChanges = Boolean(hasChanges);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-white/10 transition-colors duration-200",
        isOpen ? "bg-[#1a1d21]/90" : "bg-[#0f1114]/80"
      )}
    >
      {/* Header */}
      <div className="flex w-full items-center gap-3 px-3 py-2.5">
        {/* Left: icon + title + badge (clickable to toggle) */}
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left transition hover:opacity-80"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={contentId}
        >
          {icon && <span className="text-slate-400">{icon}</span>}
          <span className="text-sm text-slate-200">{title}</span>
          {badge}
        </button>

        {/* Right: action buttons or chevron */}
        <div className="flex items-center gap-1">
          {showActionButtons ? (
            <>
              {onToggleVisibility && (
                <button
                  type="button"
                  className={cn(
                    "rounded p-1.5 transition",
                    hasActualChanges
                      ? "text-slate-400 hover:bg-white/10 hover:text-slate-200"
                      : "cursor-not-allowed text-slate-600"
                  )}
                  onClick={hasActualChanges ? onToggleVisibility : undefined}
                  disabled={!hasActualChanges}
                  title={changesVisible ? "隐藏改动" : "显示改动"}
                >
                  {changesVisible ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
              {onResetChanges && (
                <button
                  type="button"
                  className={cn(
                    "rounded p-1.5 transition",
                    hasActualChanges
                      ? "text-slate-400 hover:bg-white/10 hover:text-slate-200"
                      : "cursor-not-allowed text-slate-600"
                  )}
                  onClick={hasActualChanges ? onResetChanges : undefined}
                  disabled={!hasActualChanges}
                  title="撤销改动"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className="rounded p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-300"
              onClick={onToggle}
              aria-label={isOpen ? "收起" : "展开"}
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  isOpen && "rotate-90"
                )}
              />
            </button>
          )}
        </div>
      </div>

      {/* Content with animation */}
      <div
        id={contentId}
        className={cn(
          "grid transition-all duration-200 ease-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 px-3 pb-3 pt-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
});
