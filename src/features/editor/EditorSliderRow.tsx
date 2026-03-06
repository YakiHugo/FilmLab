import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { clamp } from "@/lib/math";

export interface EditorSliderRowProps {
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
  defaultValue: _defaultValue,
  format,
  onChange,
  onCommit,
  onReset: _onReset,
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

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <div className="relative h-5 w-14">
          {isEditingValue && (
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
              aria-label={`${label} value input`}
              className="absolute inset-0 border-b border-white/60 bg-transparent px-1 text-right text-xs text-slate-200 outline-none"
            />
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={handleStartEditingValue}
            aria-hidden={isEditingValue}
            tabIndex={isEditingValue ? -1 : 0}
            className={`h-full w-full px-1 text-right text-xs text-slate-300 transition hover:text-slate-100 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${isEditingValue ? "invisible" : ""}`}
          >
            {format ? format(value) : value}
          </button>
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
