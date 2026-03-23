import type Konva from "konva";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { registerCanvasStage } from "./canvasStageRegistry";
import type {
  CanvasViewportInsets,
  CanvasViewportSize,
  CanvasViewportTransform,
} from "../viewportNavigation";
import { resolveCanvasFitView } from "../viewportNavigation";

interface UseCanvasViewportLifecycleOptions {
  activeWorkbench: {
    height: number;
    id: string;
    width: number;
  } | null;
  activeWorkbenchId: string | null;
  insets: CanvasViewportInsets;
  stageRef: RefObject<Konva.Stage>;
  setViewport: (viewport: CanvasViewportTransform["viewport"]) => void;
  setZoom: (zoom: number) => void;
}

interface UseCanvasViewportLifecycleResult {
  fitView: CanvasViewportTransform | null;
  isSpacePressed: boolean;
  stageSize: CanvasViewportSize;
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

export function useCanvasViewportLifecycle({
  activeWorkbench,
  activeWorkbenchId,
  insets,
  stageRef,
  setViewport,
  setZoom,
}: UseCanvasViewportLifecycleOptions): UseCanvasViewportLifecycleResult {
  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState(createEmptyStageSize);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const initializedWorkbenchIdsRef = useRef<Set<string>>(new Set());

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
      if (event.code === "Space") {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return {
    fitView,
    isSpacePressed,
    stageSize,
    viewportContainerRef,
  };
}
