import { memo } from "react";
import { cn } from "@/lib/utils";
import { WORKSPACE_STEPS } from "@/features/workspace/constants";
import type { WorkspaceStep } from "@/features/workspace/types";

interface StepIndicatorProps {
  currentStep: WorkspaceStep;
  stepIndex: number;
  onStepChange: (step: WorkspaceStep) => void;
}

export const StepIndicator = memo(function StepIndicator({
  currentStep,
  stepIndex,
  onStepChange,
}: StepIndicatorProps) {
  return (
    <nav aria-label="工作流步骤" className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-2">
      {WORKSPACE_STEPS.map((item, index) => {
        const Icon = item.icon;
        const isActive = item.id === currentStep;
        const isComplete = index < stepIndex;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onStepChange(item.id)}
            aria-label={`${item.label}：${item.description}`}
            aria-current={isActive ? "step" : undefined}
            className={cn(
              "flex min-h-[104px] flex-col items-center gap-1.5 rounded-2xl px-3 py-2.5 text-xs transition",
              isActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5"
            )}
          >
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200",
                isActive && "border-sky-200/30 bg-sky-300/20 text-sky-200"
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="font-medium">{item.label}</span>
            <span className="text-[11px] text-slate-500">{item.description}</span>
            <span
              className={cn(
                "min-h-[12px] text-[10px]",
                isComplete ? "text-emerald-300" : "text-transparent"
              )}
              aria-hidden={!isComplete}
            >
              已完成
            </span>
          </button>
        );
      })}
    </nav>
  );
});
