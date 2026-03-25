import type Konva from "konva";
import { useCallback, useMemo, type RefObject } from "react";
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
import type { CanvasToolName } from "../tools/toolControllers";
import type { CanvasViewportPoint, CanvasViewportTransform } from "../viewportNavigation";
import { useCanvasMarqueeSelection } from "./useCanvasMarqueeSelection";
import type { CanvasTextSessionActions } from "./useCanvasTextSession";
import { useCanvasViewportNavigation } from "./useCanvasViewportNavigation";
import { useCanvasViewportToolOrchestrator } from "./useCanvasViewportToolOrchestrator";

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

  const handleElementDragEnd = useCallback(
    (elementId: string, x: number, y: number) => {
      const element = elementByIdRef.current?.get(elementId);
      if (!activeWorkbenchId || !element || element.effectiveLocked || !element.effectiveVisible) {
        return;
      }

      const dx = x - element.x;
      const dy = y - element.y;
      if (dx === 0 && dy === 0) {
        return;
      }

      void executeCommand({
        type: "MOVE_NODES",
        ids: [elementId],
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
