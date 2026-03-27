import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import type {
  CanvasCommand,
  CanvasRenderableNode,
  CanvasShapeElement,
  CanvasShapeType,
  CanvasTextElement,
  CanvasWorkbench,
} from "@/types";
import { isCanvasTextElementEditable } from "../elements/TextElement";
import { quantizeDragPosition } from "../grid";
import { resolveSelectedRootRenderableElementIds } from "../selectionModel";
import {
  shouldCanvasToolSelectElements,
  type CanvasToolName,
} from "../tools/toolControllers";
import type { CanvasViewportPoint, CanvasViewportTransform } from "../viewportNavigation";
import { useCanvasMarqueeSelection } from "./useCanvasMarqueeSelection";
import type { CanvasTextSessionActions } from "./useCanvasTextSession";
import { useCanvasViewportNavigation } from "./useCanvasViewportNavigation";
import { useCanvasViewportToolOrchestrator } from "./useCanvasViewportToolOrchestrator";

interface CanvasElementDragSession {
  commitInteraction: (interactionId: string) => Promise<CanvasWorkbench | null>;
  draggedElementId: string;
  interactionId: string | null;
  lastPreviewPosition: { x: number; y: number };
  latestDragPosition: { x: number; y: number };
  movedElementIds: string[];
  previewCommand: (interactionId: string, command: CanvasCommand) => CanvasWorkbench | null;
  previewFrameId: number | null;
  rollbackInteraction: (interactionId: string) => CanvasWorkbench | null;
  sourceWorkbenchId: string | null;
}

interface UseCanvasViewportInteractionControllerOptions {
  activeShapeType: CanvasShapeType;
  activeWorkbench: CanvasWorkbench | null;
  activeWorkbenchId: string | null;
  beginInteraction: () => { interactionId: string } | null;
  beginTextEdit: CanvasTextSessionActions["begin"];
  clearSelection: () => void;
  commitInteraction: (interactionId: string) => Promise<CanvasWorkbench | null>;
  elementByIdRef: RefObject<Map<string, CanvasRenderableNode>>;
  fitView: CanvasViewportTransform | null;
  isSpacePressed: boolean;
  onInteractionError: (message: string) => void;
  previewCommand: (interactionId: string, command: CanvasCommand) => CanvasWorkbench | null;
  rollbackInteraction: (interactionId: string) => CanvasWorkbench | null;
  selectElement: (elementId: string, options?: { additive?: boolean }) => void;
  selectedElementIds: string[];
  setSelectedElementIds: (ids: string[]) => void;
  setTool: (tool: CanvasToolName) => void;
  setViewport: (viewport: CanvasViewportPoint) => void;
  setZoom: (zoom: number) => void;
  stageRef: RefObject<Konva.Stage>;
  stageSize: {
    width: number;
    height: number;
  };
  tool: CanvasToolName;
  upsertElement: (element: CanvasShapeElement) => Promise<void>;
  viewport: CanvasViewportPoint;
  viewportContainerRef: RefObject<HTMLDivElement>;
  zoom: number;
}

