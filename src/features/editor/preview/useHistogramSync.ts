import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
  buildHistogramFromCanvas,
  buildHistogramFromDrawable,
  forceMonochromeHistogramMode,
  type HistogramData,
} from "@/features/editor/histogram";
import type { Asset } from "@/types";

export interface UseHistogramSyncInput {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  onHistogramChange: (histogram: HistogramData | null) => void;
  renderVersion: number;
  selectedAsset: Asset | null;
  usesOriginalImageElement: boolean;
}

export interface UseHistogramSyncOutput {
  isSourceMonochrome: boolean;
}

export function useHistogramSync({
  canvasRef,
  onHistogramChange,
  renderVersion,
  selectedAsset,
  usesOriginalImageElement,
}: UseHistogramSyncInput): UseHistogramSyncOutput {
  const histogramDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceHistogramRef = useRef<HistogramData | null>(null);
  const [isSourceMonochrome, setIsSourceMonochrome] = useState(false);

  useEffect(() => {
    return () => {
      if (histogramDebounceRef.current !== null) {
        clearTimeout(histogramDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedAsset?.objectUrl) {
      sourceHistogramRef.current = null;
      setIsSourceMonochrome(false);
      onHistogramChange(null);
      return undefined;
    }
    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.src = selectedAsset.objectUrl;

    const computeSourceHistogram = async () => {
      try {
        await image.decode();
      } catch {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("Failed to load preview histogram source"));
        });
      }
      if (cancelled) {
        return;
      }
      const sourceHistogram = buildHistogramFromDrawable(
        image as CanvasImageSource,
        image.naturalWidth,
        image.naturalHeight
      );
      sourceHistogramRef.current = sourceHistogram;
      const monochrome = Boolean(sourceHistogram?.analysis.isMonochrome);
      setIsSourceMonochrome(monochrome);
      if (usesOriginalImageElement) {
        onHistogramChange(
          monochrome ? forceMonochromeHistogramMode(sourceHistogram) : sourceHistogram
        );
      }
    };

    void computeSourceHistogram().catch(() => {
      if (!cancelled) {
        sourceHistogramRef.current = null;
        setIsSourceMonochrome(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [onHistogramChange, selectedAsset?.id, selectedAsset?.objectUrl, usesOriginalImageElement]);

  useEffect(() => {
    if (!selectedAsset) {
      onHistogramChange(null);
      return undefined;
    }
    if (usesOriginalImageElement) {
      const sourceHistogram = sourceHistogramRef.current;
      if (sourceHistogram) {
        onHistogramChange(
          isSourceMonochrome ? forceMonochromeHistogramMode(sourceHistogram) : sourceHistogram
        );
      }
      return undefined;
    }
    const previewCanvas = canvasRef.current;
    if (!previewCanvas) {
      return undefined;
    }
    if (histogramDebounceRef.current !== null) {
      clearTimeout(histogramDebounceRef.current);
    }
    histogramDebounceRef.current = setTimeout(() => {
      histogramDebounceRef.current = null;
      const histogram = buildHistogramFromCanvas(previewCanvas);
      onHistogramChange(
        isSourceMonochrome ? forceMonochromeHistogramMode(histogram) : histogram
      );
    }, 150);

    return () => {
      if (histogramDebounceRef.current !== null) {
        clearTimeout(histogramDebounceRef.current);
        histogramDebounceRef.current = null;
      }
    };
  }, [
    canvasRef,
    isSourceMonochrome,
    onHistogramChange,
    renderVersion,
    selectedAsset,
    usesOriginalImageElement,
  ]);

  return {
    isSourceMonochrome,
  };
}
