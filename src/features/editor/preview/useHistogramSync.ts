import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
  buildHistogramFromCanvas,
  buildHistogramFromDrawable,
  forceMonochromeHistogramMode,
  type HistogramData,
} from "@/features/editor/histogram";
import {
  buildWaveformFromCanvas,
  buildWaveformFromDrawable,
  type WaveformData,
} from "@/features/editor/waveform";
import type { Asset } from "@/types";

export interface UseHistogramSyncInput {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  onHistogramChange: (histogram: HistogramData | null) => void;
  onWaveformChange: (waveform: WaveformData | null) => void;
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
  onWaveformChange,
  renderVersion,
  selectedAsset,
  usesOriginalImageElement,
}: UseHistogramSyncInput): UseHistogramSyncOutput {
  const histogramDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceHistogramRef = useRef<HistogramData | null>(null);
  const sourceWaveformRef = useRef<WaveformData | null>(null);
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
      sourceWaveformRef.current = null;
      setIsSourceMonochrome(false);
      onHistogramChange(null);
      onWaveformChange(null);
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
      const sourceWaveform = buildWaveformFromDrawable(
        image as CanvasImageSource,
        image.naturalWidth,
        image.naturalHeight
      );
      sourceHistogramRef.current = sourceHistogram;
      sourceWaveformRef.current = sourceWaveform;
      const monochrome = Boolean(sourceHistogram?.analysis.isMonochrome);
      setIsSourceMonochrome(monochrome);
      if (usesOriginalImageElement) {
        onHistogramChange(
          monochrome ? forceMonochromeHistogramMode(sourceHistogram) : sourceHistogram
        );
        onWaveformChange(sourceWaveform);
      }
    };

    void computeSourceHistogram().catch(() => {
      if (!cancelled) {
        sourceHistogramRef.current = null;
        sourceWaveformRef.current = null;
        setIsSourceMonochrome(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    onHistogramChange,
    onWaveformChange,
    selectedAsset?.id,
    selectedAsset?.objectUrl,
    usesOriginalImageElement,
  ]);

  useEffect(() => {
    if (!selectedAsset) {
      onHistogramChange(null);
      onWaveformChange(null);
      return undefined;
    }
    if (usesOriginalImageElement) {
      const sourceHistogram = sourceHistogramRef.current;
      const sourceWaveform = sourceWaveformRef.current;
      if (sourceHistogram) {
        onHistogramChange(
          isSourceMonochrome ? forceMonochromeHistogramMode(sourceHistogram) : sourceHistogram
        );
      }
      onWaveformChange(sourceWaveform);
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
      const waveform = buildWaveformFromCanvas(previewCanvas);
      onHistogramChange(
        isSourceMonochrome ? forceMonochromeHistogramMode(histogram) : histogram
      );
      onWaveformChange(waveform);
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
    onWaveformChange,
    renderVersion,
    selectedAsset,
    usesOriginalImageElement,
  ]);

  return {
    isSourceMonochrome,
  };
}
