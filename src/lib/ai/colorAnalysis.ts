export interface HistogramSummary {
  meanBrightness: number;
  contrastSpread: number;
  temperature: "warm" | "neutral" | "cool";
  saturationLevel: "low" | "medium" | "high";
  shadowCharacter: "crushed" | "normal" | "lifted";
  highlightCharacter: "clipped" | "normal" | "rolled";
  isMonochrome: boolean;
}

interface HistogramBins {
  r: number[];
  g: number[];
  b: number[];
  luma: number[];
}

export function analyzeHistogram(histogram: HistogramBins): HistogramSummary {
  const bins = histogram.luma.length;
  const totalLuma = histogram.luma.reduce((a, b) => a + b, 0) || 1;

  // Mean brightness (weighted average of luma bins, scaled to 0-255)
  let meanBrightness = 0;
  for (let i = 0; i < bins; i++) {
    meanBrightness += (i / (bins - 1)) * 255 * (histogram.luma[i] / totalLuma);
  }

  // Contrast spread (stddev of luma distribution)
  let variance = 0;
  for (let i = 0; i < bins; i++) {
    const binValue = (i / (bins - 1)) * 255;
    variance += Math.pow(binValue - meanBrightness, 2) * (histogram.luma[i] / totalLuma);
  }
  const contrastSpread = Math.sqrt(variance);

  // Temperature: compare red vs blue channel centroids
  const totalR = histogram.r.reduce((a, b) => a + b, 0) || 1;
  const totalB = histogram.b.reduce((a, b) => a + b, 0) || 1;
  let rCentroid = 0;
  let bCentroid = 0;
  for (let i = 0; i < bins; i++) {
    const norm = i / (bins - 1);
    rCentroid += norm * (histogram.r[i] / totalR);
    bCentroid += norm * (histogram.b[i] / totalB);
  }
  const tempDiff = rCentroid - bCentroid;
  const temperature: HistogramSummary["temperature"] =
    tempDiff > 0.03 ? "warm" : tempDiff < -0.03 ? "cool" : "neutral";

  // Saturation level: mean channel delta
  let meanChannelDelta = 0;
  let sampleCount = 0;
  for (let i = 0; i < bins; i++) {
    const maxCh = Math.max(histogram.r[i], histogram.g[i], histogram.b[i]);
    const minCh = Math.min(histogram.r[i], histogram.g[i], histogram.b[i]);
    if (maxCh > 0) {
      meanChannelDelta += (maxCh - minCh) / maxCh;
      sampleCount++;
    }
  }
  meanChannelDelta = sampleCount > 0 ? meanChannelDelta / sampleCount : 0;
  const saturationLevel: HistogramSummary["saturationLevel"] =
    meanChannelDelta < 0.15 ? "low" : meanChannelDelta > 0.4 ? "high" : "medium";

  // Shadow character: check bottom 10% of luma bins
  const lowBinCount = Math.max(1, Math.floor(bins * 0.1));
  let lowSum = 0;
  for (let i = 0; i < lowBinCount; i++) {
    lowSum += histogram.luma[i];
  }
  const lowRatio = lowSum / totalLuma;
  const shadowCharacter: HistogramSummary["shadowCharacter"] =
    lowRatio < 0.01 ? "crushed" : lowRatio > 0.15 ? "lifted" : "normal";

  // Highlight character: check top 10% of luma bins
  const highBinStart = bins - lowBinCount;
  let highSum = 0;
  for (let i = highBinStart; i < bins; i++) {
    highSum += histogram.luma[i];
  }
  const highRatio = highSum / totalLuma;
  const highlightCharacter: HistogramSummary["highlightCharacter"] =
    highRatio > 0.15 ? "clipped" : highRatio < 0.01 ? "rolled" : "normal";

  // Monochrome detection: check if RGB channels are nearly identical
  let monoScore = 0;
  for (let i = 0; i < bins; i++) {
    const maxCh = Math.max(histogram.r[i], histogram.g[i], histogram.b[i]);
    const minCh = Math.min(histogram.r[i], histogram.g[i], histogram.b[i]);
    if (maxCh > 0.001) {
      monoScore += (maxCh - minCh) / maxCh;
    }
  }
  const isMonochrome = sampleCount > 0 ? monoScore / sampleCount < 0.08 : false;

  return {
    meanBrightness: Math.round(meanBrightness),
    contrastSpread: Math.round(contrastSpread),
    temperature,
    saturationLevel,
    shadowCharacter,
    highlightCharacter,
    isMonochrome,
  };
}

export function formatHistogramSummary(summary: HistogramSummary): string {
  return [
    `Brightness: ${summary.meanBrightness}/255`,
    `Contrast spread: ${summary.contrastSpread}`,
    `Temperature: ${summary.temperature}`,
    `Saturation: ${summary.saturationLevel}`,
    `Shadows: ${summary.shadowCharacter}`,
    `Highlights: ${summary.highlightCharacter}`,
    summary.isMonochrome ? "Image is monochrome" : "Image is color",
  ].join(", ");
}
