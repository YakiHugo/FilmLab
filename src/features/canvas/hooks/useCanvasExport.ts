import type Konva from "konva";
import { useCallback } from "react";
import type { CanvasSlice } from "@/types";
import { useAssetStore } from "@/stores/assetStore";
import { encodeRgbaToTiff } from "@/lib/export/tiff";
import { cropRenderedCanvasSlice, renderCanvasWorkbenchToCanvas } from "../renderCanvasWorkbench";
import { useCanvasLoadedWorkbenchState } from "./useCanvasLoadedWorkbenchState";

export type CanvasExportFormat = "png" | "jpeg" | "tiff";

export interface CanvasExportOptions {
  format: CanvasExportFormat;
  width: number;
  height: number;
  quality: number;
  pixelRatio: number;
  onProgress?: (progress: number) => void;
}

export interface CanvasSliceExportResult {
  slice: CanvasSlice;
  dataUrl: string;
  fileName: string;
}

const EDITOR_GRID_FILL = "rgba(255,255,255,0.18)";
const WORKSPACE_BACKGROUND_NODE_ID = "canvas-workspace-background";
const WORKSPACE_GRID_NODE_ID = "canvas-workspace-grid";

const defaultExportOptions = (stage: Konva.Stage): CanvasExportOptions => ({
  format: "png",
  width: stage.width(),
  height: stage.height(),
  quality: 0.92,
  pixelRatio: 2,
});

const hideEditorOverlayNodes = (stage: Konva.Stage) => {
  const hiddenNodes: Konva.Node[] = [];
  const candidates = [...stage.find("Rect"), ...stage.find("Shape")];
  const seenNodes = new Set<Konva.Node>();

  for (const node of candidates) {
    if (seenNodes.has(node)) {
      continue;
    }
    seenNodes.add(node);

    const nodeId = node.id();
    const hasPatternFill = Boolean(node.getAttr("fillPatternImage"));
    const hasEditorGridFill = node.getAttr("fill") === EDITOR_GRID_FILL;
    const isWorkspaceOverlayNode =
      nodeId === WORKSPACE_BACKGROUND_NODE_ID || nodeId === WORKSPACE_GRID_NODE_ID;
    if (!isWorkspaceOverlayNode && nodeId) {
      continue;
    }

    if (!isWorkspaceOverlayNode && !hasPatternFill && !hasEditorGridFill) {
      continue;
    }

    if (!node.visible()) {
      continue;
    }

    node.visible(false);
    hiddenNodes.push(node);
  }

  return hiddenNodes;
};

export const exportStageDataUrl = (
  stage: Konva.Stage,
  options: Partial<CanvasExportOptions> & {
    crop?: Pick<CanvasSlice, "x" | "y" | "width" | "height">;
  }
) => {
  const mimeType = options.format === "jpeg" ? "image/jpeg" : "image/png";
  const hiddenNodes = hideEditorOverlayNodes(stage);

  try {
    return stage.toDataURL({
      mimeType,
      quality: options.quality,
      x: options.crop?.x,
      y: options.crop?.y,
      width: options.width,
      height: options.height,
      pixelRatio: options.pixelRatio,
    });
  } finally {
    for (const node of hiddenNodes) {
      node.visible(true);
    }
  }
};

