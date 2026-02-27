import { useState } from "react";
import { Button } from "@/components/ui/button";

interface BatchActionsBarProps {
  selectedCount: number;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onDelete: () => void;
}

export function BatchActionsBar({ selectedCount, onAddTag, onRemoveTag, onDelete }: BatchActionsBarProps) {
  const [tag, setTag] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/35 p-3">
      <p className="text-xs text-zinc-400">{selectedCount} selected</p>
      <input
        value={tag}
        onChange={(event) => setTag(event.target.value)}
        placeholder="Tag..."
        className="h-9 rounded-xl border border-white/10 bg-black/35 px-3 text-xs text-zinc-200 outline-none"
      />
      <Button
        size="sm"
        variant="secondary"
        className="rounded-xl border border-white/10 bg-black/45"
        onClick={() => {
          onAddTag(tag);
          setTag("");
        }}
        disabled={!tag.trim() || selectedCount === 0}
      >
        Add Tag
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="rounded-xl border border-white/10 bg-black/45"
        onClick={() => {
          onRemoveTag(tag);
          setTag("");
        }}
        disabled={!tag.trim() || selectedCount === 0}
      >
        Remove Tag
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="rounded-xl border border-rose-400/35 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
        onClick={onDelete}
        disabled={selectedCount === 0}
      >
        Delete Selected
      </Button>
    </div>
  );
}
