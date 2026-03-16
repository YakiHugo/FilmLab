import type Konva from "konva";
import { useCallback } from "react";
import type { CanvasSlice } from "@/types";

export type CanvasExportFormat = "png" | "jpeg";

export interface CanvasExportOptions {
  format: CanvasExportFormat;
  width: number;
  height: number;
  quality: number;
  pixelRatio: number;
}

export interface CanvasSliceExportResult {
  slice: CanvasSlice;
  dataUrl: string;
  fileName: string;
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
    (
      stage: Konva.Stage | null,
      options?: Partial<CanvasExportOptions> & {
        crop?: Pick<CanvasSlice, "x" | "y" | "width" | "height">;
      }
    ) => {
      if (!stage) {
        return null;
      }
      const merged = { ...defaultExportOptions(stage), ...options };
      const mimeType = merged.format === "jpeg" ? "image/jpeg" : "image/png";
      return stage.toDataURL({
        mimeType,
        quality: merged.quality,
        x: merged.crop?.x,
        y: merged.crop?.y,
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

  const exportSlices = useCallback(
    (
      stage: Konva.Stage | null,
      slices: CanvasSlice[],
      options?: Partial<CanvasExportOptions> & { filePrefix?: string }
    ): CanvasSliceExportResult[] => {
      if (!stage || slices.length === 0) {
        return [];
      }

      const merged = { ...defaultExportOptions(stage), ...options };
      const extension = merged.format === "jpeg" ? "jpg" : "png";

      return slices
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((slice) => {
          const dataUrl = exportDataUrl(stage, {
            ...merged,
            width: slice.width,
            height: slice.height,
            crop: slice,
          });
          if (!dataUrl) {
            return null;
          }

          return {
            slice,
            dataUrl,
            fileName: `${options?.filePrefix ?? "filmlab-story"}-${String(slice.order).padStart(2, "0")}-${slice.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "") || "slice"}.${extension}`,
          };
        })
        .filter((entry): entry is CanvasSliceExportResult => Boolean(entry));
    },
    [exportDataUrl]
  );

  const downloadSlices = useCallback(
    (
      stage: Konva.Stage | null,
      slices: CanvasSlice[],
      options?: Partial<CanvasExportOptions> & { filePrefix?: string }
    ) => {
      const results = exportSlices(stage, slices, options);
      results.forEach((result) => {
        const link = document.createElement("a");
        link.href = result.dataUrl;
        link.download = result.fileName;
        link.click();
      });
      return results;
    },
    [exportSlices]
  );

  return {
    exportDataUrl,
    download,
    exportSlices,
    downloadSlices,
  };
}
