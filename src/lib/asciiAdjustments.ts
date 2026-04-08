import type { AsciiAdjustments } from "@/types";

const formatNumberToken = (value: number, precision = 2) => {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return value.toFixed(precision);
};

export const asciiAdjustmentsEqual = (
  left: AsciiAdjustments | undefined,
  right: AsciiAdjustments | undefined
) => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.enabled === right.enabled &&
    left.charsetPreset === right.charsetPreset &&
    left.colorMode === right.colorMode &&
    left.cellSize === right.cellSize &&
    left.characterSpacing === right.characterSpacing &&
    left.contrast === right.contrast &&
    left.dither === right.dither &&
    left.invert === right.invert
  );
};

export const buildAsciiOutputToken = (ascii: AsciiAdjustments | undefined) => {
  if (!ascii?.enabled) {
    return "ascii:off";
  }
  return [
    "ascii:on",
    ascii.charsetPreset,
    ascii.colorMode,
    formatNumberToken(ascii.cellSize, 0),
    formatNumberToken(ascii.characterSpacing),
    formatNumberToken(ascii.contrast),
    ascii.dither,
    ascii.invert ? "1" : "0",
  ].join(":");
};
