const DEFAULT_SAMPLE_WIDTH = 256;
const DEFAULT_WAVEFORM_WIDTH = 96;
const DEFAULT_WAVEFORM_HEIGHT = 72;
const RGBA_STRIDE = 4;
const TRANSPARENT_ALPHA_THRESHOLD = 8;

export interface WaveformData {
  width: number;
  height: number;
  values: number[];
  maxBin: number;
}

export const buildWaveform = (
  data: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  waveformWidth = DEFAULT_WAVEFORM_WIDTH,
  waveformHeight = DEFAULT_WAVEFORM_HEIGHT
): WaveformData => {
  const width = Math.max(1, Math.round(waveformWidth));
  const height = Math.max(1, Math.round(waveformHeight));
  const values = Array.from({ length: width * height }, () => 0);
  const safeSourceWidth = Math.max(1, Math.round(sourceWidth));
  const safeSourceHeight = Math.max(1, Math.round(sourceHeight));

  for (let sourceY = 0; sourceY < safeSourceHeight; sourceY += 1) {
    for (let sourceX = 0; sourceX < safeSourceWidth; sourceX += 1) {
      const sourceIndex = (sourceY * safeSourceWidth + sourceX) * RGBA_STRIDE;
      const alpha = data[sourceIndex + 3] ?? 255;
      if (alpha <= TRANSPARENT_ALPHA_THRESHOLD) {
        continue;
      }
      const red = data[sourceIndex] ?? 0;
      const green = data[sourceIndex + 1] ?? 0;
      const blue = data[sourceIndex + 2] ?? 0;
      const luma = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
      const x = Math.min(width - 1, Math.floor((sourceX / safeSourceWidth) * width));
      const y = Math.min(height - 1, Math.floor((1 - luma) * (height - 1)));
      const bucketIndex = y * width + x;
      values[bucketIndex] = (values[bucketIndex] ?? 0) + 1;
    }
  }

  const maxBin = values.reduce((current, value) => Math.max(current, value), 0);
  if (maxBin <= 0) {
    return { width, height, values, maxBin: 0 };
  }

  return {
    width,
    height,
    values: values.map((value) => Math.sqrt(value / maxBin)),
    maxBin,
  };
};

export const buildWaveformFromDrawable = (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  sampleWidth = DEFAULT_SAMPLE_WIDTH,
  waveformWidth = DEFAULT_WAVEFORM_WIDTH,
  waveformHeight = DEFAULT_WAVEFORM_HEIGHT
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
  return buildWaveform(imageData.data, width, height, waveformWidth, waveformHeight);
};

export const buildWaveformFromCanvas = (
  canvas: HTMLCanvasElement,
  sampleWidth = DEFAULT_SAMPLE_WIDTH,
  waveformWidth = DEFAULT_WAVEFORM_WIDTH,
  waveformHeight = DEFAULT_WAVEFORM_HEIGHT
) =>
  buildWaveformFromDrawable(
    canvas,
    canvas.width,
    canvas.height,
    sampleWidth,
    waveformWidth,
    waveformHeight
  );
