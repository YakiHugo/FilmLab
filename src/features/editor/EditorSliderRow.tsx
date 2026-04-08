import { memo, useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { clamp } from "@/lib/math";
import { cn } from "@/lib/utils";

type EditorSliderTone = "neutral" | "temperature" | "tint";
type EditorSliderVariant = "default" | "canvasDock";

export interface EditorSliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  defaultValue?: number;
  format?: (value: number) => string;
  tone?: EditorSliderTone;
  variant?: EditorSliderVariant;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  onReset?: () => void;
}

const resolveStepPrecision = (step: number) => {
  const stepText = `${step}`;
  if (stepText.includes("e-")) {
    const [, exponent] = stepText.split("e-");
    return Number(exponent) || 0;
  }
  return stepText.includes(".") ? (stepText.split(".")[1]?.length ?? 0) : 0;
};

const normalizeByStep = (value: number, min: number, max: number, step: number) => {
  const bounded = clamp(value, min, max);
  const precision = resolveStepPrecision(step);
  const stepped = min + Math.round((bounded - min) / step) * step;
  return Number(stepped.toFixed(precision));
};

const formatInputValue = (value: number, step: number) => {
  const precision = resolveStepPrecision(step);
  if (precision === 0) {
    return `${Math.round(value)}`;
  }
  return value.toFixed(precision);
};

export const EditorSliderRow = memo(function EditorSliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  defaultValue,
  format,
  tone = "neutral",
  variant = "default",
  onChange,
  onCommit,
  onReset,
}: EditorSliderRowProps) {
  const [isEditingValue, setIsEditingValue] = useState(false);
  const [inputValue, setInputValue] = useState(() => formatInputValue(value, step));
  const valueInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isEditingValue) {
      setInputValue(formatInputValue(value, step));
    }
  }, [isEditingValue, step, value]);

  useEffect(() => {
    if (isEditingValue) {
      valueInputRef.current?.focus();
      valueInputRef.current?.select();
    }
  }, [isEditingValue]);

  const parseInputValue = useCallback(
    (rawValue: string) => {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) {
        return null;
      }
      return normalizeByStep(parsed, min, max, step);
    },
    [max, min, step]
  );

  const handleStartEditingValue = useCallback(() => {
    if (disabled) {
      return;
    }
    setInputValue(formatInputValue(value, step));
    setIsEditingValue(true);
  }, [disabled, step, value]);

  const handleCancelEditingValue = useCallback(() => {
    setInputValue(formatInputValue(value, step));
    setIsEditingValue(false);
  }, [step, value]);

  const handleCommitEditingValue = useCallback(() => {
    const parsed = parseInputValue(inputValue);
    setIsEditingValue(false);

    if (parsed === null) {
      setInputValue(formatInputValue(value, step));
      return;
    }

    setInputValue(formatInputValue(parsed, step));
    onChange(parsed);
    onCommit?.(parsed);
  }, [inputValue, onChange, onCommit, parseInputValue, step, value]);

  const canReset =
    !disabled && Boolean(onReset) && (defaultValue === undefined || value !== defaultValue);
  const trackClassName =
    tone === "temperature"
      ? "h-[2px] bg-[linear-gradient(90deg,#4f52ff_0%,#8480ff_28%,#c8c29e_68%,#f0f32b_100%)]"
      : tone === "tint"
      ? "h-[2px] bg-[linear-gradient(90deg,#58ff69_0%,#86ff9f_30%,#d8b7d6_66%,#ef2dff_100%)]"
      : "h-[2px] bg-[color:var(--canvas-edit-range)]";
  const isCanvasDock = variant === "canvasDock";
  const valueInputAriaLabel = isCanvasDock ? `${label} 数值输入` : `${label} value input`;
  const resetAriaLabel = isCanvasDock ? `重置${label}` : `Reset ${label}`;

  if (!isCanvasDock) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">{label}</span>
          <div className="relative h-5 w-14">
            {isEditingValue ? (
              <input
                ref={valueInputRef}
                type="text"
                inputMode={step < 1 ? "decimal" : "numeric"}
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onBlur={handleCommitEditingValue}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleCommitEditingValue();
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    handleCancelEditingValue();
                  }
                }}
                aria-label={valueInputAriaLabel}
                className="absolute inset-0 border-b border-white/60 bg-transparent px-1 text-right text-xs text-slate-200 outline-none"
              />
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={handleStartEditingValue}
                className="h-full w-full px-1 text-right text-xs text-slate-300 transition hover:text-slate-100 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {format ? format(value) : value}
              </button>
            )}
          </div>
        </div>
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-label={label}
          onValueChange={(next) => onChange(next[0] ?? 0)}
          onValueCommit={(next) => onCommit?.(next[0] ?? 0)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="text-[12px] font-medium tracking-[-0.01em] text-[color:var(--canvas-edit-text-muted)]">
        {label}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_76px_24px] items-center gap-3">
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-label={label}
          className="h-6"
          trackClassName={trackClassName}
          rangeClassName="bg-transparent"
          thumbClassName="h-4 w-4 border border-black/25 bg-[color:var(--canvas-edit-thumb)] shadow-[0_0_0_1px_rgba(255,255,255,0.12)] hover:bg-[color:var(--canvas-edit-thumb)] focus-visible:ring-[rgba(255,255,255,0.2)]"
          onValueChange={(next) => onChange(next[0] ?? 0)}
          onValueCommit={(next) => onCommit?.(next[0] ?? 0)}
        />

        <div className="relative h-8 w-[76px]">
          {isEditingValue ? (
            <input
              ref={valueInputRef}
              type="text"
              inputMode={step < 1 ? "decimal" : "numeric"}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onBlur={handleCommitEditingValue}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleCommitEditingValue();
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  handleCancelEditingValue();
                }
              }}
              aria-label={valueInputAriaLabel}
              className="absolute inset-0 rounded-[6px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-pill)] px-2 text-left text-[12px] text-[color:var(--canvas-edit-pill-text)] outline-none"
            />
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={handleStartEditingValue}
              className="h-full w-full rounded-[6px] border border-[color:var(--canvas-edit-border)] bg-[color:var(--canvas-edit-pill)] px-2 text-left text-[12px] text-[color:var(--canvas-edit-pill-text)] transition hover:bg-[#4b4b48] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {format ? format(value) : value}
            </button>
          )}
        </div>

        <button
          type="button"
          disabled={!canReset}
          onClick={canReset ? onReset : undefined}
          aria-label={resetAriaLabel}
          className={cn(
            "flex h-6 w-6 items-center justify-center text-[color:var(--canvas-edit-text-soft)] transition",
            canReset
              ? "hover:text-[color:var(--canvas-edit-text)]"
              : "cursor-not-allowed opacity-35"
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
});
