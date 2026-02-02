import { useEffect, useMemo, useState } from "react";
import type { Asset } from "@/types";

const HISTOGRAM_BINS = 64;
const SAMPLE_STRIDE = 16;

type HistogramData = {
  r: number[];
  g: number[];
  b: number[];
};

const buildHistogram = (data: Uint8ClampedArray) => {
  const r = Array.from({ length: HISTOGRAM_BINS }, () => 0);
  const g = Array.from({ length: HISTOGRAM_BINS }, () => 0);
  const b = Array.from({ length: HISTOGRAM_BINS }, () => 0);

  for (let i = 0; i < data.length; i += SAMPLE_STRIDE) {
    const red = data[i] ?? 0;
    const green = data[i + 1] ?? 0;
    const blue = data[i + 2] ?? 0;
    const rIndex = Math.min(
      HISTOGRAM_BINS - 1,
      Math.floor((red / 255) * (HISTOGRAM_BINS - 1))
    );
    const gIndex = Math.min(
      HISTOGRAM_BINS - 1,
      Math.floor((green / 255) * (HISTOGRAM_BINS - 1))
    );
    const bIndex = Math.min(
      HISTOGRAM_BINS - 1,
      Math.floor((blue / 255) * (HISTOGRAM_BINS - 1))
    );
    r[rIndex] += 1;
    g[gIndex] += 1;
    b[bIndex] += 1;
  }

  let max = 1;
  for (let i = 0; i < HISTOGRAM_BINS; i += 1) {
    max = Math.max(max, r[i], g[i], b[i]);
  }

  return {
    r: r.map((value) => value / max),
    g: g.map((value) => value / max),
    b: b.map((value) => value / max),
  };
};

const buildPath = (values: number[]) => {
  if (values.length === 0) {
    return "";
  }
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - value * 100;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
};

const buildArea = (values: number[]) => {
  const line = buildPath(values);
  if (!line) {
    return "";
  }
  return `${line} L 100,100 L 0,100 Z`;
};

export function EditorHistogram({ asset }: { asset: Asset | null }) {
  const [histogram, setHistogram] = useState<HistogramData | null>(null);

  useEffect(() => {
    if (!asset) {
      setHistogram(null);
      return;
    }
    let isCancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.src = asset.thumbnailUrl ?? asset.objectUrl;

    const compute = async () => {
      try {
        await image.decode();
      } catch {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("Failed to load histogram image"));
        });
      }
      if (isCancelled) {
        return;
      }
      const width = 240;
      const ratio = image.naturalWidth
        ? image.naturalHeight / image.naturalWidth
        : 1;
      const height = Math.max(1, Math.round(width * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      if (!isCancelled) {
        setHistogram(buildHistogram(imageData.data));
      }
    };

    void compute();
    return () => {
      isCancelled = true;
    };
  }, [asset?.objectUrl, asset?.thumbnailUrl]);

  const paths = useMemo(() => {
    if (!histogram) {
      return null;
    }
    return {
      r: {
        line: buildPath(histogram.r),
        area: buildArea(histogram.r),
      },
      g: {
        line: buildPath(histogram.g),
        area: buildArea(histogram.g),
      },
      b: {
        line: buildPath(histogram.b),
        area: buildArea(histogram.b),
      },
    };
  }, [histogram]);

  if (!paths) {
    return (
      <div className="flex h-28 w-full items-center justify-center text-xs text-slate-500">
        直方图生成中
      </div>
    );
  }

  return (
    <div className="h-28 w-full">
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="直方图"
      >
        <path d={paths.r.area} fill="rgba(248,113,113,0.25)" />
        <path d={paths.g.area} fill="rgba(52,211,153,0.25)" />
        <path d={paths.b.area} fill="rgba(96,165,250,0.25)" />
        <path d={paths.r.line} stroke="#f87171" strokeWidth="1" fill="none" />
        <path d={paths.g.line} stroke="#34d399" strokeWidth="1" fill="none" />
        <path d={paths.b.line} stroke="#60a5fa" strokeWidth="1" fill="none" />
      </svg>
    </div>
  );
}
