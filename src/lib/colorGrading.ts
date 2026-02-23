import { clamp } from "@/lib/math";
import type { EditingAdjustments } from "@/types";

const luminance = (red: number, green: number, blue: number) =>
  red * 0.2126 + green * 0.7152 + blue * 0.0722;

const hsvToRgb = (hue: number, saturation: number, value: number) => {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = value * saturation;
  const section = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const sectionIndex = Math.floor(section) % 6;
  let red = 0;
  let green = 0;
  let blue = 0;
  switch (sectionIndex) {
    case 0:
      red = chroma;
      green = x;
      break;
    case 1:
      red = x;
      green = chroma;
      break;
    case 2:
      green = chroma;
      blue = x;
      break;
    case 3:
      green = x;
      blue = chroma;
      break;
    case 4:
      red = x;
      blue = chroma;
      break;
    default:
      red = chroma;
      blue = x;
      break;
  }
  const match = value - chroma;
  return {
    red: red + match,
    green: green + match,
    blue: blue + match,
  };
};

export const applyColorGradingToImageData = (
  imageData: ImageData,
  grading: EditingAdjustments["colorGrading"]
) => {
  const blend = clamp(grading.blend / 100, 0, 1);
  if (blend <= 0.0001) {
    return;
  }

  const balance = clamp(grading.balance / 100, -1, 1);
  const shadowEdge = clamp(0.45 + balance * 0.2, 0.2, 0.7);
  const highlightEdge = clamp(0.55 + balance * 0.2, 0.3, 0.8);
  const data = imageData.data;

  const shadowColor = hsvToRgb(
    grading.shadows.hue,
    clamp(grading.shadows.saturation / 100, 0, 1),
    1
  );
  const midtoneColor = hsvToRgb(
    grading.midtones.hue,
    clamp(grading.midtones.saturation / 100, 0, 1),
    1
  );
  const highlightColor = hsvToRgb(
    grading.highlights.hue,
    clamp(grading.highlights.saturation / 100, 0, 1),
    1
  );
  const shadowLum = clamp(grading.shadows.luminance / 100, -1, 1);
  const midtoneLum = clamp(grading.midtones.luminance / 100, -1, 1);
  const highlightLum = clamp(grading.highlights.luminance / 100, -1, 1);

  for (let index = 0; index < data.length; index += 4) {
    const red = (data[index] ?? 0) / 255;
    const green = (data[index + 1] ?? 0) / 255;
    const blue = (data[index + 2] ?? 0) / 255;

    const lum = luminance(red, green, blue);
    const wShadows = 1 - clamp((lum - 0.05) / Math.max(shadowEdge - 0.05, 0.001), 0, 1);
    const wHighlights = clamp((lum - highlightEdge) / Math.max(0.95 - highlightEdge, 0.001), 0, 1);
    const wMidtones = clamp(1 - wShadows - wHighlights, 0, 1);

    let nextRed =
      red +
      ((shadowColor.red - 0.5) * wShadows +
        (midtoneColor.red - 0.5) * wMidtones +
        (highlightColor.red - 0.5) * wHighlights) *
        blend *
        0.45;
    let nextGreen =
      green +
      ((shadowColor.green - 0.5) * wShadows +
        (midtoneColor.green - 0.5) * wMidtones +
        (highlightColor.green - 0.5) * wHighlights) *
        blend *
        0.45;
    let nextBlue =
      blue +
      ((shadowColor.blue - 0.5) * wShadows +
        (midtoneColor.blue - 0.5) * wMidtones +
        (highlightColor.blue - 0.5) * wHighlights) *
        blend *
        0.45;

    const luminanceShift =
      (shadowLum * wShadows + midtoneLum * wMidtones + highlightLum * wHighlights) * blend * 0.25;
    const luminanceScale = 1 + luminanceShift;
    nextRed = clamp(nextRed * luminanceScale, 0, 1);
    nextGreen = clamp(nextGreen * luminanceScale, 0, 1);
    nextBlue = clamp(nextBlue * luminanceScale, 0, 1);

    data[index] = Math.round(nextRed * 255);
    data[index + 1] = Math.round(nextGreen * 255);
    data[index + 2] = Math.round(nextBlue * 255);
  }
};
