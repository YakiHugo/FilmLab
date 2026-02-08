import { memo } from "react";
import { Slider } from "@/components/ui/slider";

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
  onReset?: () => void;
}

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
  onReset,
}: EditorSliderRowProps) {
  const hasDefault = typeof defaultValue === "number";
  const canReset =
    Boolean(onReset) &&
    hasDefault &&
    Math.abs(value - (defaultValue ?? 0)) > Math.max(step / 2, 0.0001);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="text-slate-300">{label}</span>
        <div className="flex items-center gap-2">
          <span>{format ? format(value) : value}</span>
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
      />
    </div>
  );
});
