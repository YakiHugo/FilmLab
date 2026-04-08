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
  variant?: "default" | "canvasDock";
  hasChanges?: boolean;
  changesVisible?: boolean;
  canToggleVisibility?: boolean;
  canResetChanges?: boolean;
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
  variant = "default",
  hasChanges,
  changesVisible = true,
  canToggleVisibility,
  canResetChanges,
  onToggleVisibility,
  onResetChanges,
}: EditorSectionProps) {
  const contentId = useId();

  const showActionButtons = isOpen && (onToggleVisibility || onResetChanges);
  const hasActualChanges = Boolean(hasChanges);
  const visibilityToggleEnabled = canToggleVisibility ?? hasActualChanges;
  const resetEnabled = canResetChanges ?? hasActualChanges;
  const isCanvasDock = variant === "canvasDock";
  const visibilityButtonTitle = changesVisible
    ? isCanvasDock
      ? "隐藏改动"
      : "Hide changes"
    : isCanvasDock
      ? "显示改动"
      : "Show changes";
  const resetButtonTitle = isCanvasDock ? "重置当前分组" : "Reset section";

  return (
    <div
      className={cn(
        "overflow-hidden",
        isCanvasDock
          ? "border-t border-[color:var(--canvas-edit-divider)] first:border-t-0"
          : cn(
              "rounded-xl border border-white/10 transition-colors duration-200",
              isOpen ? "bg-[#1a1d21]/90" : "bg-[#0f1114]/80"
            )
      )}
    >
      <div
        className={cn(
          "flex w-full items-center gap-3",
          isCanvasDock ? "py-6" : "px-3 py-2.5"
        )}
      >
        <button
          type="button"
          className={cn(
            "flex flex-1 items-center gap-2 text-left transition",
            isCanvasDock ? "hover:opacity-85" : "hover:opacity-80"
          )}
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={contentId}
        >
          {icon ? (
            <span className={isCanvasDock ? "text-[color:var(--canvas-edit-text-soft)]" : "text-slate-400"}>
              {icon}
            </span>
          ) : null}
          <span
            className={cn(
              isCanvasDock
                ? "text-[14px] font-semibold tracking-[-0.02em] text-[color:var(--canvas-edit-text)]"
                : "text-sm text-slate-200"
            )}
          >
            {title}
          </span>
          {badge}
        </button>

        <div className={cn("flex items-center", isCanvasDock ? "gap-2" : "gap-1")}>
          {showActionButtons ? (
            <>
              {onToggleVisibility ? (
                <button
                  type="button"
                  className={cn(
                    isCanvasDock
                      ? "rounded-sm p-1 text-[color:var(--canvas-edit-text-soft)] transition"
                      : "rounded p-1.5 transition",
                    visibilityToggleEnabled
                      ? isCanvasDock
                        ? "hover:text-[color:var(--canvas-edit-text)]"
                        : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
                      : isCanvasDock
                        ? "cursor-not-allowed opacity-35"
                        : "cursor-not-allowed text-slate-600"
                  )}
                  onClick={visibilityToggleEnabled ? onToggleVisibility : undefined}
                  disabled={!visibilityToggleEnabled}
                  title={visibilityButtonTitle}
                >
                  {changesVisible ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : null}
              {onResetChanges ? (
                <button
                  type="button"
                  className={cn(
                    isCanvasDock
                      ? "rounded-sm p-1 text-[color:var(--canvas-edit-text-soft)] transition"
                      : "rounded p-1.5 transition",
                    resetEnabled
                      ? isCanvasDock
                        ? "hover:text-[color:var(--canvas-edit-text)]"
                        : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
                      : isCanvasDock
                        ? "cursor-not-allowed opacity-35"
                        : "cursor-not-allowed text-slate-600"
                  )}
                  onClick={resetEnabled ? onResetChanges : undefined}
                  disabled={!resetEnabled}
                  title={resetButtonTitle}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </>
          ) : null}
          {isCanvasDock ? (
            <span
              aria-hidden="true"
              className="flex h-4 w-4 items-center justify-center text-[color:var(--canvas-edit-text-soft)]"
            >
              <ChevronRight
                className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-90")}
              />
            </span>
          ) : showActionButtons ? null : (
            <button
              type="button"
              className="rounded p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-300"
              onClick={onToggle}
              aria-label={isOpen ? "Collapse" : "Expand"}
            >
              <ChevronRight
                className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-90")}
              />
            </button>
          )}
        </div>
      </div>

      <div
        id={contentId}
        className={cn(
          "grid transition-all duration-200 ease-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className={cn(isCanvasDock ? "space-y-4 pb-6" : "space-y-3 px-3 pb-3 pt-1")}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
});
