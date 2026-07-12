import { useCallback, useEffect, useRef } from "react";
import type { Asset, CanvasWorkbench } from "@/types";
import { useAssetStore } from "@/stores/assetStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { selectLoadedWorkbench } from "../store/canvasStoreSelectors";
import { renderCanvasWorkbenchToCanvas } from "../renderCanvasDocument";

export type CanvasArtifactFormat = "png" | "jpeg";

interface CanvasArtifactRenderOptions {
  assets: Asset[];
  format: CanvasArtifactFormat;
  height: number;
  pixelRatio: 1 | 2;
  quality: number;
  width: number;
  workbench: CanvasWorkbench;
  onProgress?: (progress: number) => void;
}

interface CanvasArtifactRenderResult {
  dataUrl: string;
  pixelHeight: number;
  pixelWidth: number;
}

interface CanvasArtifactPreviewCacheEntry {
  activeConsumers: number;
  assets: Asset[];
  promise: Promise<HTMLCanvasElement>;
  releaseRequested: boolean;
  released: boolean;
  workbench: CanvasWorkbench;
}

const assertCanvasArtifactAssetsAvailable = (assets: Asset[], workbench: CanvasWorkbench) => {
  const assetIds = new Set(assets.map((asset) => asset.id));
  const missingImage = workbench.elements.find(
    (element) =>
      element.type === "image" && element.effectiveVisible && !assetIds.has(element.assetId)
  );
  if (missingImage?.type === "image") {
    throw new Error(`缺少图片素材 ${missingImage.assetId}，请重新导入后再导出。`);
  }
};

const releaseCanvas = (canvas: HTMLCanvasElement) => {
  canvas.width = 0;
  canvas.height = 0;
};

const requestPreviewCacheRelease = (entry: CanvasArtifactPreviewCacheEntry) => {
  entry.releaseRequested = true;
  if (entry.activeConsumers > 0 || entry.released) {
    return;
  }
  entry.released = true;
  void entry.promise.then(releaseCanvas, () => undefined);
};

const renderCanvasArtifactCanvas = async ({
  assets,
  height,
  pixelRatio,
  width,
  workbench,
  onProgress,
}: Omit<CanvasArtifactRenderOptions, "format" | "quality">) => {
  assertCanvasArtifactAssetsAvailable(assets, workbench);
  const canvas = document.createElement("canvas");
  try {
    await renderCanvasWorkbenchToCanvas({
      assets,
      canvas,
      document: workbench,
      height,
      pixelRatio,
      width,
      onProgress,
    });
    return canvas;
  } catch (cause) {
    releaseCanvas(canvas);
    throw cause;
  }
};

const encodeCanvasArtifact = (
  canvas: HTMLCanvasElement,
  format: CanvasArtifactFormat,
  quality: number
): CanvasArtifactRenderResult => ({
  dataUrl: canvas.toDataURL(format === "jpeg" ? "image/jpeg" : "image/png", quality),
  pixelHeight: canvas.height,
  pixelWidth: canvas.width,
});

export const renderCanvasArtifactDataUrl = async ({
  assets,
  format,
  height,
  pixelRatio,
  quality,
  width,
  workbench,
  onProgress,
}: CanvasArtifactRenderOptions): Promise<CanvasArtifactRenderResult> => {
  const canvas = await renderCanvasArtifactCanvas({
    assets,
    height,
    pixelRatio,
    width,
    workbench,
    onProgress,
  });
  try {
    const result = encodeCanvasArtifact(canvas, format, quality);
    onProgress?.(1);
    return result;
  } finally {
    releaseCanvas(canvas);
  }
};

const normalizeArtifactFileName = (name: string) =>
  name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "filmlab-artifact";

const triggerDataUrlDownload = (dataUrl: string, fileName: string) => {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.click();
};

export function useCanvasExport() {
  const assets = useAssetStore((state) => state.assets);
  const loadedWorkbench = useCanvasStore(selectLoadedWorkbench);
  const previewCacheRef = useRef<CanvasArtifactPreviewCacheEntry | null>(null);
  const previewRenderTailRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(
    () => () => {
      const cached = previewCacheRef.current;
      previewCacheRef.current = null;
      if (cached) {
        requestPreviewCacheRelease(cached);
      }
    },
    []
  );

  const acquireArtifactPreviewCache = useCallback(() => {
    if (!loadedWorkbench) {
      throw new Error("没有可导出的作品。");
    }

    const cached = previewCacheRef.current;
    if (cached?.assets === assets && cached.workbench === loadedWorkbench) {
      return cached;
    }

    const promise = previewRenderTailRef.current
      .catch(() => undefined)
      .then(() =>
        renderCanvasArtifactCanvas({
          assets,
          height: loadedWorkbench.height,
          pixelRatio: 1,
          width: loadedWorkbench.width,
          workbench: loadedWorkbench,
        })
      );
    previewRenderTailRef.current = promise.then(
      () => undefined,
      () => undefined
    );

    const nextCache: CanvasArtifactPreviewCacheEntry = {
      activeConsumers: 0,
      assets,
      promise,
      releaseRequested: false,
      released: false,
      workbench: loadedWorkbench,
    };
    previewCacheRef.current = nextCache;
    if (cached) {
      requestPreviewCacheRelease(cached);
    }
    void promise.catch(() => {
      if (previewCacheRef.current === nextCache) {
        previewCacheRef.current = null;
      }
      requestPreviewCacheRelease(nextCache);
    });
    return nextCache;
  }, [assets, loadedWorkbench]);

  const renderArtifactPreview = useCallback(
    async ({ format, quality }: { format: CanvasArtifactFormat; quality: number }) => {
      const cache = acquireArtifactPreviewCache();
      cache.activeConsumers += 1;
      try {
        const canvas = await cache.promise;
        return encodeCanvasArtifact(canvas, format, quality);
      } finally {
        cache.activeConsumers -= 1;
        if (cache.releaseRequested) {
          requestPreviewCacheRelease(cache);
        }
      }
    },
    [acquireArtifactPreviewCache]
  );

  const downloadArtifact = useCallback(
    async ({
      fileName,
      format,
      onProgress,
      pixelRatio,
      quality,
    }: {
      fileName?: string;
      format: CanvasArtifactFormat;
      onProgress?: (progress: number) => void;
      pixelRatio: 1 | 2;
      quality: number;
    }) => {
      if (!loadedWorkbench) {
        throw new Error("没有可导出的作品。");
      }
      const result = await renderCanvasArtifactDataUrl({
        assets,
        format,
        height: loadedWorkbench.height,
        pixelRatio,
        quality,
        width: loadedWorkbench.width,
        workbench: loadedWorkbench,
        onProgress,
      });
      const extension = format === "jpeg" ? "jpg" : "png";
      const baseName = normalizeArtifactFileName(fileName ?? loadedWorkbench.name);
      triggerDataUrlDownload(result.dataUrl, `${baseName}.${extension}`);
      return result;
    },
    [assets, loadedWorkbench]
  );

  return {
    downloadArtifact,
    renderArtifactPreview,
  };
}
