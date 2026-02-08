import { memo, useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditorSectionProps {
  title: string;
  hint?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export const EditorSection = memo(function EditorSection({
  title,
  hint,
  isOpen,
  onToggle,
  children,
}: EditorSectionProps) {
  const contentId = useId();

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
      >
        <div>
          <p className="text-sm font-medium text-slate-100">{title}</p>
          {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-slate-400 transition",
            isOpen && "rotate-180"
          )}
        />
      </button>
      {isOpen && (
        <div id={contentId} className="space-y-4 px-3 pb-4">
          {children}
        </div>
      )}
    </div>
  );
});
