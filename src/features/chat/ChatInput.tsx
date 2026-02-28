import { Paperclip, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  isLoading: boolean;
  onSend: (input: { text: string; files?: FileList | null }) => void;
  onStop: () => void;
}

const MAX_TEXTAREA_HEIGHT = 200;

export function ChatInput({ isLoading, onSend, onStop }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  const resetAttachments = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const submit = () => {
    const next = value.trim();
    const files = fileInputRef.current?.files;
    const hasFiles = Boolean(files && files.length > 0);
    if ((!next && !hasFiles) || isLoading) {
      return;
    }
    onSend({ text: next, files: files ?? null });
    setValue("");
    resetAttachments();
  };

  return (
    <div className="border-t border-white/10 bg-black/35 p-3">
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {selectedFiles.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/35 p-2 text-[11px] text-zinc-300">
            {selectedFiles.map((file) => (
              <span key={`${file.name}-${file.size}`} className="rounded-full border border-white/10 bg-black/40 px-2 py-1">
                {file.name}
              </span>
            ))}
            <button
              type="button"
              className="ml-auto text-zinc-500 transition hover:text-zinc-200"
              onClick={resetAttachments}
            >
              Clear
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              setSelectedFiles(Array.from(event.target.files ?? []));
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-10 w-10 rounded-xl border border-white/10 bg-black/45 p-0"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <textarea
            ref={textareaRef}
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
              submit();
            }}
            placeholder="Describe your concept, mood, or sequence..."
            className="min-h-[56px] max-h-[200px] flex-1 resize-none overflow-y-auto rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-sky-400"
          />

          {isLoading ? (
            <Button
              type="button"
              className="h-10 rounded-xl border border-amber-300/30 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20"
              onClick={onStop}
            >
              <Square className="mr-1 h-4 w-4" />
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!value.trim() && selectedFiles.length === 0} className="h-10 rounded-xl bg-sky-400 text-black hover:bg-sky-300">
              Send
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
