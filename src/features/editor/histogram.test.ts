import { describe, expect, it } from "vitest";
import { buildHistogram, forceMonochromeHistogramMode, type HistogramData } from "./histogram";

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const createPixelData = (
  pixelCount: number,
  resolvePixel: (index: number) => [number, number, number, number]
) => {
  const data = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i += 1) {
    const [r, g, b, a] = resolvePixel(i);
    const offset = i * 4;
    data[offset] = clampByte(r);
    data[offset + 1] = clampByte(g);
    data[offset + 2] = clampByte(b);
    data[offset + 3] = clampByte(a);
  }
  return data;
};

const collectBins = (histogram: HistogramData) => [
  ...histogram.r,
  ...histogram.g,
  ...histogram.b,
  ...histogram.luma,
];

describe("buildHistogram", () => {
  it("detects a pure grayscale gradient as monochrome overlap", () => {
    const data = createPixelData(512, (index) => {
      const value = index % 256;
      return [value, value, value, 255];
    });

    const histogram = buildHistogram(data);

    expect(histogram.mode).toBe("rgb-monochrome-overlap");
    expect(histogram.analysis.isMonochrome).toBe(true);
    expect(histogram.analysis.sampleCount).toBeGreaterThan(0);
    expect(histogram.analysis.p95ChannelDelta).toBeLessThanOrEqual(4);
  });

  it("keeps monochrome mode for grayscale with light channel noise", () => {
    const data = createPixelData(768, (index) => {
      const base = (index * 13) % 256;
      const green = base + (index % 3 === 0 ? 1 : 0);
      const blue = base - (index % 5 === 0 ? 1 : 0);
      return [base, green, blue, 255];
    });

    const histogram = buildHistogram(data);

    expect(histogram.mode).toBe("rgb-monochrome-overlap");
    expect(histogram.analysis.isMonochrome).toBe(true);
  });

  it("keeps monochrome mode for grayscale with medium per-channel noise", () => {
    const data = createPixelData(4096, (index) => {
      const base = (index * 9) % 256;
      const noiseR = ((index * 17) % 11) - 5;
      const noiseG = ((index * 23) % 11) - 5;
      const noiseB = ((index * 29) % 11) - 5;
      return [base + noiseR, base + noiseG, base + noiseB, 255];
    });

    const histogram = buildHistogram(data);

    expect(histogram.mode).toBe("rgb-monochrome-overlap");
    expect(histogram.analysis.isMonochrome).toBe(true);
  });

  it("detects low-saturation color content as RGB", () => {
    const data = createPixelData(512, (index) => {
      const base = (index * 11) % 240;
      return [base + 8, base, base - 8, 255];
    });

    const histogram = buildHistogram(data);

    expect(histogram.mode).toBe("rgb");
    expect(histogram.analysis.isMonochrome).toBe(false);
    expect(histogram.analysis.p95ChannelDelta).toBeGreaterThan(4);
  });

  it("detects high-saturation color content as RGB", () => {
    const data = createPixelData(512, (index) =>
      index % 2 === 0 ? [255, 40, 10, 255] : [15, 180, 250, 255]
    );

    const histogram = buildHistogram(data);

    expect(histogram.mode).toBe("rgb");
    expect(histogram.analysis.isMonochrome).toBe(false);
    expect(histogram.analysis.p95ChannelDelta).toBeGreaterThan(4);
  });

  it("returns stable defaults for fully transparent input", () => {
    const data = createPixelData(400, () => [120, 120, 120, 0]);

    const histogram = buildHistogram(data);
    const allBins = collectBins(histogram);

    expect(histogram.mode).toBe("rgb");
    expect(histogram.analysis.isMonochrome).toBe(false);
    expect(histogram.analysis.sampleCount).toBe(0);
    expect(histogram.analysis.meanChannelDelta).toBe(0);
    expect(histogram.analysis.p95ChannelDelta).toBe(0);
    expect(allBins.every((value) => value === 0)).toBe(true);
  });

  it("normalizes all histogram channels into [0, 1]", () => {
    const data = createPixelData(1024, (index) => [
      (index * 7) % 256,
      (index * 17) % 256,
      (index * 29) % 256,
      255,
    ]);

    const histogram = buildHistogram(data);
    const allBins = collectBins(histogram);
    const maxBin = Math.max(...allBins);

    expect(allBins.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(maxBin).toBe(1);
  });

  it("forces monochrome display mode when requested", () => {
    const data = createPixelData(1024, (index) => [
      index % 2 === 0 ? 255 : 30,
      index % 2 === 0 ? 40 : 200,
      index % 2 === 0 ? 10 : 250,
      255,
    ]);
    const histogram = buildHistogram(data);
    const forced = forceMonochromeHistogramMode(histogram);

    expect(histogram.mode).toBe("rgb");
    expect(forced?.mode).toBe("rgb-monochrome-overlap");
    expect(forced?.analysis.isMonochrome).toBe(true);
  });
});
