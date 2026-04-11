import type Konva from "konva";
import { useCallback, useMemo, type RefObject } from "react";
import type {
  CanvasShapeElement,
  CanvasShapeType,
  CanvasTextElement,
  CanvasWorkbench,
} from "@/types";
import { WORKSPACE_BACKGROUND_NODE_ID } from "../canvasViewportConstants";
import { isEditableActiveElement } from "../domEditableFocus";
import {
  resolveCanvasToolController,
  type CanvasToolActionPort,
  type CanvasToolName,
  type CanvasToolPoint,
} from "../tools/toolControllers";

interface UseCanvasViewportToolOrchestratorOptions {
  activeShapeType: CanvasShapeType;
  activeWorkbench: CanvasWorkbench | null;
  activeWorkbenchId: string | null;
  beginMarqueeInteraction: (payload: {
    additive: boolean;
    canvasPoint: CanvasToolPoint;
    screenPoint: CanvasToolPoint;
  }) => void;
  beginPanInteraction: (screenPoint: CanvasToolPoint) => void;
  beginTextEdit: (element: CanvasTextElement, options?: { mode?: "existing" | "create" }) => void;
  clearSelection: () => void;
  commitMarqueeInteraction: (payload: {
    canvasPoint: CanvasToolPoint | null;
    screenPoint: CanvasToolPoint | null;
  }) => void;
  endPanInteraction: () => void;
  insertShapeElement: (element: CanvasShapeElement) => void;
  selectElement: (elementId: string) => void;
  setTool: (tool: CanvasToolName) => void;
  shouldPan: boolean;
  stageRef: RefObject<Konva.Stage>;
  suppressElementActivation: () => void;
  toCanvasPoint: (stage: Konva.Stage) => CanvasToolPoint | null;
  toScreenPoint: (stage: Konva.Stage) => CanvasToolPoint | null;
  tool: CanvasToolName;
  updateMarqueeInteraction: (payload: {
    canvasPoint: CanvasToolPoint;
    screenPoint: CanvasToolPoint;
  }) => void;
  updatePanInteraction: (screenPoint: CanvasToolPoint) => void;
}

interface UseCanvasViewportToolOrchestratorResult {
  handleWorkspacePointerDown: (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  handleWorkspacePointerMove: (event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  handleWorkspacePointerUp: (event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
}

const resolveCanvasWorkspacePointerTarget = (
  stage: Konva.Stage,
  fallbackTarget: Konva.Node
) => {
  const pointer = stage.getPointerPosition();
  if (!pointer) {
    return fallbackTarget;
  }

  return stage.getIntersection(pointer) ?? fallbackTarget;
};

export const isCanvasWorkspaceBackgroundTarget = (
  stage: Konva.Stage,
  target: Konva.Node
) => {
  const resolvedTarget = resolveCanvasWorkspacePointerTarget(stage, target);
  return (
    resolvedTarget === stage ||
    resolvedTarget.getType() === "Layer" ||
    resolvedTarget.id() === WORKSPACE_BACKGROUND_NODE_ID
  );
};

export function useCanvasViewportToolOrchestrator({
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
  selectElement,
  setTool,
  shouldPan,
  stageRef,
  suppressElementActivation,
  toCanvasPoint,
  toScreenPoint,
  tool,
  updateMarqueeInteraction,
  updatePanInteraction,
}: UseCanvasViewportToolOrchestratorOptions): UseCanvasViewportToolOrchestratorResult {
  const activeToolController = useMemo(
    () => resolveCanvasToolController(tool, shouldPan),
    [shouldPan, tool]
  );

  const actionPort = useMemo<CanvasToolActionPort>(
    () => ({
      marquee: {
        beginSelection: beginMarqueeInteraction,
        commitSelection: commitMarqueeInteraction,
        updateSelection: updateMarqueeInteraction,
      },
      pan: {
        begin: beginPanInteraction,
        end: endPanInteraction,
        update: updatePanInteraction,
      },
      selection: {
        clear: clearSelection,
        select: (elementId: string) => {
          selectElement(elementId);
        },
        suppressElementActivation,
      },
      shape: {
        activeShapeType,
        insert: insertShapeElement,
      },
      text: {
        beginEdit: beginTextEdit,
      },
      toolState: {
        setTool,
      },
      workbench: {
        activeWorkbenchId,
      },
    }),
    [
      activeShapeType,
      activeWorkbenchId,
      beginMarqueeInteraction,
      beginPanInteraction,
      beginTextEdit,
      clearSelection,
      commitMarqueeInteraction,
      endPanInteraction,
      insertShapeElement,
      selectElement,
      setTool,
      suppressElementActivation,
      updateMarqueeInteraction,
      updatePanInteraction,
    ]
  );

  const handleWorkspacePointerDown = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = stageRef.current;
      if (!stage || !activeWorkbench) {
        return;
      }

      // If the user is currently typing into a DOM editable (text-session
      // editor, inline input in a floating panel, etc.), defer to that focus.
      // A sibling capture-phase listener on document will commit/cancel the
      // edit for us; Konva should not race it by starting a marquee or
      // mutating selection here. The user can click again after the commit
      // lands to pick the next action.
      if (isEditableActiveElement()) {
        return;
      }

      stage.setPointersPositions(event.evt);
      const isBackgroundTarget = isCanvasWorkspaceBackgroundTarget(stage, event.target);

      event.evt.preventDefault();
      activeToolController.onPointerDown(actionPort, {
        additive: Boolean(event.evt.shiftKey),
        canvasPoint: toCanvasPoint(stage),
        isBackgroundTarget,
        screenPoint: toScreenPoint(stage),
      });
    },
    [
      activeToolController,
      actionPort,
      activeWorkbench,
      stageRef,
      toCanvasPoint,
      toScreenPoint,
    ]
  );

  const handleWorkspacePointerMove = useCallback(
    (event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = stageRef.current;
      if (!stage || !activeToolController.onPointerMove) {
        return;
      }

      event?.evt.preventDefault();
      activeToolController.onPointerMove(actionPort, {
        canvasPoint: toCanvasPoint(stage),
        screenPoint: toScreenPoint(stage),
      });
    },
    [activeToolController, actionPort, stageRef, toCanvasPoint, toScreenPoint]
  );

  const handleWorkspacePointerUp = useCallback(
    (event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!activeToolController.onPointerUp && !shouldPan) {
        return;
      }

      event?.evt.preventDefault();
      const stage = stageRef.current;
      activeToolController.onPointerUp?.(actionPort, {
        canvasPoint: stage ? toCanvasPoint(stage) : null,
        screenPoint: stage ? toScreenPoint(stage) : null,
      });
    },
    [activeToolController, actionPort, shouldPan, stageRef, toCanvasPoint, toScreenPoint]
  );

  return {
    handleWorkspacePointerDown,
    handleWorkspacePointerMove,
    handleWorkspacePointerUp,
  };
}
