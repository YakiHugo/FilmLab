import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  isLoading: boolean;
  onSend: (text: string) => void;
}

export function ChatInput({ isLoading, onSend }: ChatInputProps) {
  const [value, setValue] = useState("");

  return (
    <div className="border-t border-white/10 bg-black/35 p-3">
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = value.trim();
          if (!next) {
            return;
          }
          onSend(next);
          setValue("");
        }}
      >
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }
            if (event.shiftKey) {
              return;
            }
            event.preventDefault();
            const next = value.trim();
            if (!next || isLoading) {
              return;
            }
            onSend(next);
            setValue("");
          }}
          placeholder="Describe your concept, mood, or sequence..."
          className="min-h-[56px] flex-1 resize-none rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-sky-400"
        />
        <Button type="submit" disabled={isLoading || !value.trim()} className="rounded-xl bg-sky-400 text-black hover:bg-sky-300">
          Send
        </Button>
      </form>
    </div>
  );
}
