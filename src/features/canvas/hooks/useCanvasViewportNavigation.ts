import type Konva from "konva";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  resolveCanvasPointFromScreen,
  resolveCanvasZoomStep,
  resolveViewportAfterZoom,
  type CanvasViewportPoint,
  type CanvasViewportTransform,
} from "../viewportNavigation";

interface UseCanvasViewportNavigationOptions {
  fitView: CanvasViewportTransform | null;
  shouldPan: boolean;
  stageRef: RefObject<Konva.Stage>;
  viewport: CanvasViewportPoint;
  zoom: number;
  setViewport: (viewport: CanvasViewportPoint) => void;
  setZoom: (zoom: number) => void;
}

interface UseCanvasViewportNavigationResult {
  adjustZoom: (direction: "in" | "out") => void;
  beginPanInteraction: (screenPoint: CanvasViewportPoint) => void;
  cursor: string;
  endPanInteraction: () => void;
  handleStageWheel: (event: Konva.KonvaEventObject<WheelEvent>) => void;
  resetView: () => void;
  toCanvasPoint: (stage: Konva.Stage) => CanvasViewportPoint | null;
  toScreenPoint: (stage: Konva.Stage) => CanvasViewportPoint | null;
  updatePanInteraction: (screenPoint: CanvasViewportPoint) => void;
}

export function useCanvasViewportNavigation({
  fitView,
  shouldPan,
  stageRef,
  viewport,
  zoom,
  setViewport,
  setZoom,
}: UseCanvasViewportNavigationOptions): UseCanvasViewportNavigationResult {
  const [isPanning, setIsPanning] = useState(false);
  const panningAnchorRef = useRef<CanvasViewportPoint | null>(null);
  const viewportAnchorRef = useRef<CanvasViewportPoint | null>(null);

  const toCanvasPoint = useCallback(
    (stage: Konva.Stage) => {
      const pointer = stage.getPointerPosition();
      if (!pointer) {
        return null;
      }

      return resolveCanvasPointFromScreen({
        screenPoint: pointer,
        viewport,
        zoom,
      });
    },
    [viewport, zoom]
  );

  const toScreenPoint = useCallback((stage: Konva.Stage) => {
    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return null;
    }

    return {
      x: pointer.x,
      y: pointer.y,
    };
  }, []);

  const beginPanInteraction = useCallback(
    (screenPoint: CanvasViewportPoint) => {
      setIsPanning(true);
      panningAnchorRef.current = screenPoint;
      viewportAnchorRef.current = viewport;
    },
    [viewport]
  );

  const updatePanInteraction = useCallback(
    (screenPoint: CanvasViewportPoint) => {
      if (!isPanning || !panningAnchorRef.current || !viewportAnchorRef.current) {
        return;
      }

      setViewport({
        x: viewportAnchorRef.current.x + (screenPoint.x - panningAnchorRef.current.x),
        y: viewportAnchorRef.current.y + (screenPoint.y - panningAnchorRef.current.y),
      });
    },
    [isPanning, setViewport]
  );

  const endPanInteraction = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
    }
    panningAnchorRef.current = null;
    viewportAnchorRef.current = null;
  }, [isPanning]);

  const handleStageWheel = useCallback(
    (event: Konva.KonvaEventObject<WheelEvent>) => {
      event.evt.preventDefault();

      const stage = stageRef.current;
      if (!stage) {
        return;
      }

      const pointer = stage.getPointerPosition();
      if (!pointer) {
        return;
      }

      const nextZoom = resolveCanvasZoomStep({
        direction: event.evt.deltaY > 0 ? "out" : "in",
        zoom,
      });

      setZoom(nextZoom);
      setViewport(
        resolveViewportAfterZoom({
          nextZoom,
          pointer,
          viewport,
          zoom,
        })
      );
    },
    [setViewport, setZoom, stageRef, viewport, zoom]
  );

  const adjustZoom = useCallback(
    (direction: "in" | "out") => {
      setZoom(
        resolveCanvasZoomStep({
          direction,
          zoom,
        })
      );
    },
    [setZoom, zoom]
  );

  const resetView = useCallback(() => {
    if (!fitView) {
      return;
    }

    setZoom(fitView.zoom);
    setViewport(fitView.viewport);
  }, [fitView, setViewport, setZoom]);

  useEffect(() => {
    if (!shouldPan && isPanning) {
      setIsPanning(false);
      panningAnchorRef.current = null;
      viewportAnchorRef.current = null;
    }
  }, [isPanning, shouldPan]);

  return {
    adjustZoom,
    beginPanInteraction,
    cursor: shouldPan ? (isPanning ? "grabbing" : "grab") : "default",
    endPanInteraction,
    handleStageWheel,
    resetView,
    toCanvasPoint,
    toScreenPoint,
    updatePanInteraction,
  };
}
