import type Konva from "konva";
import { useCallback } from "react";

export function useCanvasExport() {
  const exportPng = useCallback((stage: Konva.Stage | null) => {
    if (!stage) {
      return null;
    }
    return stage.toDataURL({ pixelRatio: 2 });
  }, []);

  return { exportPng };
}
