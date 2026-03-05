import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Eye, EyeOff, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ZOOM_PRESETS } from "../useViewportZoom";
import { useEditorState } from "../useEditorState";

const ZOOM_SELECT_ITEMS = ZOOM_PRESETS.map((preset) => ({
  ...preset,
  key: typeof preset.value === "number" ? preset.value.toString() : preset.value,
}));

const resolveZoomSelectValue = (scale: number) => {
  if (Math.abs(scale - 1) < 0.001) {
    return "fit";
  }
  const matched = ZOOM_SELECT_ITEMS.find(
    (item) => typeof item.value === "number" && Math.abs(item.value - scale) < 0.001
  );
  return matched?.key;
};

const resolveZoomLabel = (scale: number) => `${Math.round(scale * 100)}%`;

export function EditorFooterBar() {
  const {
    selectedAsset,
    presetLabel,
    showOriginal,
    viewportScale,
    copiedAdjustments,
    canUndo,
    setViewportScale,
    toggleOriginal,
    handleCopy,
    handlePaste,
    handleUndo,
    handleResetAll,
  } = useEditorState();
  const [pendingAction, setPendingAction] = useState<string | undefined>(undefined);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [pasteConfirmOpen, setPasteConfirmOpen] = useState(false);

  const selectedZoomValue = useMemo(
    () => resolveZoomSelectValue(viewportScale),
    [viewportScale]
  );

  return (
    <footer className="flex h-10 shrink-0 items-center justify-between bg-[#121214] px-3">
      <div className="flex items-center gap-3">
        {/* Back to Library */}
        <Link
          to="/library"
          className="flex h-7 items-center gap-1 rounded-lg border border-white/10 bg-[#0f1114] px-2 text-[11px] text-zinc-300 transition hover:border-white/20 hover:bg-[#161a1f] hover:text-white"
          title="Back to Library"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Library</span>
        </Link>

        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-zinc-100">
            {selectedAsset?.name ?? "No asset selected"}
          </p>
          <p className="truncate text-[11px] text-zinc-500">Preset: {presetLabel ?? "None"}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant={showOriginal ? "default" : "secondary"}
          className="h-8 rounded-lg px-2"
          disabled={!selectedAsset}
          onClick={toggleOriginal}
          title={showOriginal ? "Show edited preview" : "Show original preview"}
        >
          {showOriginal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>

        <Select
          value={selectedZoomValue}
          onValueChange={(value) => {
            if (value === "fit") {
              setViewportScale(1);
              return;
            }
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
              setViewportScale(parsed);
            }
          }}
          disabled={!selectedAsset}
        >
          <SelectTrigger className="h-8 w-[88px] rounded-lg px-2 text-xs">
            <SelectValue placeholder={resolveZoomLabel(viewportScale)} />
          </SelectTrigger>
          <SelectContent>
            {ZOOM_SELECT_ITEMS.map((item) => (
              <SelectItem key={item.key} value={item.key}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant="secondary"
          className="h-8 rounded-lg border border-white/10 bg-[#0f1114] px-2 hover:border-white/20 hover:bg-[#161a1f]"
          disabled={!selectedAsset || !canUndo}
          onClick={() => {
            handleUndo();
          }}
          title="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </Button>

        <Select
          value={pendingAction}
          onValueChange={(value) => {
            setPendingAction(undefined);
            if (value === "copy") {
              handleCopy();
              return;
            }
            if (value === "paste") {
              setPasteConfirmOpen(true);
              return;
            }
            if (value === "reset") {
              setResetConfirmOpen(true);
            }
          }}
          disabled={!selectedAsset}
        >
          <SelectTrigger className="h-8 w-[106px] rounded-lg px-2 text-xs">
            <SelectValue placeholder="Actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="copy">Copy Settings</SelectItem>
            <SelectItem value="paste" disabled={!copiedAdjustments}>
              Paste Settings
            </SelectItem>
            <SelectItem value="reset">Reset Adjustments</SelectItem>
          </SelectContent>
        </Select>
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
    </footer>
  );
}
