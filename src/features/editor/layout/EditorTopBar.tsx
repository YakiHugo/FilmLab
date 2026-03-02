import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Copy, Redo2, RefreshCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useEditorState } from "../useEditorState";

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

  const [pasteConfirmOpen, setPasteConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  return (
    <header className="shrink-0 border-b border-white/10 bg-[#121316] px-3 py-2 backdrop-blur lg:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            asChild
            className="rounded-xl border border-white/10 bg-[#0f1114] hover:border-white/20 hover:bg-[#161a1f]"
          >
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
            className="rounded-xl border border-white/10 bg-[#0f1114] hover:border-white/20 hover:bg-[#161a1f]"
            disabled={!selectedAsset || !canUndo}
            onClick={() => {
              handleUndo();
            }}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-xl border border-white/10 bg-[#0f1114] hover:border-white/20 hover:bg-[#161a1f]"
            disabled={!selectedAsset || !canRedo}
            onClick={() => {
              handleRedo();
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
            className="rounded-xl border border-white/10 bg-[#0f1114] hover:border-white/20 hover:bg-[#161a1f]"
            disabled={!selectedAsset}
            onClick={() => {
              handleCopy();
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-xl border border-white/10 bg-[#0f1114] hover:border-white/20 hover:bg-[#161a1f]"
            disabled={!selectedAsset || !copiedAdjustments}
            onClick={() => setPasteConfirmOpen(true)}
          >
            Paste
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-xl border border-white/10 bg-[#0f1114] hover:border-white/20 hover:bg-[#161a1f]"
            disabled={!selectedAsset}
            onClick={() => setResetConfirmOpen(true)}
          >
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={pasteConfirmOpen}
        onOpenChange={setPasteConfirmOpen}
        title="Paste Settings"
        description="This replaces current adjustments for the selected image."
        onConfirm={() => {
          handlePaste();
        }}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Reset Adjustments"
        description="Reset all current adjustment values for this image?"
        onConfirm={() => {
          handleResetAll();
        }}
      />
    </header>
  );
}
