import { memo } from "react";
import { AVAILABLE_MODELS, type ModelOption } from "@/lib/ai/provider";

interface AiModelSelectorProps {
  value: ModelOption;
  onChange: (model: ModelOption) => void;
}

export const AiModelSelector = memo(function AiModelSelector({
  value,
  onChange,
}: AiModelSelectorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = Number(e.target.value);
    const model = AVAILABLE_MODELS[idx];
    if (model) {
      onChange(model);
    }
  };

  const selectedIndex = AVAILABLE_MODELS.findIndex(
    (m) => m.provider === value.provider && m.id === value.id
  );

  return (
    <select
      value={selectedIndex >= 0 ? selectedIndex : 0}
      onChange={handleChange}
      className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-200 outline-none transition-colors hover:border-white/20 focus:border-blue-500/50"
    >
      {AVAILABLE_MODELS.map((model, idx) => (
        <option key={`${model.provider}:${model.id}`} value={idx}>
          {model.label} ({model.provider})
        </option>
      ))}
    </select>
  );
});
