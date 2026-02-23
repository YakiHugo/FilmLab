import { memo, useCallback, useRef, useState } from "react";
import { Send, Square } from "lucide-react";

interface AiChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

export const AiChatInput = memo(function AiChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isLoading,
  disabled,
}: AiChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [composing, setComposing] = useState(false);

  const handleSubmit = useCallback(() => {
    if (isLoading) {
      onStop();
      return;
    }
    const text = value.trim();
    if (!text) return;
    onSend(text);
    onChange("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [isLoading, value, onSend, onStop, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && !composing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, composing]
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  return (
    <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          handleInput();
        }}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        placeholder="描述你想要的风格，或输入微调指令..."
        disabled={disabled}
        rows={1}
        className="min-h-[32px] flex-1 resize-none bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled || (!isLoading && !value.trim())}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600/80 text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isLoading ? (
          <Square className="h-3.5 w-3.5 fill-current" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
});
