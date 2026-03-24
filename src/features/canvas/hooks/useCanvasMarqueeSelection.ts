import type Konva from "konva";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { unstable_batchedUpdates } from "react-dom";
import type { CanvasRenderableElement } from "@/types";
import { useCanvasSelectionPreview } from "@/features/canvas/runtime/canvasRuntimeHooks";
import type { CanvasOverlayRect } from "../overlayGeometry";
import {
  isSelectableSelectionTarget,
  normalizeSelectionRect,
  resolveCompletedMarqueeSelectionIds,
  resolveMarqueeSelectionIds,
  screenRectToWorldRect,
  selectionDistanceExceedsThreshold,
  type CanvasSelectionPoint,
  type CanvasSelectionTarget,
} from "../selectionGeometry";
import { selectionIdsEqual } from "../selectionModel";
import type { CanvasToolName } from "../tools/toolControllers";

interface MarqueeSelectionState {
  additive: boolean;
  baseSelectedIds: string[];
  currentCanvas: CanvasSelectionPoint;
  currentScreen: CanvasSelectionPoint;
  hasActivated: boolean;
  startCanvas: CanvasSelectionPoint;
  startScreen: CanvasSelectionPoint;
}

export interface MarqueeSelectionRenderState {
  hasSession: boolean;
  isDragging: boolean;
  rect: CanvasOverlayRect | null;
}

interface UseCanvasMarqueeSelectionOptions {
  activeWorkbench: {
    elements: CanvasRenderableElement[];
  } | null;
  activeWorkbenchId: string | null;
  stageRef: RefObject<Konva.Stage>;
  tool: CanvasToolName;
  viewport: CanvasSelectionPoint;
  zoom: number;
  selectedElementIds: string[];
  setSelectedElementIds: (ids: string[]) => void;
}

interface UseCanvasMarqueeSelectionResult {
  beginMarqueeInteraction: (payload: {
    additive: boolean;
    canvasPoint: CanvasSelectionPoint;
    screenPoint: CanvasSelectionPoint;
  }) => void;
  commitMarqueeInteraction: (payload: {
    canvasPoint: CanvasSelectionPoint | null;
    screenPoint: CanvasSelectionPoint | null;
  }) => void;
  hasMarqueeSession: boolean;
  isMarqueeDragging: boolean;
  marqueeRenderState: MarqueeSelectionRenderState;
  updateMarqueeInteraction: (payload: {
    canvasPoint: CanvasSelectionPoint;
    screenPoint: CanvasSelectionPoint;
  }) => void;
}

const MARQUEE_DRAG_THRESHOLD_PX = 4;

const EMPTY_MARQUEE_RENDER_STATE: MarqueeSelectionRenderState = {
  hasSession: false,
  isDragging: false,
  rect: null,
};

const marqueeRenderStateEqual = (
  left: MarqueeSelectionRenderState,
  right: MarqueeSelectionRenderState
) => {
  const rectsEqual =
    left.rect === right.rect ||
    (!!left.rect &&
      !!right.rect &&
      Math.abs(left.rect.x - right.rect.x) < 0.5 &&
      Math.abs(left.rect.y - right.rect.y) < 0.5 &&
      Math.abs(left.rect.width - right.rect.width) < 0.5 &&
      Math.abs(left.rect.height - right.rect.height) < 0.5);

  if (!rectsEqual) {
    return false;
  }

  return left.hasSession === right.hasSession && left.isDragging === right.isDragging;
};

const getSelectionOverlayRect = (node: Konva.Node): CanvasOverlayRect => {
  const rect = node.getClientRect({
    skipShadow: true,
    skipStroke: true,
  });

  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
};

