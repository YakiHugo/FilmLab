import { useCallback, useEffect, useState } from "react";
import { isEditableElement, ZOOM_STEP } from "./cropGeometry";

interface UseEditorKeyboardOptions {
  selectedAsset: { id: string } | null | undefined;
  showOriginal: boolean;
  isCropMode: boolean;
  viewScale: number;
  toggleOriginal: () => void;
  handleUndo: () => boolean;
  handleRedo: () => boolean;
  resetView: () => void;
  handleZoom: (nextScale: number) => void;
}

export function useEditorKeyboard({
  selectedAsset,
  showOriginal,
  isCropMode,
  viewScale,
  toggleOriginal,
  handleUndo,
  handleRedo,
  resetView,
  handleZoom,
}: UseEditorKeyboardOptions) {
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const triggerUndo = useCallback(() => {
    const undone = handleUndo();
    setActionMessage(
      undone ? { type: "success", text: "已撤销。" } : { type: "error", text: "没有可撤销的操作。" }
    );
    return undone;
  }, [handleUndo]);

  const triggerRedo = useCallback(() => {
    const redone = handleRedo();
    setActionMessage(
      redone ? { type: "success", text: "已重做。" } : { type: "error", text: "没有可重做的操作。" }
    );
    return redone;
  }, [handleRedo]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      const withCommand = event.metaKey || event.ctrlKey;
      const isUndoShortcut = withCommand && !event.shiftKey && key === "z";
      const isRedoShortcut =
        withCommand &&
        ((event.shiftKey && key === "z") || (event.ctrlKey && !event.metaKey && key === "y"));

      if (!event.altKey && selectedAsset && isUndoShortcut) {
        event.preventDefault();
        triggerUndo();
        return;
      }
      if (!event.altKey && selectedAsset && isRedoShortcut) {
        event.preventDefault();
        triggerRedo();
        return;
      }

      if (!selectedAsset || withCommand || event.altKey) {
        return;
      }

      if (key === "o") {
        event.preventDefault();
        toggleOriginal();
        setActionMessage({
          type: "success",
          text: !showOriginal ? "已切换为原图预览。" : "已切换回编辑预览。",
        });
        return;
      }

      if (isCropMode) {
        return;
      }

      if (key === "0") {
        event.preventDefault();
        resetView();
        return;
      }

      if (key === "=" || key === "+") {
        event.preventDefault();
        handleZoom(viewScale + ZOOM_STEP);
        return;
      }

      if (key === "-" || key === "_") {
        event.preventDefault();
        handleZoom(viewScale - ZOOM_STEP);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    handleZoom,
    isCropMode,
    resetView,
    selectedAsset,
    showOriginal,
    toggleOriginal,
    triggerRedo,
    triggerUndo,
    viewScale,
  ]);

  // Auto-dismiss action messages
  useEffect(() => {
    if (!actionMessage) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setActionMessage(null);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  return { actionMessage, setActionMessage };
}
