import type Konva from "konva";
import { useCallback, useMemo, useRef, type RefObject } from "react";
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
import type { CanvasToolName } from "../tools/toolControllers";
import type { CanvasViewportPoint, CanvasViewportTransform } from "../viewportNavigation";
import { useCanvasMarqueeSelection } from "./useCanvasMarqueeSelection";
import type { CanvasTextSessionActions } from "./useCanvasTextSession";
import { useCanvasViewportNavigation } from "./useCanvasViewportNavigation";
import { useCanvasViewportToolOrchestrator } from "./useCanvasViewportToolOrchestrator";

interface CanvasElementDragSession {
  draggedElementId: string;
  movedElementIds: string[];
  movedNodes: Map<string, Konva.Node>;
  originalPositions: Map<string, { x: number; y: number }>;
}

interface UseCanvasViewportInteractionControllerOptions {
  activeShapeType: CanvasShapeType;
  activeWorkbench: CanvasWorkbench | null;
  activeWorkbenchId: string | null;
  clearSelection: () => void;
  elementByIdRef: RefObject<Map<string, CanvasRenderableNode>>;
  executeCommand: (
    command: CanvasCommand,
    options?: { trackHistory?: boolean }
  ) => Promise<CanvasWorkbench | null>;
  fitView: CanvasViewportTransform | null;
  isSpacePressed: boolean;
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
  beginTextEdit: CanvasTextSessionActions["begin"];
}

export function useCanvasViewportInteractionController({
  activeShapeType,
  activeWorkbench,
  activeWorkbenchId,
  beginTextEdit,
  clearSelection,
  elementByIdRef,
  executeCommand,
  fitView,
  isSpacePressed,
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
      const element = elementByIdRef.current?.get(elementId);
      if (!element || element.effectiveLocked || !element.effectiveVisible) {
        return;
      }

      selectElement(elementId, { additive });
    },
    [elementByIdRef, selectElement]
  );

  const handleElementDragStart = useCallback(
    (elementId: string) => {
      const element = elementByIdRef.current?.get(elementId);
      if (!element || element.effectiveLocked || !element.effectiveVisible) {
        dragSessionRef.current = null;
        return;
      }

      const selectedRootIds = resolveSelectedRootRenderableElementIds(
        activeWorkbench,
        selectedElementIds
      );
      const stage = stageRef.current;
      const movedElementIds =
        selectedRootIds.length > 1 && selectedRootIds.includes(elementId)
          ? selectedRootIds
          : [elementId];
      const movedNodes = new Map<string, Konva.Node>();
      const originalPositions = new Map<string, { x: number; y: number }>();

      for (const movedElementId of movedElementIds) {
        const movedElement = elementByIdRef.current?.get(movedElementId);
        if (!movedElement || movedElement.effectiveLocked || !movedElement.effectiveVisible) {
          continue;
        }

        const movedNode = stage?.findOne<Konva.Node>(`#${movedElementId}`);
        if (!movedNode) {
          continue;
        }

        originalPositions.set(movedElementId, {
          x: movedElement.x,
          y: movedElement.y,
        });
        movedNodes.set(movedElementId, movedNode);
      }

      if (!originalPositions.has(elementId)) {
        originalPositions.set(elementId, {
          x: element.x,
          y: element.y,
        });
      }
      if (!movedNodes.has(elementId) && stage) {
        const draggedNode = stage.findOne<Konva.Node>(`#${elementId}`);
        if (draggedNode) {
          movedNodes.set(elementId, draggedNode);
        }
      }

      dragSessionRef.current = {
        draggedElementId: elementId,
        movedElementIds: Array.from(originalPositions.keys()),
        movedNodes,
        originalPositions,
      };
    },
    [activeWorkbench, elementByIdRef, selectedElementIds, stageRef]
  );

  const handleElementDragMove = useCallback(
    (elementId: string, x: number, y: number) => {
      const dragSession = dragSessionRef.current;
      if (
        !dragSession ||
        dragSession.draggedElementId !== elementId ||
        dragSession.movedElementIds.length <= 1
      ) {
        return;
      }

      const draggedOrigin = dragSession.originalPositions.get(elementId);
      const stage = stageRef.current;
      if (!draggedOrigin || !stage) {
        return;
      }

      const dx = x - draggedOrigin.x;
      const dy = y - draggedOrigin.y;

      for (const movedElementId of dragSession.movedElementIds) {
        if (movedElementId === elementId) {
          continue;
        }

        const movedOrigin = dragSession.originalPositions.get(movedElementId);
        const movedNode = dragSession.movedNodes.get(movedElementId);
        if (!movedOrigin || !movedNode) {
          continue;
        }

        const nextPosition = {
          x: movedOrigin.x + dx,
          y: movedOrigin.y + dy,
        };

        if (
          Math.abs(movedNode.x() - nextPosition.x) < 0.01 &&
          Math.abs(movedNode.y() - nextPosition.y) < 0.01
        ) {
          continue;
        }
        movedNode.position(nextPosition);
      }

      stage.batchDraw();
    },
    [stageRef]
  );

  const handleElementDragEnd = useCallback(
    (elementId: string, x: number, y: number) => {
      const dragSession = dragSessionRef.current;
      dragSessionRef.current = null;

      const element = elementByIdRef.current?.get(elementId);
      if (!activeWorkbenchId || !element || element.effectiveLocked || !element.effectiveVisible) {
        return;
      }

      const draggedOrigin =
        dragSession?.draggedElementId === elementId
          ? dragSession.originalPositions.get(elementId)
          : null;
      const dx = x - (draggedOrigin?.x ?? element.x);
      const dy = y - (draggedOrigin?.y ?? element.y);
      if (dx === 0 && dy === 0) {
        return;
      }

      void executeCommand({
        type: "MOVE_NODES",
        ids:
          dragSession?.draggedElementId === elementId && dragSession.movedElementIds.length > 0
            ? dragSession.movedElementIds
            : [elementId],
        dx,
        dy,
      });
    },
    [activeWorkbenchId, elementByIdRef, executeCommand]
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
