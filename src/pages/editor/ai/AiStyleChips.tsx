import { memo } from "react";

const STYLE_CHIPS = [
  { label: "日系", prompt: "帮我修成日系清新风格" },
  { label: "电影感", prompt: "帮我修成电影感风格" },
  { label: "INS风", prompt: "帮我修成Instagram流行风格" },
  { label: "胶片", prompt: "帮我修成经典胶片风格" },
  { label: "情绪", prompt: "帮我修成暗调情绪风格" },
  { label: "清透", prompt: "帮我修成清透明亮风格" },
  { label: "复古", prompt: "帮我修成复古怀旧风格" },
  { label: "黑白", prompt: "帮我修成黑白风格" },
  { label: "赛博朋克", prompt: "帮我修成赛博朋克风格" },
  { label: "奶油感", prompt: "帮我修成奶油感柔和风格" },
  { label: "森系", prompt: "帮我修成森系自然风格" },
  { label: "港风", prompt: "帮我修成港风复古风格" },
];

interface AiStyleChipsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export const AiStyleChips = memo(function AiStyleChips({
  onSelect,
  disabled,
}: AiStyleChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {STYLE_CHIPS.map((chip) => (
        <button
          key={chip.label}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(chip.prompt)}
          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
});
