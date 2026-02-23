import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { clamp } from "@/lib/math";

interface EditorSliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  defaultValue?: number;
  format?: (value: number) => string;
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
  onChange,
  onCommit,
  onReset,
}: EditorSliderRowProps) {
  const hasDefault = typeof defaultValue === "number";
  const canReset =
    Boolean(onReset) &&
    hasDefault &&
    Math.abs(value - (defaultValue ?? 0)) > Math.max(step / 2, 0.0001);
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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="text-slate-300">{label}</span>
        <div className="flex items-center gap-2">
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
              aria-label={`${label} 数值输入`}
              className="h-6 w-16 rounded-md border border-sky-300/40 bg-slate-950 px-2 text-right text-xs text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/40"
            />
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={handleStartEditingValue}
              className="min-w-[3.5rem] rounded-md bg-white/5 px-2 py-0.5 text-right font-medium text-slate-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {format ? format(value) : value}
            </button>
          )}
          {canReset && (
            <button
              type="button"
              className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/40"
              onClick={onReset}
            >
              重置
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
});
