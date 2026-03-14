import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import { applyMaskToLayerCanvas, generateMaskTexture } from "@/lib/layerMaskTexture";
import { renderImageToCanvas } from "@/lib/imageProcessing";
import { clamp } from "@/lib/math";
import type { PreviewRoi } from "@/lib/previewRoi";
import type { Asset } from "@/types";
import type { LayerPreviewEntry, PreviewFrameSize } from "./contracts";

const resolveLayerBlendOperation = (
  blendMode: LayerPreviewEntry["blendMode"]
): GlobalCompositeOperation => {
  if (blendMode === "multiply") {
    return "multiply";
  }
  if (blendMode === "screen") {
    return "screen";
  }
  if (blendMode === "overlay") {
    return "overlay";
  }
  if (blendMode === "softLight") {
    return "soft-light";
  }
  return "source-over";
};

const ensureCanvasSize = (canvas: HTMLCanvasElement, width: number, height: number) => {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  if (canvas.width !== safeWidth) {
    canvas.width = safeWidth;
  }
  if (canvas.height !== safeHeight) {
    canvas.height = safeHeight;
  }
};

const resolvePreviewSourceRect = (
  sourceWidth: number,
  sourceHeight: number,
  previewRoi: PreviewRoi | null
) => {
  if (!previewRoi) {
    return {
      x: 0,
      y: 0,
      width: sourceWidth,
      height: sourceHeight,
    };
  }
  const width = Math.max(1, Math.round(sourceWidth * previewRoi.width));
  const height = Math.max(1, Math.round(sourceHeight * previewRoi.height));
  const x = Math.round(
    clamp(previewRoi.left, 0, 1 - previewRoi.width) * Math.max(0, sourceWidth - width)
  );
  const y = Math.round(
    clamp(previewRoi.top, 0, 1 - previewRoi.height) * Math.max(0, sourceHeight - height)
  );
  return { x, y, width, height };
};

export interface UsePreviewRenderPipelineInput {
  adjustments: Asset["adjustments"] | null;
  filmProfile: Asset["filmProfile"] | null | undefined;
  frameSize: PreviewFrameSize;
  isCropMode: boolean;
  layerPreviewEntries: LayerPreviewEntry[];
  orientedSourceAspectRatio: number;
  previewRenderSeed: number;
  previewRoi: PreviewRoi | null;
  selectedAsset: Asset | null;
  shouldRenderLayerComposite: boolean;
  showOriginal: boolean;
  timestampText: string | null;
}

export interface UsePreviewRenderPipelineOutput {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  imageNaturalSize: PreviewFrameSize | null;
  originalImageRef: React.MutableRefObject<HTMLImageElement | null>;
  overlayCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  renderedRotate: number;
  renderVersion: number;
}

