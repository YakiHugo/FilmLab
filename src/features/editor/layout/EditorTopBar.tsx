import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Copy, Redo2, RefreshCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { useEditorState } from "../useEditorState";

interface TopBarMessage {
  type: "success" | "error";
  text: string;
}

export function EditorTopBar() {
  const {
    selectedAsset,
    presetLabel,
    showOriginal,
    copiedAdjustments,
    canUndo,
    canRedo,
    toggleOriginal,
    handleCopy,
    handlePaste,
    handleUndo,
    handleRedo,
    handleResetAll,
  } = useEditorState();

  const [message, setMessage] = useState<TopBarMessage | null>(null);
  const [pasteConfirmOpen, setPasteConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = window.setTimeout(() => setMessage(null), 1800);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <header className="shrink-0 border-b border-white/10 bg-[#16171a]/90 px-3 py-2 backdrop-blur lg:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button size="sm" variant="secondary" asChild className="rounded-xl border border-white/10 bg-black/45">
            <Link to="/library">
              <ChevronLeft className="h-4 w-4" />
              Library
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-100">{selectedAsset?.name ?? "No asset selected"}</p>
            <p className="truncate text-xs text-zinc-500">Preset: {presetLabel ?? "None"}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            className="rounded-xl border border-white/10 bg-black/45"
            disabled={!selectedAsset || !canUndo}
            onClick={() => {
              const ok = handleUndo();
              setMessage({ type: ok ? "success" : "error", text: ok ? "Undo" : "Nothing to undo" });
            }}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-xl border border-white/10 bg-black/45"
            disabled={!selectedAsset || !canRedo}
            onClick={() => {
              const ok = handleRedo();
              setMessage({ type: ok ? "success" : "error", text: ok ? "Redo" : "Nothing to redo" });
            }}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={showOriginal ? "default" : "secondary"}
            className="rounded-xl"
            disabled={!selectedAsset}
            onClick={toggleOriginal}
          >
            {showOriginal ? "Edited" : "Original"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-xl border border-white/10 bg-black/45"
            disabled={!selectedAsset}
            onClick={() => {
              const ok = handleCopy();
              setMessage({ type: ok ? "success" : "error", text: ok ? "Copied" : "Copy failed" });
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-xl border border-white/10 bg-black/45"
            disabled={!selectedAsset || !copiedAdjustments}
            onClick={() => setPasteConfirmOpen(true)}
          >
            Paste
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-xl border border-white/10 bg-black/45"
            disabled={!selectedAsset}
            onClick={() => setResetConfirmOpen(true)}
          >
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {message && (
        <p
          className={cn(
            "mt-2 rounded-lg border px-2.5 py-1 text-xs",
            message.type === "success"
              ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
              : "border-rose-300/30 bg-rose-300/10 text-rose-200"
          )}
        >
          {message.text}
        </p>
      )}

      <ConfirmDialog
        open={pasteConfirmOpen}
        onOpenChange={setPasteConfirmOpen}
        title="Paste Settings"
        description="This replaces current adjustments for the selected image."
        onConfirm={() => {
          const ok = handlePaste();
          setMessage({ type: ok ? "success" : "error", text: ok ? "Pasted" : "Paste failed" });
        }}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Reset Adjustments"
        description="Reset all current adjustment values for this image?"
        onConfirm={() => {
          const ok = handleResetAll();
          setMessage({ type: ok ? "success" : "error", text: ok ? "Reset" : "Reset failed" });
        }}
      />
    </header>
  );
}
