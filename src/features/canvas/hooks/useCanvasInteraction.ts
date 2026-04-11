import { useEffect, useRef } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import { isCanvasTypingInProgress } from "../domEditableFocus";
import { resolveSelectableSelectionIds } from "../selectionGeometry";
import { selectionIdsEqual } from "../selectionModel";
import { useCanvasLoadedWorkbenchState } from "./useCanvasLoadedWorkbenchState";
import { useCanvasLoadedWorkbenchStructure } from "./useCanvasLoadedWorkbenchStructure";
import { useCanvasSelectionActions } from "./useCanvasSelectionActions";

export interface UseCanvasInteractionOptions {
  onShortcutKeyDown: (event: KeyboardEvent) => boolean;
}

interface CanvasInteractionNudge {
  dx: number;
  dy: number;
}

export const resolveCanvasInteractionNudge = (
  event: Pick<KeyboardEvent, "key" | "shiftKey">
): CanvasInteractionNudge | null => {
  const step = event.shiftKey ? 10 : 1;

  switch (event.key) {
    case "ArrowUp":
      return { dx: 0, dy: -step };
    case "ArrowDown":
      return { dx: 0, dy: step };
    case "ArrowLeft":
      return { dx: -step, dy: 0 };
    case "ArrowRight":
      return { dx: step, dy: 0 };
    default:
      return null;
  }
};

export function useCanvasInteraction({ onShortcutKeyDown }: UseCanvasInteractionOptions) {
  const loadedWorkbenchId = useCanvasStore((state) => state.loadedWorkbenchId);
  const { loadedWorkbench } = useCanvasLoadedWorkbenchState();
  const { nudgeElements } = useCanvasLoadedWorkbenchStructure();
  const { selectedElementIds, setSelectedElementIds } = useCanvasSelectionActions();
  const selectedElementIdsRef = useRef(selectedElementIds);

  useEffect(() => {
    selectedElementIdsRef.current = selectedElementIds;
  }, [selectedElementIds]);

  useEffect(() => {
    if (selectedElementIds.length === 0) {
      return;
    }

    const nextSelectedElementIds = resolveSelectableSelectionIds(
      loadedWorkbench?.allNodes ?? [],
      selectedElementIds
    );
    if (!selectionIdsEqual(selectedElementIds, nextSelectedElementIds)) {
      setSelectedElementIds(nextSelectedElementIds);
    }
  }, [loadedWorkbench, selectedElementIds, setSelectedElementIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!loadedWorkbenchId) {
        return;
      }

      if (onShortcutKeyDown(event) || isCanvasTypingInProgress(event.target)) {
        return;
      }

      const nudge = resolveCanvasInteractionNudge(event);
      if (!nudge || selectedElementIdsRef.current.length === 0) {
        return;
      }

      event.preventDefault();
      void nudgeElements(selectedElementIdsRef.current, nudge.dx, nudge.dy);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [loadedWorkbenchId, nudgeElements, onShortcutKeyDown]);
}