export function useCanvasViewportInteractionController({
  activeShapeType,
  activeWorkbench,
  activeWorkbenchId,
  beginInteraction,
  beginTextEdit,
  clearSelection,
  commitInteraction,
  elementByIdRef,
  fitView,
  isSpacePressed,
  onInteractionError,
  previewCommand,
  rollbackInteraction,
  selectElement,
  selectedElementIds,
  setSelectedElementIds,
  setTool,
  setViewport,
  setZoom,
  stageRef,
  stageSize,
  tool,
  upsertElement,
  viewport,
  viewportContainerRef,
  zoom,
}: UseCanvasViewportInteractionControllerOptions) {
  const dragSessionRef = useRef<CanvasElementDragSession | null>(null);
  const shouldPan = tool === "hand" || isSpacePressed;
  const {
    adjustZoom,
    beginPanInteraction,
    cursor,
    endPanInteraction,
    handleStageWheel,
    resetView,
    toCanvasPoint,
    toScreenPoint,
    updatePanInteraction,
  } = useCanvasViewportNavigation({
    fitView,
    shouldPan,
    stageRef,
    viewport,
    zoom,
    setViewport,
    setZoom,
  });
  const {
    beginMarqueeInteraction,
    commitMarqueeInteraction,
    hasMarqueeSession,
    isMarqueeDragging,
    marqueeRenderState,
    updateMarqueeInteraction,
  } = useCanvasMarqueeSelection({
    activeWorkbench,
    activeWorkbenchId,
    stageRef,
    tool,
    viewport,
    zoom,
    selectedElementIds,
    setSelectedElementIds,
  });

  const dragBoundFunc = useCallback(
    (position: { x: number; y: number }) => quantizeDragPosition(position),
    []
  );

  const insertShapeElement = useCallback(
    (element: CanvasShapeElement) => {
      if (!activeWorkbenchId) {
        return;
      }

      void upsertElement(element);
    },
    [activeWorkbenchId, upsertElement]
  );

  const {
    handleWorkspacePointerDown,
    handleWorkspacePointerMove,
    handleWorkspacePointerUp,
  } = useCanvasViewportToolOrchestrator({
    activeShapeType,
    activeWorkbench,
    activeWorkbenchId,
    beginMarqueeInteraction,
    beginPanInteraction,
    beginTextEdit,
    clearSelection,
    commitMarqueeInteraction,
    endPanInteraction,
    insertShapeElement,
    selectElement: (elementId: string) => {
      selectElement(elementId);
    },
    setTool,
    shouldPan,
    stageRef,
    toCanvasPoint,
    toScreenPoint,
    tool,
    updateMarqueeInteraction,
    updatePanInteraction,
  });

  const handleElementSelect = useCallback(
    (elementId: string, additive: boolean) => {
      if (
        !shouldCanvasToolSelectElements({
          shouldPan,
          tool,
        })
      ) {
        return;
      }

      const element = elementByIdRef.current?.get(elementId);
      if (!element || element.effectiveLocked || !element.effectiveVisible) {
        return;
      }

      selectElement(elementId, { additive });
    },
    [elementByIdRef, selectElement, shouldPan, tool]
  );
  const canManipulateElements = shouldCanvasToolSelectElements({
    shouldPan,
    tool,
  });

  const flushDragPreview = useCallback(
    (dragSession: CanvasElementDragSession) => {
      if (!dragSession.interactionId) {
        return true;
      }

      const dx = dragSession.latestDragPosition.x - dragSession.lastPreviewPosition.x;
      const dy = dragSession.latestDragPosition.y - dragSession.lastPreviewPosition.y;
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
        return true;
      }

      const nextWorkbench = dragSession.previewCommand(dragSession.interactionId, {
        type: "MOVE_NODES",
        ids: dragSession.movedElementIds,
        dx,
        dy,
      });
      if (!nextWorkbench) {
        dragSession.rollbackInteraction(dragSession.interactionId);
        dragSession.interactionId = null;
        return false;
      }

      dragSession.lastPreviewPosition = {
        ...dragSession.latestDragPosition,
      };
      return true;
    },
    []
  );

  const scheduleDragPreview = useCallback(
    (dragSession: CanvasElementDragSession) => {
      if (dragSession.previewFrameId !== null) {
        return;
      }

      dragSession.previewFrameId = window.requestAnimationFrame(() => {
        dragSession.previewFrameId = null;
        if (!flushDragPreview(dragSession)) {
          onInteractionError("Drag preview failed and was rolled back.");
        }
      });
    },
    [flushDragPreview, onInteractionError]
  );

  useEffect(
    () => () => {
      const dragSession = dragSessionRef.current;
      if (!dragSession) {
        return;
      }

      if (dragSession.previewFrameId !== null) {
        window.cancelAnimationFrame(dragSession.previewFrameId);
      }
      if (dragSession.interactionId) {
        dragSession.rollbackInteraction(dragSession.interactionId);
      }
      dragSessionRef.current = null;
    },
    []
  );

  useEffect(() => {
    const dragSession = dragSessionRef.current;
    if (!dragSession) {
      return;
    }

    if (dragSession.sourceWorkbenchId === activeWorkbenchId) {
      return;
    }

    if (dragSession.previewFrameId !== null) {
      window.cancelAnimationFrame(dragSession.previewFrameId);
    }
    if (dragSession.interactionId) {
      dragSession.rollbackInteraction(dragSession.interactionId);
    }
    dragSessionRef.current = null;
  }, [activeWorkbenchId]);

  const handleElementDragStart = useCallback(
    (elementId: string, event: Konva.KonvaEventObject<DragEvent>) => {
      const element = elementByIdRef.current?.get(elementId);
      if (!element || element.effectiveLocked || !element.effectiveVisible) {
        dragSessionRef.current = null;
        return;
      }

      const selectedRootIds = resolveSelectedRootRenderableElementIds(
        activeWorkbench,
        selectedElementIds
      );
      const movedElementIds =
        selectedRootIds.length > 1 && selectedRootIds.includes(elementId)
          ? selectedRootIds
          : [elementId];
      const elementIdSet = new Set(movedElementIds);
      const validMovedIds = movedElementIds.filter((movedElementId) => {
        const movedElement = elementByIdRef.current?.get(movedElementId);
        return Boolean(
          movedElement &&
            !movedElement.effectiveLocked &&
            movedElement.effectiveVisible &&
            elementIdSet.has(movedElementId)
        );
      });
      const draggedPosition = {
        x: element.x,
        y: element.y,
      };
      const interaction = beginInteraction();
      if (!interaction) {
        event.target.stopDrag();
        event.target.position(draggedPosition);
        event.target.getLayer()?.batchDraw();
        dragSessionRef.current = null;
        return;
      }

      dragSessionRef.current = {
        commitInteraction,
        draggedElementId: elementId,
        interactionId: interaction.interactionId,
        lastPreviewPosition: draggedPosition,
        latestDragPosition: draggedPosition,
        movedElementIds: validMovedIds.length > 0 ? validMovedIds : [elementId],
        previewCommand,
        previewFrameId: null,
        rollbackInteraction,
        sourceWorkbenchId: activeWorkbenchId,
      };
    },
    [
      activeWorkbench,
      activeWorkbenchId,
      beginInteraction,
      commitInteraction,
      elementByIdRef,
      previewCommand,
      rollbackInteraction,
      selectedElementIds,
    ]
  );

  const handleElementDragMove = useCallback(
    (elementId: string, x: number, y: number) => {
      const dragSession = dragSessionRef.current;
      if (!dragSession || dragSession.draggedElementId !== elementId) {
        return;
      }

      dragSession.latestDragPosition = { x, y };
      scheduleDragPreview(dragSession);
    },
    [scheduleDragPreview]
  );

  const handleElementDragEnd = useCallback(
    (elementId: string, x: number, y: number) => {
      const dragSession = dragSessionRef.current;
      dragSessionRef.current = null;

      const element = elementByIdRef.current?.get(elementId);
      if (!activeWorkbenchId || !element || element.effectiveLocked || !element.effectiveVisible) {
        return;
      }

      if (!dragSession || dragSession.draggedElementId !== elementId) {
        return;
      }

      dragSession.latestDragPosition = { x, y };
      if (dragSession.previewFrameId !== null) {
        window.cancelAnimationFrame(dragSession.previewFrameId);
        dragSession.previewFrameId = null;
      }

      if (!flushDragPreview(dragSession)) {
        onInteractionError("Drag preview failed and was rolled back.");
        return;
      }
      if (!dragSession.interactionId) {
        return;
      }

      void dragSession.commitInteraction(dragSession.interactionId)
        .then((nextWorkbench) => {
          if (!nextWorkbench) {
            onInteractionError("Drag commit failed and was rolled back.");
          }
        })
        .catch(() => {
          onInteractionError("Drag commit failed and was rolled back.");
        });
    },
    [
      activeWorkbenchId,
      elementByIdRef,
      flushDragPreview,
      onInteractionError,
    ]
  );

  const handleTextElementDoubleClick = useCallback(
    (elementId: string) => {
      const element = elementByIdRef.current?.get(elementId);
      if (!element?.type || element.type !== "text" || !isCanvasTextElementEditable(element)) {
        return;
      }

      beginTextEdit(element as CanvasTextElement);
    },
    [beginTextEdit, elementByIdRef]
  );

  const controls = useMemo(
    () => ({
      adjustZoom,
      resetView,
      shouldPan,
    }),
    [adjustZoom, resetView, shouldPan]
  );

  const marquee = useMemo(
    () => ({
      hasMarqueeSession,
      isMarqueeDragging,
      marqueeRect: marqueeRenderState.rect,
    }),
    [hasMarqueeSession, isMarqueeDragging, marqueeRenderState.rect]
  );

  const stage = useMemo(
    () => ({
      containerRef: viewportContainerRef,
      cursor,
      canManipulateElements,
      dragBoundFunc,
      handleElementDragMove,
      handleElementDragStart,
      handleElementDragEnd,
      handleElementSelect,
      handleStageWheel,
      handleTextElementDoubleClick,
      handleWorkspacePointerDown,
      handleWorkspacePointerMove,
      handleWorkspacePointerUp,
      stageRef,
      stageSize,
      viewport,
      zoom,
    }),
    [
      canManipulateElements,
      cursor,
      dragBoundFunc,
      handleElementDragMove,
      handleElementDragStart,
      handleElementDragEnd,
      handleElementSelect,
      handleStageWheel,
      handleTextElementDoubleClick,
      handleWorkspacePointerDown,
      handleWorkspacePointerMove,
      handleWorkspacePointerUp,
      stageRef,
      stageSize,
      viewport,
      viewportContainerRef,
      zoom,
    ]
  );

  return {
    controls,
    marquee,
    stage,
  };
}
