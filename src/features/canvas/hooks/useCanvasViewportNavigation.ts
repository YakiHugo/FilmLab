import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { registerCanvasStage } from "./canvasStageRegistry";
import type { CanvasToolName } from "../tools/toolControllers";
import {
  resolveCanvasFitView,
  resolveCanvasPointFromScreen,
  resolveCanvasZoomStep,
  resolveViewportAfterZoom,
  type CanvasViewportInsets,
  type CanvasViewportPoint,
  type CanvasViewportSize,
} from "../viewportNavigation";

interface UseCanvasViewportNavigationOptions {
  activeWorkbench: {
    height: number;
    id: string;
    width: number;
  } | null;
  activeWorkbenchId: string | null;
  insets: CanvasViewportInsets;
  stageRef: RefObject<Konva.Stage>;
  tool: CanvasToolName;
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
  shouldPan: boolean;
  stageSize: CanvasViewportSize;
  toCanvasPoint: (stage: Konva.Stage) => CanvasViewportPoint | null;
  toScreenPoint: (stage: Konva.Stage) => CanvasViewportPoint | null;
  updatePanInteraction: (screenPoint: CanvasViewportPoint) => void;
  viewportContainerRef: RefObject<HTMLDivElement>;
}

const createEmptyStageSize = (): CanvasViewportSize => ({
  width: 0,
  height: 0,
});

const isInputLikeElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
};

export function useCanvasViewportNavigation({
  activeWorkbench,
  activeWorkbenchId,
  insets,
  stageRef,
  tool,
  viewport,
  zoom,
  setViewport,
  setZoom,
}: UseCanvasViewportNavigationOptions): UseCanvasViewportNavigationResult {
  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState(createEmptyStageSize);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const initializedWorkbenchIdsRef = useRef<Set<string>>(new Set());
  const panningAnchorRef = useRef<CanvasViewportPoint | null>(null);
  const viewportAnchorRef = useRef<CanvasViewportPoint | null>(null);

  const shouldPan = tool === "hand" || isSpacePressed;

  const fitView = useMemo(
    () =>
      activeWorkbench
        ? resolveCanvasFitView({
            insets,
            stageSize,
            workbenchSize: {
              width: activeWorkbench.width,
              height: activeWorkbench.height,
            },
          })
        : null,
    [activeWorkbench, insets, stageSize]
  );

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
    registerCanvasStage(stageRef.current);
    return () => {
      registerCanvasStage(null);
    };
  }, [stageRef, activeWorkbenchId]);

  useEffect(() => {
    if (!activeWorkbenchId) {
      return;
    }

    const container = viewportContainerRef.current;
    if (!container) {
      return;
    }

    const updateStageSize = (width: number, height: number) => {
      setStageSize((current) =>
        current.width === width && current.height === height ? current : { width, height }
      );
    };

    const measure = () => {
      const rect = container.getBoundingClientRect();
      updateStageSize(Math.round(rect.width), Math.round(rect.height));
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => {
        window.removeEventListener("resize", measure);
      };
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      updateStageSize(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height));
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [activeWorkbenchId]);

  useEffect(() => {
    if (!activeWorkbench || !fitView) {
      return;
    }

    if (initializedWorkbenchIdsRef.current.has(activeWorkbench.id)) {
      return;
    }

    initializedWorkbenchIdsRef.current.add(activeWorkbench.id);
    setZoom(fitView.zoom);
    setViewport(fitView.viewport);
  }, [activeWorkbench, fitView, setViewport, setZoom]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isInputLikeElement(event.target)) {
        event.preventDefault();
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }

      setIsSpacePressed(false);
      setIsPanning(false);
      panningAnchorRef.current = null;
      viewportAnchorRef.current = null;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return {
    adjustZoom,
    beginPanInteraction,
    cursor: shouldPan ? (isPanning ? "grabbing" : "grab") : "default",
    endPanInteraction,
    handleStageWheel,
    resetView,
    shouldPan,
    stageSize,
    toCanvasPoint,
    toScreenPoint,
    updatePanInteraction,
    viewportContainerRef,
  };
}
