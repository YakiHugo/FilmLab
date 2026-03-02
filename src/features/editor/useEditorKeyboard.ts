import { useCallback, useEffect } from "react";
import { isEditableElement, ZOOM_STEP } from "./cropGeometry";

interface UseEditorKeyboardOptions {
  selectedAsset: { id: string } | null | undefined;
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
  isCropMode,
  viewScale,
  toggleOriginal,
  handleUndo,
  handleRedo,
  resetView,
  handleZoom,
}: UseEditorKeyboardOptions) {
  const triggerUndo = useCallback(() => {
    return handleUndo();
  }, [handleUndo]);

  const triggerRedo = useCallback(() => {
    return handleRedo();
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
    toggleOriginal,
    triggerRedo,
    triggerUndo,
    viewScale,
  ]);
}