export function useCanvasMarqueeSelection({
  activeWorkbench,
  activeWorkbenchId,
  stageRef,
  tool,
  viewport,
  zoom,
  selectedElementIds,
  setSelectedElementIds,
}: UseCanvasMarqueeSelectionOptions): UseCanvasMarqueeSelectionResult {
  const { clearSelectionPreview, setSelectionPreviewElementIds } =
    useCanvasSelectionPreview();
  const [marqueeRenderState, setMarqueeRenderState] = useState<MarqueeSelectionRenderState>(
    EMPTY_MARQUEE_RENDER_STATE
  );
  const marqueeRenderFrameRef = useRef<number | null>(null);
  const marqueeSelectionRef = useRef<MarqueeSelectionState | null>(null);
  const marqueeSelectionTargetsRef = useRef<CanvasSelectionTarget[]>([]);
  const selectedElementIdsRef = useRef(selectedElementIds);

  useEffect(() => {
    selectedElementIdsRef.current = selectedElementIds;
  }, [selectedElementIds]);

  const cancelQueuedMarqueeSelection = useCallback(() => {
    if (marqueeRenderFrameRef.current === null) {
      return;
    }

    cancelAnimationFrame(marqueeRenderFrameRef.current);
    marqueeRenderFrameRef.current = null;
  }, []);

  const resetMarqueeInteraction = useCallback(() => {
    cancelQueuedMarqueeSelection();
    marqueeSelectionRef.current = null;
    marqueeSelectionTargetsRef.current = [];
    unstable_batchedUpdates(() => {
      clearSelectionPreview();
      setMarqueeRenderState((current) =>
        marqueeRenderStateEqual(current, EMPTY_MARQUEE_RENDER_STATE)
          ? current
          : EMPTY_MARQUEE_RENDER_STATE
      );
    });
  }, [cancelQueuedMarqueeSelection, clearSelectionPreview]);

  useEffect(() => {
    resetMarqueeInteraction();
  }, [activeWorkbenchId, resetMarqueeInteraction]);

  const commitSelectedElementIds = useCallback(
    (nextSelectedIds: string[]) => {
      if (selectionIdsEqual(selectedElementIdsRef.current, nextSelectedIds)) {
        return;
      }

      selectedElementIdsRef.current = nextSelectedIds;
      setSelectedElementIds(nextSelectedIds);
    },
    [setSelectedElementIds]
  );

  const buildMarqueeSelectionTargets = useCallback(() => {
    const stage = stageRef.current;
    if (!activeWorkbench || !stage) {
      return [];
    }

    const nextTargets: CanvasSelectionTarget[] = [];
    for (const element of activeWorkbench.elements) {
      if (!isSelectableSelectionTarget(element)) {
        continue;
      }

      const node = stage.findOne(`#${element.id}`);
      if (!node) {
        continue;
      }

      nextTargets.push({
        id: element.id,
        rect: screenRectToWorldRect(getSelectionOverlayRect(node), viewport, zoom),
      });
    }

    return nextTargets;
  }, [activeWorkbench, stageRef, viewport, zoom]);

  const resolveMarqueeStateSelectionIds = useCallback(
    (state: MarqueeSelectionState) => {
      const selectionRect = normalizeSelectionRect(state.startCanvas, state.currentCanvas);
      const targets =
        marqueeSelectionTargetsRef.current.length > 0
          ? marqueeSelectionTargetsRef.current
          : buildMarqueeSelectionTargets();

      if (marqueeSelectionTargetsRef.current.length === 0) {
        marqueeSelectionTargetsRef.current = targets;
      }

      return resolveMarqueeSelectionIds(
        selectionRect,
        targets,
        state.baseSelectedIds,
        state.additive
      );
    },
    [buildMarqueeSelectionTargets]
  );

  const queueMarqueeRenderState = useCallback(() => {
    if (marqueeRenderFrameRef.current !== null) {
      return;
    }

    marqueeRenderFrameRef.current = requestAnimationFrame(() => {
      marqueeRenderFrameRef.current = null;
      const nextState = marqueeSelectionRef.current;
      if (!nextState) {
        return;
      }

      const nextPreviewSelectedIds = nextState.hasActivated
        ? resolveMarqueeStateSelectionIds(nextState)
        : null;
      const nextRenderState: MarqueeSelectionRenderState = {
        hasSession: true,
        isDragging: nextState.hasActivated,
        rect: nextState.hasActivated
          ? normalizeSelectionRect(nextState.startCanvas, nextState.currentCanvas)
          : null,
      };

      unstable_batchedUpdates(() => {
        setSelectionPreviewElementIds(nextPreviewSelectedIds);
        setMarqueeRenderState((current) =>
          marqueeRenderStateEqual(current, nextRenderState) ? current : nextRenderState
        );
      });
    });
  }, [resolveMarqueeStateSelectionIds, setSelectionPreviewElementIds]);

  const beginMarqueeInteraction = useCallback(
    ({
      additive,
      canvasPoint,
      screenPoint,
    }: {
      additive: boolean;
      canvasPoint: CanvasSelectionPoint;
      screenPoint: CanvasSelectionPoint;
    }) => {
      const baseSelectedIds = additive ? selectedElementIdsRef.current : [];
      marqueeSelectionRef.current = {
        additive,
        baseSelectedIds,
        currentCanvas: canvasPoint,
        currentScreen: screenPoint,
        hasActivated: false,
        startCanvas: canvasPoint,
        startScreen: screenPoint,
      };
      marqueeSelectionTargetsRef.current = [];
      cancelQueuedMarqueeSelection();
      unstable_batchedUpdates(() => {
        clearSelectionPreview();
        setMarqueeRenderState((current) => {
          const nextRenderState: MarqueeSelectionRenderState = {
            hasSession: true,
            isDragging: false,
            rect: null,
          };

          return marqueeRenderStateEqual(current, nextRenderState) ? current : nextRenderState;
        });
      });
    },
    [cancelQueuedMarqueeSelection, clearSelectionPreview]
  );

  const updateMarqueeInteraction = useCallback(
    ({
      canvasPoint,
      screenPoint,
    }: {
      canvasPoint: CanvasSelectionPoint;
      screenPoint: CanvasSelectionPoint;
    }) => {
      const currentSelection = marqueeSelectionRef.current;
      if (!currentSelection) {
        return;
      }

      const nextSelectionDraft: MarqueeSelectionState = {
        ...currentSelection,
        currentCanvas: canvasPoint,
        currentScreen: screenPoint,
      };
      const nextSelection: MarqueeSelectionState = {
        ...nextSelectionDraft,
        hasActivated:
          currentSelection.hasActivated ||
          selectionDistanceExceedsThreshold(
            nextSelectionDraft.startScreen,
            nextSelectionDraft.currentScreen,
            MARQUEE_DRAG_THRESHOLD_PX
          ),
      };

      marqueeSelectionRef.current = nextSelection;
      if (!nextSelection.hasActivated) {
        return;
      }

      queueMarqueeRenderState();
      if (marqueeSelectionTargetsRef.current.length === 0) {
        marqueeSelectionTargetsRef.current = buildMarqueeSelectionTargets();
      }
    },
    [buildMarqueeSelectionTargets, queueMarqueeRenderState]
  );

  const commitMarqueeInteraction = useCallback(
    ({
      canvasPoint,
      screenPoint,
    }: {
      canvasPoint: CanvasSelectionPoint | null;
      screenPoint: CanvasSelectionPoint | null;
    }) => {
      const currentSelection = marqueeSelectionRef.current;
      if (!currentSelection) {
        return;
      }

      const nextSelection =
        canvasPoint && screenPoint
          ? {
              ...currentSelection,
              currentCanvas: canvasPoint,
              currentScreen: screenPoint,
            }
          : currentSelection;

      cancelQueuedMarqueeSelection();
      const nextPreviewSelectedIds = nextSelection.hasActivated
        ? resolveMarqueeStateSelectionIds(nextSelection)
        : nextSelection.baseSelectedIds;
      const nextSelectedIds = resolveCompletedMarqueeSelectionIds({
        additive: nextSelection.additive,
        baseSelectedIds: nextSelection.baseSelectedIds,
        hasActivated: nextSelection.hasActivated,
        nextSelectedIds: nextPreviewSelectedIds,
      });

      unstable_batchedUpdates(() => {
        commitSelectedElementIds(nextSelectedIds);
        clearSelectionPreview();
        setMarqueeRenderState((current) =>
          marqueeRenderStateEqual(current, EMPTY_MARQUEE_RENDER_STATE)
            ? current
            : EMPTY_MARQUEE_RENDER_STATE
        );
      });

      marqueeSelectionRef.current = null;
      marqueeSelectionTargetsRef.current = [];
    },
    [
      cancelQueuedMarqueeSelection,
      clearSelectionPreview,
      commitSelectedElementIds,
      resolveMarqueeStateSelectionIds,
    ]
  );

  useEffect(() => {
    if (tool === "select") {
      return;
    }

    resetMarqueeInteraction();
  }, [resetMarqueeInteraction, tool]);

  useEffect(
    () => () => {
      cancelQueuedMarqueeSelection();
      clearSelectionPreview();
    },
    [cancelQueuedMarqueeSelection, clearSelectionPreview]
  );

  return {
    beginMarqueeInteraction,
    commitMarqueeInteraction,
    hasMarqueeSession: marqueeRenderState.hasSession,
    isMarqueeDragging: marqueeRenderState.isDragging,
    marqueeRenderState,
    updateMarqueeInteraction,
  };
}
