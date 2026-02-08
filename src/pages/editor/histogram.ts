const HISTOGRAM_BINS = 64;
const SAMPLE_STRIDE = 16;

export type HistogramData = {
  r: number[];
  g: number[];
  b: number[];
};

const resolveBinIndex = (value: number) =>
  Math.min(HISTOGRAM_BINS - 1, Math.floor((value / 255) * (HISTOGRAM_BINS - 1)));

export const buildHistogram = (data: Uint8ClampedArray): HistogramData => {
  const r = Array.from({ length: HISTOGRAM_BINS }, () => 0);
  const g = Array.from({ length: HISTOGRAM_BINS }, () => 0);
  const b = Array.from({ length: HISTOGRAM_BINS }, () => 0);

  for (let i = 0; i < data.length; i += SAMPLE_STRIDE) {
    const red = data[i] ?? 0;
    const green = data[i + 1] ?? 0;
    const blue = data[i + 2] ?? 0;

    r[resolveBinIndex(red)] += 1;
    g[resolveBinIndex(green)] += 1;
    b[resolveBinIndex(blue)] += 1;
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

export const buildHistogramFromDrawable = (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  sampleWidth = 240
) => {
  const width = Math.max(1, Math.round(sampleWidth));
  const ratio = sourceHeight / Math.max(1, sourceWidth);
  const height = Math.max(1, Math.round(width * ratio));
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = width;
  sampleCanvas.height = height;
  const context = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.drawImage(source, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return buildHistogram(imageData.data);
};

export const buildHistogramFromCanvas = (canvas: HTMLCanvasElement, sampleWidth = 240) =>
  buildHistogramFromDrawable(canvas, canvas.width, canvas.height, sampleWidth);
