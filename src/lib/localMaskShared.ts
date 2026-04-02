import { clamp } from "@/lib/math";
import type { LocalAdjustmentMask } from "@/types";

export interface LocalMaskLumaRange {
  min: number;
  max: number;
  feather: number;
}

export interface LocalMaskColorRange {
  hueCenter: number;
  hueRange: number;
  hueFeather: number;
  satMin: number;
  satFeather: number;
}

export const resolveLocalMaskLumaRange = (mask: LocalAdjustmentMask): LocalMaskLumaRange => {
  const min = clamp(mask.lumaMin ?? 0, 0, 1);
  const max = clamp(mask.lumaMax ?? 1, 0, 1);
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
    feather: clamp(mask.lumaFeather ?? 0, 0, 1),
  };
};

export const resolveLocalMaskColorRange = (mask: LocalAdjustmentMask): LocalMaskColorRange => ({
  hueCenter: (((mask.hueCenter ?? 0) % 360) + 360) % 360,
  hueRange: clamp(mask.hueRange ?? 180, 0, 180),
  hueFeather: clamp(mask.hueFeather ?? 0, 0, 180),
  satMin: clamp(mask.satMin ?? 0, 0, 1),
  satFeather: clamp(mask.satFeather ?? 0, 0, 1),
});

export const hasLocalMaskRangeConstraints = (mask: LocalAdjustmentMask) => {
  const lumaRange = resolveLocalMaskLumaRange(mask);
  const colorRange = resolveLocalMaskColorRange(mask);
  const hasLumaRange = !(lumaRange.min <= 0.0001 && lumaRange.max >= 0.9999);
  const hasColorRange = !(colorRange.hueRange >= 179.999 && colorRange.satMin <= 1e-4);
  return hasLumaRange || hasColorRange;
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
  if (Math.abs(edge1 - edge0) < 1e-6) {
    return x >= edge1 ? 1 : 0;
  }
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const resolveHueDistance = (a: number, b: number) => {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
};

export const resolveHueSatFromRgb = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  const sat = max <= 1e-6 ? 0 : diff / max;
  if (diff <= 1e-6) {
    return { hue: 0, sat };
  }

  let hue: number;
  if (max === r) {
    hue = ((g - b) / diff) % 6;
  } else if (max === g) {
    hue = (b - r) / diff + 2;
  } else {
    hue = (r - g) / diff + 4;
  }
  hue *= 60;
  if (hue < 0) {
    hue += 360;
  }
  return {
    hue,
    sat,
  };
};

export const resolveLocalMaskLumaWeight = (luma: number, range: LocalMaskLumaRange) => {
  if (luma < range.min) {
    if (range.feather <= 1e-4) {
      return 0;
    }
    return smoothstep(range.min - range.feather, range.min, luma);
  }
  if (luma > range.max) {
    if (range.feather <= 1e-4) {
      return 0;
    }
    return 1 - smoothstep(range.max, range.max + range.feather, luma);
  }
  return 1;
};

export const resolveLocalMaskColorWeight = (
  hue: number,
  sat: number,
  range: LocalMaskColorRange
) => {
  let hueWeight = 1;
  if (range.hueRange < 179.999) {
    if (sat <= 1e-3) {
      return 0;
    }
    const distance = resolveHueDistance(hue, range.hueCenter);
    if (distance <= range.hueRange) {
      hueWeight = 1;
    } else if (range.hueFeather <= 1e-4) {
      hueWeight = 0;
    } else {
      hueWeight =
        1 - smoothstep(range.hueRange, Math.min(180, range.hueRange + range.hueFeather), distance);
    }
  }

  let satWeight = 1;
  if (range.satMin > 1e-4) {
    if (range.satFeather <= 1e-4) {
      satWeight = sat >= range.satMin ? 1 : 0;
    } else {
      satWeight = smoothstep(range.satMin, Math.min(1, range.satMin + range.satFeather), sat);
    }
  }

  return hueWeight * satWeight;
};
