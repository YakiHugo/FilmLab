import { useCallback, useEffect, useRef } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import type { CanvasRenderableNode } from "@/types";
import { resolveSelectableSelectionIds } from "../selectionGeometry";
import { selectionIdsEqual } from "../selectionModel";
import { selectLoadedWorkbench } from "../store/canvasStoreSelectors";
import { useCanvasLoadedWorkbenchStructure } from "./useCanvasLoadedWorkbenchStructure";
import { useCanvasHistoryActions } from "./useCanvasHistoryActions";
import { useCanvasSelectionActions } from "./useCanvasSelectionActions";

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
  const loadedWorkbenchId = useCanvasStore((state) => state.loadedWorkbenchId);
  const {
    deleteNodes,
    duplicateNodes,
    groupNodes,
    nudgeElements,
    ungroupNode,
  } = useCanvasLoadedWorkbenchStructure();
  const { redo, undo } = useCanvasHistoryActions();
  const { clearSelection, selectAll, selectElement, selectedElementIds, setSelectedElementIds } =
    useCanvasSelectionActions();
  const selectedElementIdsRef = useRef(selectedElementIds);
  const selectedSelectionStateKey = useCanvasStore(
    useCallback((state) => {
      const loadedWorkbench = selectLoadedWorkbench(state);
      if (!loadedWorkbench || selectedElementIds.length === 0) {
        return "";
      }

      return selectedElementIds
        .map((selectedElementId) => {
          const element = loadedWorkbench.allNodes.find((node) => node.id === selectedElementId);
          return element
            ? `${selectedElementId}:${element.effectiveLocked ? 1 : 0}:${element.effectiveVisible ? 1 : 0}`
            : `${selectedElementId}:missing`;
        })
        .join("|");
    }, [selectedElementIds])
  );

  const clipboardIdsRef = useRef<string[]>([]);

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

  useEffect(() => {
    selectedElementIdsRef.current = selectedElementIds;
  }, [selectedElementIds]);

  useEffect(() => {
    if (selectedElementIds.length === 0) {
      return;
    }

    const loadedWorkbench = selectLoadedWorkbench(useCanvasStore.getState());
    const selectedNodes = selectedElementIds
      .map((selectedElementId) =>
        loadedWorkbench?.allNodes.find((node) => node.id === selectedElementId)
      )
      .filter((node): node is CanvasRenderableNode => Boolean(node));
    const nextSelectedIds = resolveSelectableSelectionIds(selectedNodes, selectedElementIds);
    if (!selectionIdsEqual(selectedElementIds, nextSelectedIds)) {
      setSelectedElementIds(nextSelectedIds);
    }
  }, [selectedElementIds, selectedSelectionStateKey, setSelectedElementIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || !loadedWorkbenchId) {
        return;
      }

      const metaOrCtrl = event.metaKey || event.ctrlKey;

      if (metaOrCtrl && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectAll();
        return;
      }

      if (metaOrCtrl && event.key.toLowerCase() === "c") {
        if (selectedElementIdsRef.current.length > 0) {
          event.preventDefault();
          clipboardIdsRef.current = selectedElementIdsRef.current;
        }
        return;
      }

      if (metaOrCtrl && event.key.toLowerCase() === "v") {
        const idsToDuplicate =
          clipboardIdsRef.current.length > 0
            ? clipboardIdsRef.current
            : selectedElementIdsRef.current;
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
          if (selectedElementIdsRef.current.length === 1) {
            void ungroupNode(selectedElementIdsRef.current[0]!);
          }
          return;
        }
        if (selectedElementIdsRef.current.length > 1) {
          void groupNodes(selectedElementIdsRef.current);
        }
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedElementIdsRef.current.length > 0) {
          event.preventDefault();
          void deleteNodes(selectedElementIdsRef.current);
        }
        return;
      }

      if (selectedElementIdsRef.current.length === 0) {
        return;
      }

      const step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        void nudgeElements(selectedElementIdsRef.current, 0, -step);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        void nudgeElements(selectedElementIdsRef.current, 0, step);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        void nudgeElements(selectedElementIdsRef.current, -step, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        void nudgeElements(selectedElementIdsRef.current, step, 0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    loadedWorkbenchId,
    deleteNodes,
    duplicateNodes,
    groupNodes,
    nudgeElements,
    redo,
    selectAll,
    ungroupNode,
    undo,
  ]);

  return {
    selectedElementIds,
    setSelectedElementIds,
    selectElement,
    selectAll,
    clearSelection,
    deleteSelection,
    duplicateSelection,
  };
}