export function useCanvasExport() {
  const assets = useAssetStore((state) => state.assets);
  const { loadedWorkbench } = useCanvasLoadedWorkbenchState();

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
      return exportStageDataUrl(stage, merged);
    },
    []
  );

  const download = useCallback(
    async (
      stage: Konva.Stage | null,
      options?: Partial<CanvasExportOptions> & { fileName?: string }
    ) => {
      const merged = {
        ...(stage ? defaultExportOptions(stage) : defaultExportOptionsFromDocument(loadedWorkbench)),
        ...options,
      };
      if (merged.format === "tiff" && loadedWorkbench) {
        const exportCanvas = document.createElement("canvas");
        try {
          await renderCanvasWorkbenchToCanvas({
            assets,
            canvas: exportCanvas,
            document: loadedWorkbench,
            height: merged.height,
            pixelRatio: merged.pixelRatio,
            width: merged.width,
            onProgress: merged.onProgress,
          });
          const ctx = exportCanvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            return null;
          }
          const imageData = ctx.getImageData(0, 0, exportCanvas.width, exportCanvas.height);
          const blob = encodeRgbaToTiff(
            imageData.data,
            exportCanvas.width,
            exportCanvas.height
          );
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = options?.fileName ?? "filmlab-canvas.tiff";
          link.click();
          URL.revokeObjectURL(url);
          return null;
        } finally {
          exportCanvas.width = 0;
          exportCanvas.height = 0;
        }
      }

      let dataUrl: string | null = null;
      if (loadedWorkbench) {
        const exportCanvas = document.createElement("canvas");
        try {
          await renderCanvasWorkbenchToCanvas({
            assets,
            canvas: exportCanvas,
            document: loadedWorkbench,
            height: merged.height,
            pixelRatio: merged.pixelRatio,
            width: merged.width,
            onProgress: merged.onProgress,
          });
          dataUrl = exportCanvas.toDataURL(
            merged.format === "jpeg" ? "image/jpeg" : "image/png",
            merged.quality
          );
        } finally {
          exportCanvas.width = 0;
          exportCanvas.height = 0;
        }
      } else if (stage) {
        dataUrl = exportDataUrl(stage, merged);
      }
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
    [assets, exportDataUrl, loadedWorkbench]
  );

  const exportSlices = useCallback(
    async (
      stage: Konva.Stage | null,
      slices: CanvasSlice[],
      options?: Partial<CanvasExportOptions> & { filePrefix?: string }
    ): Promise<CanvasSliceExportResult[]> => {
      if (slices.length === 0 || !loadedWorkbench) {
        return [];
      }

      const merged = {
        ...(stage ? defaultExportOptions(stage) : defaultExportOptionsFromDocument(loadedWorkbench)),
        ...options,
      };
      const extension = merged.format === "jpeg" ? "jpg" : merged.format === "tiff" ? "tiff" : "png";
      const fullCanvas = document.createElement("canvas");

      try {
        await renderCanvasWorkbenchToCanvas({
          assets,
          canvas: fullCanvas,
          document: loadedWorkbench,
          height: loadedWorkbench.height,
          pixelRatio: merged.pixelRatio,
          width: loadedWorkbench.width,
          onProgress: merged.onProgress,
        });

        return slices
          .slice()
          .sort((left, right) => left.order - right.order)
          .map((slice) => {
            const sliceCanvas = cropRenderedCanvasSlice({
              canvas: fullCanvas,
              document: loadedWorkbench,
              pixelRatio: merged.pixelRatio,
              slice,
            });
            try {
              let dataUrl: string;
              if (merged.format === "tiff") {
                const ctx = sliceCanvas.getContext("2d", { willReadFrequently: true });
                const imageData = ctx!.getImageData(0, 0, sliceCanvas.width, sliceCanvas.height);
                const blob = encodeRgbaToTiff(imageData.data, sliceCanvas.width, sliceCanvas.height);
                dataUrl = URL.createObjectURL(blob);
              } else {
                dataUrl = sliceCanvas.toDataURL(
                  merged.format === "jpeg" ? "image/jpeg" : "image/png",
                  merged.quality
                );
              }
              return {
                slice,
                dataUrl,
                fileName: `${options?.filePrefix ?? "filmlab-story"}-${String(slice.order).padStart(2, "0")}-${slice.name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-+|-+$/g, "") || "slice"}.${extension}`,
              };
            } finally {
              sliceCanvas.width = 0;
              sliceCanvas.height = 0;
            }
          });
      } finally {
        fullCanvas.width = 0;
        fullCanvas.height = 0;
      }
    },
    [assets, loadedWorkbench]
  );

  const downloadSlices = useCallback(
    async (
      stage: Konva.Stage | null,
      slices: CanvasSlice[],
      options?: Partial<CanvasExportOptions> & { filePrefix?: string }
    ) => {
      const results = await exportSlices(stage, slices, options);
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

const defaultExportOptionsFromDocument = (
  activeWorkbench: {
    height: number;
    width: number;
  } | null
): CanvasExportOptions => ({
  format: "png",
  width: activeWorkbench?.width ?? 1080,
  height: activeWorkbench?.height ?? 1080,
  quality: 0.92,
  pixelRatio: 2,
});
