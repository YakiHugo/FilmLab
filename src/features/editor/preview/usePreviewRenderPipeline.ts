import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createDefaultAdjustments, normalizeAdjustments } from "@/lib/adjustments";
import { applyMaskToLayerCanvas, generateMaskTexture } from "@/lib/layerMaskTexture";
import { renderImageToCanvas } from "@/lib/imageProcessing";
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

export interface UsePreviewRenderPipelineInput {
  adjustments: Asset["adjustments"] | null;
  filmProfile: Asset["filmProfile"] | null | undefined;
  frameSize: PreviewFrameSize;
  isCropMode: boolean;
  layerPreviewEntries: LayerPreviewEntry[];
  orientedSourceAspectRatio: number;
  previewRenderSeed: number;
  selectedAsset: Asset | null;
  shouldRenderLayerComposite: boolean;
  showOriginal: boolean;
  timestampText: string | null;
}

export interface UsePreviewRenderPipelineOutput {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  imageNaturalSize: PreviewFrameSize | null;
  originalImageRef: React.MutableRefObject<HTMLImageElement | null>;
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
  selectedAsset,
  shouldRenderLayerComposite,
  showOriginal,
  timestampText,
}: UsePreviewRenderPipelineInput): UsePreviewRenderPipelineOutput {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const workingCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
    const workingCanvas = workingCanvasRef.current;
    const layerCanvasMap = layerCanvasByLayerIdRef.current;
    const layerMaskCanvasMap = layerMaskCanvasByLayerIdRef.current;
    const layerMaskScratchMap = layerMaskScratchByLayerIdRef.current;
    const layerBlendCanvasMap = layerBlendCanvasByLayerIdRef.current;

    return () => {
      if (previewCanvas) {
        previewCanvas.width = 0;
        previewCanvas.height = 0;
      }
      if (workingCanvas) {
        workingCanvas.width = 0;
        workingCanvas.height = 0;
        workingCanvasRef.current = null;
      }
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

    const renderPreview = async () => {
      if (!workingCanvasRef.current) {
        workingCanvasRef.current = document.createElement("canvas");
      }
      const workingCanvas = workingCanvasRef.current;

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

        const targetWidth = Math.round(frameSize.width * devicePixelRatio);
        const targetHeight = Math.round(frameSize.height * devicePixelRatio);
        if (workingCanvas.width !== targetWidth || workingCanvas.height !== targetHeight) {
          workingCanvas.width = targetWidth;
          workingCanvas.height = targetHeight;
        }
        const workingContext = workingCanvas.getContext("2d", { willReadFrequently: true });
        if (!workingContext) {
          return;
        }
        workingContext.clearRect(0, 0, workingCanvas.width, workingCanvas.height);

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
              width: targetWidth,
              height: targetHeight,
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
              width: workingCanvas.width,
              height: workingCanvas.height,
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

          workingContext.save();
          workingContext.globalAlpha = layerEntry.opacity;
          workingContext.globalCompositeOperation = resolveLayerBlendOperation(
            layerEntry.blendMode
          );
          workingContext.drawImage(drawSource, 0, 0, workingCanvas.width, workingCanvas.height);
          workingContext.restore();
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
          canvas: workingCanvas,
          source: selectedAsset.blob ?? selectedAsset.objectUrl,
          adjustments: renderAdjustments,
          filmProfile: filmProfile ?? undefined,
          timestampText,
          targetSize: {
            width: Math.round(frameSize.width * devicePixelRatio),
            height: Math.round(frameSize.height * devicePixelRatio),
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

      const outputContext = previewCanvas.getContext("2d", { willReadFrequently: true });
      if (!outputContext) {
        return;
      }
      if (
        previewCanvas.width !== workingCanvas.width ||
        previewCanvas.height !== workingCanvas.height
      ) {
        previewCanvas.width = workingCanvas.width;
        previewCanvas.height = workingCanvas.height;
      }
      outputContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      outputContext.drawImage(workingCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
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
    selectedAsset,
    shouldRenderLayerComposite,
    showOriginal,
    timestampText,
  ]);

  return {
    canvasRef,
    imageNaturalSize,
    originalImageRef,
    renderedRotate,
    renderVersion,
  };
}
