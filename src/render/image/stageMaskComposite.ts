import {
  buildImageRenderMaskRevisionKey,
  renderImageEffectMaskToCanvas,
} from "./effectMask";
import type { ImageRenderMaskDefinition } from "./types";

export const createCanvasLayer = (sourceCanvas: HTMLCanvasElement) => {
  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error("Failed to acquire stage layer context.");
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sourceCanvas, 0, 0);
  return canvas;
};

const blendMaskedLayerIntoCanvas = ({
  baseCanvas,
  effectCanvas,
  maskCanvas,
  targetCanvas,
}: {
  baseCanvas: HTMLCanvasElement;
  effectCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
  targetCanvas: HTMLCanvasElement;
}) => {
  const width = Math.max(1, targetCanvas.width);
  const height = Math.max(1, targetCanvas.height);
  const baseContext = baseCanvas.getContext("2d", { willReadFrequently: true });
  const effectContext = effectCanvas.getContext("2d", { willReadFrequently: true });
  const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
  const targetContext = targetCanvas.getContext("2d", { willReadFrequently: true });
  if (!baseContext || !effectContext || !maskContext || !targetContext) {
    return false;
  }

  const baseImage = baseContext.getImageData(0, 0, width, height);
  const effectImage = effectContext.getImageData(0, 0, width, height);
  const maskImage = maskContext.getImageData(0, 0, width, height);
  const outputImage = targetContext.createImageData(width, height);
  const basePixels = baseImage.data;
  const effectPixels = effectImage.data;
  const maskPixels = maskImage.data;
  const outputPixels = outputImage.data;

  for (let index = 0; index < outputPixels.length; index += 4) {
    const mix = (maskPixels[index + 3] ?? 0) / 255;
    const baseAlpha = (basePixels[index + 3] ?? 0) / 255;
    const effectAlpha = (effectPixels[index + 3] ?? 0) / 255;
    const outputAlpha = baseAlpha + (effectAlpha - baseAlpha) * mix;

    const basePremultRed = ((basePixels[index] ?? 0) / 255) * baseAlpha;
    const basePremultGreen = ((basePixels[index + 1] ?? 0) / 255) * baseAlpha;
    const basePremultBlue = ((basePixels[index + 2] ?? 0) / 255) * baseAlpha;
    const effectPremultRed = ((effectPixels[index] ?? 0) / 255) * effectAlpha;
    const effectPremultGreen = ((effectPixels[index + 1] ?? 0) / 255) * effectAlpha;
    const effectPremultBlue = ((effectPixels[index + 2] ?? 0) / 255) * effectAlpha;

    const outputPremultRed = basePremultRed + (effectPremultRed - basePremultRed) * mix;
    const outputPremultGreen = basePremultGreen + (effectPremultGreen - basePremultGreen) * mix;
    const outputPremultBlue = basePremultBlue + (effectPremultBlue - basePremultBlue) * mix;

    outputPixels[index] =
      outputAlpha > 1e-6 ? Math.round((outputPremultRed / outputAlpha) * 255) : 0;
    outputPixels[index + 1] =
      outputAlpha > 1e-6 ? Math.round((outputPremultGreen / outputAlpha) * 255) : 0;
    outputPixels[index + 2] =
      outputAlpha > 1e-6 ? Math.round((outputPremultBlue / outputAlpha) * 255) : 0;
    outputPixels[index + 3] = Math.round(outputAlpha * 255);
  }

  targetContext.clearRect(0, 0, width, height);
  targetContext.putImageData(outputImage, 0, 0);
  return true;
};

export const applyMaskedStageOperation = async ({
  canvas,
  maskDefinition,
  maskReferenceCanvas,
  applyOperation,
}: {
  canvas: HTMLCanvasElement;
  maskDefinition: ImageRenderMaskDefinition | null;
  maskReferenceCanvas: HTMLCanvasElement;
  applyOperation: (options: {
    canvas: HTMLCanvasElement;
    maskRevisionKey: string | null;
  }) => void | Promise<void>;
}) => {
  if (!maskDefinition) {
    await applyOperation({
      canvas,
      maskRevisionKey: null,
    });
    return;
  }

  const baseCanvas = createCanvasLayer(canvas);
  const effectCanvas = createCanvasLayer(canvas);
  const maskCanvas = document.createElement("canvas");
  const scratchCanvas = document.createElement("canvas");

  try {
    await applyOperation({
      canvas: effectCanvas,
      maskRevisionKey: buildImageRenderMaskRevisionKey(maskDefinition),
    });
    const renderedMaskCanvas = renderImageEffectMaskToCanvas({
      width: effectCanvas.width,
      height: effectCanvas.height,
      maskDefinition,
      referenceSource: maskReferenceCanvas,
      targetCanvas: maskCanvas,
      scratchCanvas,
    });
    if (!renderedMaskCanvas) {
      return;
    }

    blendMaskedLayerIntoCanvas({
      baseCanvas,
      effectCanvas,
      maskCanvas: renderedMaskCanvas,
      targetCanvas: canvas,
    });
  } finally {
    baseCanvas.width = 0;
    baseCanvas.height = 0;
    effectCanvas.width = 0;
    effectCanvas.height = 0;
    maskCanvas.width = 0;
    maskCanvas.height = 0;
    scratchCanvas.width = 0;
    scratchCanvas.height = 0;
  }
};
