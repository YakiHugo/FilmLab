import { memo } from "react";
import { Slider } from "@/components/ui/slider";

interface EditorSliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}

export const EditorSliderRow = memo(function EditorSliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: EditorSliderRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="text-slate-300">{label}</span>
        <span>{format ? format(value) : value}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(next[0] ?? 0)}
      />
    </div>
  );
});
