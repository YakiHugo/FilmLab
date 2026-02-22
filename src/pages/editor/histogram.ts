const HISTOGRAM_BINS = 64;
const SAMPLE_STRIDE = 16;
const DELTA_BINS = 256;
const TRANSPARENT_ALPHA_THRESHOLD = 8;
const MONOCHROME_P95_THRESHOLD = 8;
const MONOCHROME_MEAN_THRESHOLD = 5;
const MONOCHROME_MAX_ABS_BIN_DELTA_THRESHOLD = 0.04;
const MONOCHROME_L1_BIN_DELTA_THRESHOLD = 0.75;

export type HistogramMode = "rgb" | "rgb-monochrome-overlap";

export interface HistogramAnalysis {
  isMonochrome: boolean;
  sampleCount: number;
  meanChannelDelta: number;
  p95ChannelDelta: number;
}

export type HistogramData = {
  r: number[];
  g: number[];
  b: number[];
  luma: number[];
  mode: HistogramMode;
  analysis: HistogramAnalysis;
};

export const forceMonochromeHistogramMode = (
  histogram: HistogramData | null
): HistogramData | null => {
  if (!histogram || histogram.mode === "rgb-monochrome-overlap") {
    return histogram;
  }
  return {
    ...histogram,
    mode: "rgb-monochrome-overlap",
    analysis: {
      ...histogram.analysis,
      isMonochrome: true,
    },
  };
};

const resolveBinIndex = (value: number) =>
  Math.min(HISTOGRAM_BINS - 1, Math.floor((value / 255) * (HISTOGRAM_BINS - 1)));

const createBins = () => Array.from({ length: HISTOGRAM_BINS }, () => 0);

const normalizeBins = (values: number[], max: number) =>
  values.map((value) => value / max);

const resolveP95ChannelDelta = (deltaDistribution: number[], sampleCount: number) => {
  if (sampleCount <= 0) {
    return 0;
  }
  const p95Rank = Math.ceil(sampleCount * 0.95);
  let cumulative = 0;
  for (let delta = 0; delta < DELTA_BINS; delta += 1) {
    cumulative += deltaDistribution[delta] ?? 0;
    if (cumulative >= p95Rank) {
      return delta;
    }
  }
  return DELTA_BINS - 1;
};

const createEmptyAnalysis = (): HistogramAnalysis => ({
  isMonochrome: false,
  sampleCount: 0,
  meanChannelDelta: 0,
  p95ChannelDelta: 0,
});

const resolveChannelHistogramDistance = (a: number[], b: number[]) => {
  let l1 = 0;
  let maxAbs = 0;
  for (let i = 0; i < HISTOGRAM_BINS; i += 1) {
    const delta = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    l1 += delta;
    maxAbs = Math.max(maxAbs, delta);
  }
  return { l1, maxAbs };
};

export const buildHistogram = (data: Uint8ClampedArray): HistogramData => {
  const r = createBins();
  const g = createBins();
  const b = createBins();
  const luma = createBins();
  const deltaDistribution = Array.from({ length: DELTA_BINS }, () => 0);
  let sampleCount = 0;
  let channelDeltaTotal = 0;

  for (let i = 0; i < data.length; i += SAMPLE_STRIDE) {
    const alpha = data[i + 3] ?? 255;
    if (alpha <= TRANSPARENT_ALPHA_THRESHOLD) {
      continue;
    }
    const red = data[i] ?? 0;
    const green = data[i + 1] ?? 0;
    const blue = data[i + 2] ?? 0;
    const lumaValue = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const channelDelta = Math.max(red, green, blue) - Math.min(red, green, blue);

    r[resolveBinIndex(red)] += 1;
    g[resolveBinIndex(green)] += 1;
    b[resolveBinIndex(blue)] += 1;
    luma[resolveBinIndex(lumaValue)] += 1;
    deltaDistribution[channelDelta] += 1;
    channelDeltaTotal += channelDelta;
    sampleCount += 1;
  }

  if (sampleCount === 0) {
    return {
      r,
      g,
      b,
      luma,
      mode: "rgb",
      analysis: createEmptyAnalysis(),
    };
  }

  let max = 1;
  for (let i = 0; i < HISTOGRAM_BINS; i += 1) {
    max = Math.max(max, r[i] ?? 0, g[i] ?? 0, b[i] ?? 0, luma[i] ?? 0);
  }

  const meanChannelDelta = channelDeltaTotal / sampleCount;
  const p95ChannelDelta = resolveP95ChannelDelta(deltaDistribution, sampleCount);
  const normalizedR = normalizeBins(r, max);
  const normalizedG = normalizeBins(g, max);
  const normalizedB = normalizeBins(b, max);
  const normalizedLuma = normalizeBins(luma, max);
  const strictMonochromeByPixelDelta =
    p95ChannelDelta <= MONOCHROME_P95_THRESHOLD &&
    meanChannelDelta <= MONOCHROME_MEAN_THRESHOLD;
  const rgDistance = resolveChannelHistogramDistance(normalizedR, normalizedG);
  const rbDistance = resolveChannelHistogramDistance(normalizedR, normalizedB);
  const gbDistance = resolveChannelHistogramDistance(normalizedG, normalizedB);
  const maxAbsBinDelta = Math.max(
    rgDistance.maxAbs,
    rbDistance.maxAbs,
    gbDistance.maxAbs
  );
  const maxL1BinDelta = Math.max(rgDistance.l1, rbDistance.l1, gbDistance.l1);
  const monochromeByHistogramOverlap =
    maxAbsBinDelta <= MONOCHROME_MAX_ABS_BIN_DELTA_THRESHOLD &&
    maxL1BinDelta <= MONOCHROME_L1_BIN_DELTA_THRESHOLD;
  const isMonochrome = strictMonochromeByPixelDelta || monochromeByHistogramOverlap;

  return {
    r: normalizedR,
    g: normalizedG,
    b: normalizedB,
    luma: normalizedLuma,
    mode: isMonochrome ? "rgb-monochrome-overlap" : "rgb",
    analysis: {
      isMonochrome,
      sampleCount,
      meanChannelDelta,
      p95ChannelDelta,
    },
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