export function usePreviewRenderPipeline({
  adjustments,
  filmProfile,
  frameSize,
  isCropMode,
  layerPreviewEntries,
  orientedSourceAspectRatio,
  previewRenderSeed,
  previewRoi,
  selectedAsset,
  shouldRenderLayerComposite,
  showOriginal,
  timestampText,
}: UsePreviewRenderPipelineInput): UsePreviewRenderPipelineOutput {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerCanvasByLayerIdRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const layerMaskCanvasByLayerIdRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const layerMaskScratchByLayerIdRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const layerBlendCanvasByLayerIdRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const lastAbortTimeRef = useRef(0);

  const [imageNaturalSize, setImageNaturalSize] = useState<PreviewFrameSize | null>(null);
  const [renderedRotate, setRenderedRotate] = useState(adjustments?.rotate ?? 0);
  const [renderVersion, setRenderVersion] = useState(0);

  useEffect(() => {
    const previewCanvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    const outputCanvas = outputCanvasRef.current;
    const fullFrameCanvas = fullFrameCanvasRef.current;
    const layerCanvasMap = layerCanvasByLayerIdRef.current;
    const layerMaskCanvasMap = layerMaskCanvasByLayerIdRef.current;
    const layerMaskScratchMap = layerMaskScratchByLayerIdRef.current;
    const layerBlendCanvasMap = layerBlendCanvasByLayerIdRef.current;

    return () => {
      for (const canvas of [previewCanvas, overlayCanvas, outputCanvas, fullFrameCanvas]) {
        if (!canvas) {
          continue;
        }
        canvas.width = 0;
        canvas.height = 0;
      }
      outputCanvasRef.current = null;
      fullFrameCanvasRef.current = null;

      for (const canvasMap of [
        layerCanvasMap,
        layerMaskCanvasMap,
        layerMaskScratchMap,
        layerBlendCanvasMap,
      ]) {
        for (const layerCanvas of canvasMap.values()) {
          layerCanvas.width = 0;
          layerCanvas.height = 0;
        }
        canvasMap.clear();
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedAsset?.objectUrl) {
      setImageNaturalSize(null);
      return;
    }
    const image = new Image();
    image.onload = () => {
      setImageNaturalSize({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.src = selectedAsset.objectUrl;
  }, [selectedAsset?.objectUrl]);

  useEffect(() => {
    if (!selectedAsset) {
      return undefined;
    }
    if (!adjustments && !shouldRenderLayerComposite) {
      return undefined;
    }
    if (showOriginal && !shouldRenderLayerComposite) {
      return undefined;
    }
    const previewCanvas = canvasRef.current;
    if (!previewCanvas || frameSize.width === 0 || frameSize.height === 0) {
      return undefined;
    }
    const controller = new AbortController();
    const devicePixelRatio = window.devicePixelRatio || 1;
    const isRapidUpdate = performance.now() - lastAbortTimeRef.current < 100;
    const targetWidth = Math.round(frameSize.width * devicePixelRatio);
    const targetHeight = Math.round(frameSize.height * devicePixelRatio);
    const renderScale = previewRoi?.zoom ?? 1;
    const renderTargetWidth = Math.max(1, Math.round(targetWidth * renderScale));
    const renderTargetHeight = Math.max(1, Math.round(targetHeight * renderScale));

    const renderPreview = async () => {
      if (!outputCanvasRef.current) {
        outputCanvasRef.current = document.createElement("canvas");
      }
      if (!fullFrameCanvasRef.current) {
        fullFrameCanvasRef.current = document.createElement("canvas");
      }

      const outputCanvas = outputCanvasRef.current;
      const fullFrameCanvas = fullFrameCanvasRef.current;
      ensureCanvasSize(outputCanvas, targetWidth, targetHeight);

      if (shouldRenderLayerComposite) {
        const layerCanvasMap = layerCanvasByLayerIdRef.current;
        const layerMaskCanvasMap = layerMaskCanvasByLayerIdRef.current;
        const layerMaskScratchMap = layerMaskScratchByLayerIdRef.current;
        const layerBlendCanvasMap = layerBlendCanvasByLayerIdRef.current;
        const activeLayerIds = new Set(layerPreviewEntries.map((entry) => entry.layer.id));
        const pruneCanvasMap = (canvasMap: Map<string, HTMLCanvasElement>) => {
          for (const [layerId, layerCanvas] of canvasMap.entries()) {
            if (activeLayerIds.has(layerId)) {
              continue;
            }
            layerCanvas.width = 0;
            layerCanvas.height = 0;
            canvasMap.delete(layerId);
          }
        };

        pruneCanvasMap(layerCanvasMap);
        pruneCanvasMap(layerMaskCanvasMap);
        pruneCanvasMap(layerMaskScratchMap);
        pruneCanvasMap(layerBlendCanvasMap);
        ensureCanvasSize(fullFrameCanvas, renderTargetWidth, renderTargetHeight);

        const fullFrameContext = fullFrameCanvas.getContext("2d", { willReadFrequently: true });
        if (!fullFrameContext) {
          return;
        }
        fullFrameContext.clearRect(0, 0, fullFrameCanvas.width, fullFrameCanvas.height);

        const layersBottomToTop = [...layerPreviewEntries].reverse();
        for (let layerIndex = 0; layerIndex < layersBottomToTop.length; layerIndex += 1) {
          if (controller.signal.aborted) {
            return;
          }
          const layerEntry = layersBottomToTop[layerIndex]!;
          let layerCanvas = layerCanvasMap.get(layerEntry.layer.id);
          if (!layerCanvas) {
            layerCanvas = document.createElement("canvas");
            layerCanvasMap.set(layerEntry.layer.id, layerCanvas);
          }

          const layerAdjustments = showOriginal
            ? createDefaultAdjustments()
            : normalizeAdjustments(layerEntry.adjustments);

          await renderImageToCanvas({
            canvas: layerCanvas,
            source: layerEntry.sourceAsset.blob ?? layerEntry.sourceAsset.objectUrl,
            adjustments: layerAdjustments,
            filmProfile: showOriginal ? undefined : layerEntry.sourceAsset.filmProfile,
            timestampText: null,
            targetSize: {
              width: renderTargetWidth,
              height: renderTargetHeight,
            },
            seedKey: `${selectedAsset.id}:${layerEntry.layer.id}`,
            renderSeed: (previewRenderSeed ^ ((layerIndex + 1) * 2654435761)) >>> 0,
            skipHalationBloom: isRapidUpdate,
            signal: controller.signal,
            sourceCacheKey: `preview:${layerEntry.sourceAsset.id}:${layerEntry.layer.id}:${layerEntry.sourceAsset.size}`,
          });
          if (controller.signal.aborted) {
            return;
          }

          let drawSource: CanvasImageSource = layerCanvas;
          if (layerEntry.layer.mask) {
            let maskCanvas = layerMaskCanvasMap.get(layerEntry.layer.id);
            if (!maskCanvas) {
              maskCanvas = document.createElement("canvas");
              layerMaskCanvasMap.set(layerEntry.layer.id, maskCanvas);
            }
            let scratchCanvas = layerMaskScratchMap.get(layerEntry.layer.id);
            if (!scratchCanvas) {
              scratchCanvas = document.createElement("canvas");
              layerMaskScratchMap.set(layerEntry.layer.id, scratchCanvas);
            }
            const generatedMask = generateMaskTexture(layerEntry.layer.mask, {
              width: fullFrameCanvas.width,
              height: fullFrameCanvas.height,
              referenceSource: layerCanvas,
              targetCanvas: maskCanvas,
              scratchCanvas,
            });
            if (generatedMask) {
              let blendCanvas = layerBlendCanvasMap.get(layerEntry.layer.id);
              if (!blendCanvas) {
                blendCanvas = document.createElement("canvas");
                layerBlendCanvasMap.set(layerEntry.layer.id, blendCanvas);
              }
              drawSource = applyMaskToLayerCanvas(layerCanvas, generatedMask, blendCanvas);
            }
          }

          fullFrameContext.save();
          fullFrameContext.globalAlpha = layerEntry.opacity;
          fullFrameContext.globalCompositeOperation = resolveLayerBlendOperation(
            layerEntry.blendMode
          );
          fullFrameContext.drawImage(drawSource, 0, 0, fullFrameCanvas.width, fullFrameCanvas.height);
          fullFrameContext.restore();
        }
      } else {
        const renderAdjustments = isCropMode
          ? {
              ...adjustments!,
              aspectRatio: "original" as const,
              customAspectRatio: orientedSourceAspectRatio,
              scale: 100,
            }
          : adjustments!;

        await renderImageToCanvas({
          canvas: fullFrameCanvas,
          source: selectedAsset.blob ?? selectedAsset.objectUrl,
          adjustments: renderAdjustments,
          filmProfile: filmProfile ?? undefined,
          timestampText,
          targetSize: {
            width: renderTargetWidth,
            height: renderTargetHeight,
          },
          seedKey: selectedAsset.id,
          renderSeed: previewRenderSeed,
          skipHalationBloom: isRapidUpdate,
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        setRenderedRotate(renderAdjustments.rotate);
      }

      const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });
      if (!outputContext) {
        return;
      }
      outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

      const sourceRect = resolvePreviewSourceRect(
        fullFrameCanvas.width,
        fullFrameCanvas.height,
        previewRoi
      );
      outputContext.drawImage(
        fullFrameCanvas,
        sourceRect.x,
        sourceRect.y,
        sourceRect.width,
        sourceRect.height,
        0,
        0,
        outputCanvas.width,
        outputCanvas.height
      );

      const previewContext = previewCanvas.getContext("2d", { willReadFrequently: true });
      if (!previewContext) {
        return;
      }
      if (
        previewCanvas.width !== outputCanvas.width ||
        previewCanvas.height !== outputCanvas.height
      ) {
        previewCanvas.width = outputCanvas.width;
        previewCanvas.height = outputCanvas.height;
      }
      previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewContext.drawImage(outputCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
      setRenderVersion((current) => current + 1);
    };

    void renderPreview().catch(() => undefined);

    return () => {
      controller.abort();
      lastAbortTimeRef.current = performance.now();
    };
  }, [
    adjustments,
    filmProfile,
    frameSize.height,
    frameSize.width,
    isCropMode,
    layerPreviewEntries,
    orientedSourceAspectRatio,
    previewRenderSeed,
    previewRoi,
    selectedAsset,
    shouldRenderLayerComposite,
    showOriginal,
    timestampText,
  ]);

  return {
    canvasRef,
    imageNaturalSize,
    originalImageRef,
    overlayCanvasRef,
    renderedRotate,
    renderVersion,
  };
}
