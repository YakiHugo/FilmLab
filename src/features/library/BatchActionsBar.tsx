import { useMemo, useState } from "react";
import { presets } from "@/data/presets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BatchActionsBarProps {
  selectedCount: number;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onDelete: () => void;
  onApplyPreset: (presetId: string) => void;
}

export function BatchActionsBar({
  selectedCount,
  onAddTag,
  onRemoveTag,
  onDelete,
  onApplyPreset,
}: BatchActionsBarProps) {
  const [tag, setTag] = useState("");
  const [pendingPreset, setPendingPreset] = useState("none");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const presetOptions = useMemo(() => presets.map((preset) => ({ id: preset.id, name: preset.name })), []);

  return (
    <>
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

        <Select value={pendingPreset} onValueChange={setPendingPreset}>
          <SelectTrigger className="h-9 w-[180px] rounded-xl text-xs">
            <SelectValue placeholder="Preset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select preset</SelectItem>
            {presetOptions.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant="secondary"
          className="rounded-xl border border-white/10 bg-black/45"
          disabled={selectedCount === 0 || pendingPreset === "none"}
          onClick={() => onApplyPreset(pendingPreset)}
        >
          Apply Preset
        </Button>

        <Button
          size="sm"
          variant="secondary"
          className="rounded-xl border border-rose-400/35 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
          onClick={() => setConfirmOpen(true)}
          disabled={selectedCount === 0}
        >
          Delete Selected
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete selected assets?</AlertDialogTitle>
          <AlertDialogDescription>
            This operation cannot be undone and will remove {selectedCount} asset(s).
          </AlertDialogDescription>
          <div className="mt-5 flex justify-end gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete();
                setConfirmOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
