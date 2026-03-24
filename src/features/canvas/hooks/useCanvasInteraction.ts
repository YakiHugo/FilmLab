import { useCallback, useEffect, useMemo, useRef } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import { resolveSelectableSelectionIds } from "../selectionGeometry";
import { selectionIdsEqual } from "../selectionModel";
import { useActiveCanvasWorkbench } from "./useActiveCanvasWorkbench";

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
  const {
    activeWorkbench,
    activeWorkbenchId,
    deleteNodes,
    duplicateNodes,
    groupNodes,
    nudgeElements,
    redo,
    undo,
    ungroupNode,
  } = useActiveCanvasWorkbench();
  const selectedElementIds = useCanvasStore((state) => state.selectedElementIds);
  const setSelectedElementIds = useCanvasStore((state) => state.setSelectedElementIds);

  const selectableElementIds = useMemo(
    () =>
      activeWorkbench
        ? resolveSelectableSelectionIds(
            activeWorkbench.allNodes,
            activeWorkbench.allNodes.map((node) => node.id)
          )
        : [],
    [activeWorkbench]
  );
  const selectableElementIdSet = useMemo(
    () => new Set(selectableElementIds),
    [selectableElementIds]
  );

  const clipboardIdsRef = useRef<string[]>([]);

  const clearSelection = useCallback(() => {
    setSelectedElementIds([]);
  }, [setSelectedElementIds]);

  const selectElement = useCallback(
    (id: string, options?: { additive?: boolean }) => {
      const { selectedElementIds: currentSelectedIds } = useCanvasStore.getState();
      if (!selectableElementIdSet.has(id)) {
        return;
      }
      const selectableCurrentSelectedIds = currentSelectedIds.filter((selectedId) =>
        selectableElementIdSet.has(selectedId)
      );
      if (!options?.additive) {
        setSelectedElementIds([id]);
        return;
      }
      if (selectableCurrentSelectedIds.includes(id)) {
        setSelectedElementIds(
          selectableCurrentSelectedIds.filter((selectedId) => selectedId !== id)
        );
        return;
      }
      setSelectedElementIds([...selectableCurrentSelectedIds, id]);
    },
    [selectableElementIdSet, setSelectedElementIds]
  );

  const deleteSelection = useCallback(async () => {
    if (selectedElementIds.length === 0) {
      return;
    }
    await deleteNodes(selectedElementIds);
  }, [deleteNodes, selectedElementIds]);

  const duplicateSelection = useCallback(async () => {
    if (selectedElementIds.length === 0) {
      return;
    }
    await duplicateNodes(selectedElementIds);
  }, [duplicateNodes, selectedElementIds]);

  const selectAll = useCallback(() => {
    if (selectableElementIds.length === 0) {
      return;
    }
    setSelectedElementIds(selectableElementIds);
  }, [selectableElementIds, setSelectedElementIds]);

  useEffect(() => {
    const nextSelectedIds = resolveSelectableSelectionIds(
      activeWorkbench?.allNodes ?? [],
      selectedElementIds
    );
    if (!selectionIdsEqual(selectedElementIds, nextSelectedIds)) {
      setSelectedElementIds(nextSelectedIds);
    }
  }, [activeWorkbench?.allNodes, selectedElementIds, setSelectedElementIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || !activeWorkbenchId) {
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
          void duplicateNodes(idsToDuplicate);
        }
        return;
      }

      if (metaOrCtrl && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          void redo();
          return;
        }
        void undo();
        return;
      }

      if (metaOrCtrl && event.key.toLowerCase() === "y") {
        event.preventDefault();
        void redo();
        return;
      }

      if (metaOrCtrl && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (event.shiftKey) {
          if (selectedElementIds.length === 1) {
            void ungroupNode(selectedElementIds[0]!);
          }
          return;
        }
        if (selectedElementIds.length > 1) {
          void groupNodes(selectedElementIds);
        }
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedElementIds.length > 0) {
          event.preventDefault();
          void deleteNodes(selectedElementIds);
        }
        return;
      }

      if (selectedElementIds.length === 0) {
        return;
      }

      const step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        void nudgeElements(selectedElementIds, 0, -step);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        void nudgeElements(selectedElementIds, 0, step);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        void nudgeElements(selectedElementIds, -step, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        void nudgeElements(selectedElementIds, step, 0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activeWorkbenchId,
    deleteNodes,
    duplicateNodes,
    groupNodes,
    nudgeElements,
    redo,
    selectAll,
    selectedElementIds,
    ungroupNode,
    undo,
  ]);

  return {
    activeWorkbench,
    selectedElementIds,
    setSelectedElementIds,
    selectElement,
    selectAll,
    clearSelection,
    deleteSelection,
    duplicateSelection,
  };
}
