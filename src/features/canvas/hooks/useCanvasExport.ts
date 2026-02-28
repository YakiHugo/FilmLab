import type Konva from "konva";
import { useCallback } from "react";

export type CanvasExportFormat = "png" | "jpeg";

export interface CanvasExportOptions {
  format: CanvasExportFormat;
  width: number;
  height: number;
  quality: number;
  pixelRatio: number;
}

const defaultExportOptions = (stage: Konva.Stage): CanvasExportOptions => ({
  format: "png",
  width: stage.width(),
  height: stage.height(),
  quality: 0.92,
  pixelRatio: 2,
});

export function useCanvasExport() {
  const exportDataUrl = useCallback(
    (stage: Konva.Stage | null, options?: Partial<CanvasExportOptions>) => {
      if (!stage) {
        return null;
      }
      const merged = { ...defaultExportOptions(stage), ...options };
      const mimeType = merged.format === "jpeg" ? "image/jpeg" : "image/png";
      return stage.toDataURL({
        mimeType,
        quality: merged.quality,
        width: merged.width,
        height: merged.height,
        pixelRatio: merged.pixelRatio,
      });
    },
    []
  );

  const download = useCallback(
    (
      stage: Konva.Stage | null,
      options?: Partial<CanvasExportOptions> & { fileName?: string }
    ) => {
      if (!stage) {
        return null;
      }
      const merged = { ...defaultExportOptions(stage), ...options };
      const dataUrl = exportDataUrl(stage, merged);
      if (!dataUrl) {
        return null;
      }
      const extension = merged.format === "jpeg" ? "jpg" : "png";
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = options?.fileName ?? `filmlab-canvas.${extension}`;
      link.click();
      return dataUrl;
    },
    [exportDataUrl]
  );

  return {
    exportDataUrl,
    download,
  };
}
