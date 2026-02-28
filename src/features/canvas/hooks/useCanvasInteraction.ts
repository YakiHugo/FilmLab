import { useCallback, useEffect, useMemo, useRef } from "react";
import { useCanvasStore } from "@/stores/canvasStore";

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }
  return target.isContentEditable;
};

export function useCanvasInteraction() {
  const documents = useCanvasStore((state) => state.documents);
  const activeDocumentId = useCanvasStore((state) => state.activeDocumentId);
  const selectedElementIds = useCanvasStore((state) => state.selectedElementIds);
  const setSelectedElementIds = useCanvasStore((state) => state.setSelectedElementIds);
  const duplicateElements = useCanvasStore((state) => state.duplicateElements);
  const deleteElements = useCanvasStore((state) => state.deleteElements);
  const nudgeElements = useCanvasStore((state) => state.nudgeElements);
  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [documents, activeDocumentId]
  );

  const clipboardIdsRef = useRef<string[]>([]);

  const clearSelection = useCallback(() => {
    setSelectedElementIds([]);
  }, [setSelectedElementIds]);

  const selectElement = useCallback(
    (id: string, options?: { additive?: boolean }) => {
      if (!options?.additive) {
        setSelectedElementIds([id]);
        return;
      }
      if (selectedElementIds.includes(id)) {
        setSelectedElementIds(selectedElementIds.filter((selectedId) => selectedId !== id));
        return;
      }
      setSelectedElementIds([...selectedElementIds, id]);
    },
    [selectedElementIds, setSelectedElementIds]
  );

  const deleteSelection = useCallback(async () => {
    if (!activeDocumentId || selectedElementIds.length === 0) {
      return;
    }
    await deleteElements(activeDocumentId, selectedElementIds);
  }, [activeDocumentId, deleteElements, selectedElementIds]);

  const duplicateSelection = useCallback(async () => {
    if (!activeDocumentId || selectedElementIds.length === 0) {
      return;
    }
    await duplicateElements(activeDocumentId, selectedElementIds);
  }, [activeDocumentId, duplicateElements, selectedElementIds]);

  const selectAll = useCallback(() => {
    if (!activeDocument) {
      return;
    }
    setSelectedElementIds(activeDocument.elements.map((element) => element.id));
  }, [activeDocument, setSelectedElementIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      if (!activeDocumentId) {
        return;
      }

      const metaOrCtrl = event.metaKey || event.ctrlKey;

      if (metaOrCtrl && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectAll();
        return;
      }

      if (metaOrCtrl && event.key.toLowerCase() === "c") {
        if (selectedElementIds.length > 0) {
          event.preventDefault();
          clipboardIdsRef.current = selectedElementIds;
        }
        return;
      }

      if (metaOrCtrl && event.key.toLowerCase() === "v") {
        const idsToDuplicate =
          clipboardIdsRef.current.length > 0 ? clipboardIdsRef.current : selectedElementIds;
        if (idsToDuplicate.length > 0) {
          event.preventDefault();
          void duplicateElements(activeDocumentId, idsToDuplicate);
        }
        return;
      }

      if (metaOrCtrl && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          void redo(activeDocumentId);
          return;
        }
        void undo(activeDocumentId);
        return;
      }

      if (metaOrCtrl && event.key.toLowerCase() === "y") {
        event.preventDefault();
        void redo(activeDocumentId);
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedElementIds.length > 0) {
          event.preventDefault();
          void deleteElements(activeDocumentId, selectedElementIds);
        }
        return;
      }

      if (selectedElementIds.length === 0) {
        return;
      }

      const step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        void nudgeElements(activeDocumentId, selectedElementIds, 0, -step);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        void nudgeElements(activeDocumentId, selectedElementIds, 0, step);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        void nudgeElements(activeDocumentId, selectedElementIds, -step, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        void nudgeElements(activeDocumentId, selectedElementIds, step, 0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeDocument, activeDocumentId, deleteElements, duplicateElements, nudgeElements, redo, selectAll, selectedElementIds, undo]);

  return {
    activeDocument,
    selectedElementIds,
    setSelectedElementIds,
    selectElement,
    selectAll,
    clearSelection,
    deleteSelection,
    duplicateSelection,
  };
}
