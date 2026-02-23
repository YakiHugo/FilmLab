import { clamp } from "@/lib/math";
import type { HslColorKey } from "@/types";

export const rgbToHue = (red: number, green: number, blue: number) => {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) {
    return 0;
  }
  let hue: number;
  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }
  return (hue * 60 + 360) % 360;
};

export const mapHueToHslColor = (hue: number): HslColorKey => {
  if (hue < 15 || hue >= 345) {
    return "red";
  }
  if (hue < 40) {
    return "orange";
  }
  if (hue < 70) {
    return "yellow";
  }
  if (hue < 170) {
    return "green";
  }
  if (hue < 200) {
    return "aqua";
  }
  if (hue < 255) {
    return "blue";
  }
  if (hue < 300) {
    return "purple";
  }
  return "magenta";
};

export const toHex = (value: number) => {
  const clamped = clamp(Math.round(value), 0, 255);
  return clamped.toString(16).padStart(2, "0");
};
