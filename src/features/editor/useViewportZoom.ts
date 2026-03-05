import { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "@/lib/math";
import { ZOOM_MAX, ZOOM_MIN } from "./cropGeometry";
import { useEditorStore } from "@/stores/editorStore";

export const ZOOM_PRESETS = [
  { label: "Fit", value: "fit" },
  { label: "50%", value: 0.5 },
  { label: "100%", value: 1 },
  { label: "150%", value: 1.5 },
  { label: "200%", value: 2 },
] as const;

interface UseViewportZoomOptions {
  /** Ref to the image area element for wheel event interception */
  imageAreaRef: React.RefObject<HTMLElement | null>;
  /** Ref tracking whether crop mode is active (for passive event handler) */
  isCropModeRef: React.RefObject<boolean>;
}

export function useViewportZoom({ imageAreaRef, isCropModeRef }: UseViewportZoomOptions) {
  const viewScale = useEditorStore((state) => state.viewportScale);
  const setViewportScale = useEditorStore((state) => state.setViewportScale);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const panStartRef = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const resetView = useCallback(() => {
    setViewportScale(1);
    setViewOffset({ x: 0, y: 0 });
  }, [setViewportScale]);

  const setViewScale = useCallback(
    (nextScale: number) => {
      setViewportScale(clamp(nextScale, ZOOM_MIN, ZOOM_MAX));
    },
    [setViewportScale]
  );

  const handleZoom = useCallback((nextScale: number) => {
    setViewScale(nextScale);
  }, [setViewScale]);

  // Prevent browser zoom on Ctrl+wheel / pinch inside the image area
  useEffect(() => {
    const element = imageAreaRef.current;
    if (!element) {
      return undefined;
    }
    const preventBrowserZoom = (event: WheelEvent) => {
      if (isCropModeRef.current || event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    element.addEventListener("wheel", preventBrowserZoom, { passive: false });
    return () => {
      element.removeEventListener("wheel", preventBrowserZoom);
    };
  }, [imageAreaRef, isCropModeRef]);

  // Reset offset when scale drops to 1
  useEffect(() => {
    if (viewScale <= 1) {
      setViewOffset({ x: 0, y: 0 });
    }
  }, [viewScale]);

  return {
    viewScale,
    setViewScale,
    viewOffset,
    setViewOffset,
    isPanning,
    setIsPanning,
    panStartRef,
    resetView,
    handleZoom,
  };
}
