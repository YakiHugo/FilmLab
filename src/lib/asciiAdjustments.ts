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
    left.customCharset === right.customCharset &&
    left.invert === right.invert &&
    left.brightness === right.brightness &&
    left.contrast === right.contrast &&
    left.density === right.density &&
    left.coverage === right.coverage &&
    left.edgeEmphasis === right.edgeEmphasis &&
    left.renderMode === right.renderMode &&
    left.cellSize === right.cellSize &&
    left.characterSpacing === right.characterSpacing &&
    left.foregroundOpacity === right.foregroundOpacity &&
    left.foregroundBlendMode === right.foregroundBlendMode &&
    left.gridOverlay === right.gridOverlay &&
    left.backgroundMode === right.backgroundMode &&
    left.backgroundColor === right.backgroundColor &&
    left.backgroundBlur === right.backgroundBlur &&
    left.backgroundOpacity === right.backgroundOpacity &&
    left.colorMode === right.colorMode &&
    left.dither === right.dither
  );
};

export const buildAsciiOutputToken = (ascii: AsciiAdjustments | undefined) => {
  if (!ascii?.enabled) {
    return "ascii:off";
  }
  return [
    "ascii:on",
    ascii.charsetPreset,
    // Custom charset contributes only when the preset is "custom"; other
    // presets use their own candidate set and the custom string is ignored,
    // so excluding it from the token prevents spurious cache invalidation
    // while the user types a string they're not yet applying.
    ascii.charsetPreset === "custom" ? ascii.customCharset : "-",
    ascii.colorMode,
    ascii.renderMode,
    formatNumberToken(ascii.cellSize, 0),
    formatNumberToken(ascii.characterSpacing),
    formatNumberToken(ascii.contrast),
    formatNumberToken(ascii.brightness, 0),
    formatNumberToken(ascii.density),
    formatNumberToken(ascii.coverage),
    formatNumberToken(ascii.edgeEmphasis),
    formatNumberToken(ascii.foregroundOpacity),
    ascii.foregroundBlendMode,
    ascii.gridOverlay ? "1" : "0",
    ascii.backgroundMode,
    ascii.backgroundColor,
    formatNumberToken(ascii.backgroundBlur, 0),
    formatNumberToken(ascii.backgroundOpacity),
    ascii.dither,
    ascii.invert ? "1" : "0",
  ].join(":");
};
