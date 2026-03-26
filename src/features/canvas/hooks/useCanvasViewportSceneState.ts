import { useEffect, useMemo, useRef } from "react";
import type {
  CanvasRenderableTextElement,
  CanvasWorkbench,
} from "@/types";
import { getVisibleWorldGridBounds } from "../grid";

interface UseCanvasViewportSceneStateOptions {
  activeWorkbench: CanvasWorkbench | null;
  displaySelectedElementIds: string[];
  selectedElementIds: string[];
  stageSize: {
    width: number;
    height: number;
  };
  viewport: {
    x: number;
    y: number;
  };
  zoom: number;
}

export function useCanvasViewportSceneState({
  activeWorkbench,
  displaySelectedElementIds,
  selectedElementIds,
  stageSize,
  viewport,
  zoom,
}: UseCanvasViewportSceneStateOptions) {
  const elementById = useMemo(
    () => new Map((activeWorkbench?.allNodes ?? []).map((element) => [element.id, element])),
    [activeWorkbench?.allNodes]
  );
  const elementByIdRef = useRef(elementById);

  useEffect(() => {
    elementByIdRef.current = elementById;
  }, [elementById]);

  const interactivePreviewElementId = useMemo(
    () => (displaySelectedElementIds.length === 1 ? displaySelectedElementIds[0]! : null),
    [displaySelectedElementIds]
  );

  const singleSelectedElement = useMemo(() => {
    if (selectedElementIds.length !== 1) {
      return null;
    }

    return elementById.get(selectedElementIds[0]!) ?? null;
  }, [elementById, selectedElementIds]);

  const singleSelectedTextElement = useMemo<CanvasRenderableTextElement | null>(
    () => (singleSelectedElement?.type === "text" ? singleSelectedElement : null),
    [singleSelectedElement]
  );
  const singleSelectedNonTextElement = useMemo(
    () =>
      singleSelectedElement && singleSelectedElement.type !== "text"
        ? singleSelectedElement
        : null,
    [singleSelectedElement]
  );

  const thirdsGuideLines = useMemo(() => {
    if (!activeWorkbench || !activeWorkbench.guides.showThirds) {
      return [];
    }

    return [
      [activeWorkbench.width / 3, 0, activeWorkbench.width / 3, activeWorkbench.height],
      [(activeWorkbench.width * 2) / 3, 0, (activeWorkbench.width * 2) / 3, activeWorkbench.height],
      [0, activeWorkbench.height / 3, activeWorkbench.width, activeWorkbench.height / 3],
      [0, (activeWorkbench.height * 2) / 3, activeWorkbench.width, (activeWorkbench.height * 2) / 3],
    ];
  }, [activeWorkbench]);

  const centerGuideLines = useMemo(() => {
    if (!activeWorkbench || !activeWorkbench.guides.showCenter) {
      return [];
    }

    return [
      [activeWorkbench.width / 2, 0, activeWorkbench.width / 2, activeWorkbench.height],
      [0, activeWorkbench.height / 2, activeWorkbench.width, activeWorkbench.height / 2],
    ];
  }, [activeWorkbench]);

  const workspaceGridBounds = useMemo(
    () => getVisibleWorldGridBounds(viewport, zoom, stageSize),
    [stageSize, viewport, zoom]
  );

  return {
    centerGuideLines,
    elementById,
    elementByIdRef,
    interactivePreviewElementId,
    singleSelectedElement,
    singleSelectedNonTextElement,
    singleSelectedTextElement,
    thirdsGuideLines,
    workspaceGridBounds,
  };
}
