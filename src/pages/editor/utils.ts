import type { CSSProperties } from "react";
import type { EditingAdjustments } from "@/types";

const GRAIN_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="120" height="120" filter="url(#n)" opacity="0.4"/></svg>'
);
const GRAIN_DATA = `url("data:image/svg+xml;utf8,${GRAIN_SVG}")`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const cloneAdjustments = (value: EditingAdjustments) => {
  if (typeof structuredClone === "function") {
    return structuredClone(value) as EditingAdjustments;
  }
  return JSON.parse(JSON.stringify(value)) as EditingAdjustments;
};

export const buildPreviewFilter = (adjustments: EditingAdjustments) => {
  const exposure = clamp(
    1 +
      adjustments.exposure / 100 +
      (adjustments.highlights + adjustments.whites) / 300 -
      (adjustments.shadows + adjustments.blacks) / 300,
    0.2,
    2.5
  );
  const contrast = clamp(
    1 + adjustments.contrast / 100 + adjustments.clarity / 200 + adjustments.dehaze / 250,
    0,
    2.5
  );
  const saturation = clamp(
    1 + (adjustments.saturation + adjustments.vibrance * 0.6) / 100,
    0,
    3
  );
  const hue = adjustments.temperature * 0.6 + adjustments.tint * 0.4;
  const sepia = clamp(Math.max(0, adjustments.temperature) / 200, 0, 0.35);
  const blur = adjustments.texture < 0 ? clamp(-adjustments.texture / 50, 0, 2) : 0;
  return `brightness(${exposure}) contrast(${contrast}) saturate(${saturation}) hue-rotate(${hue}deg) sepia(${sepia}) blur(${blur}px)`;
};

export const buildPreviewTransform = (adjustments: EditingAdjustments) => {
  const scale = clamp(adjustments.scale / 100, 0.7, 1.3);
  const translateX = clamp(adjustments.horizontal / 5, -20, 20);
  const translateY = clamp(adjustments.vertical / 5, -20, 20);
  return `translate(${translateX}%, ${translateY}%) rotate(${adjustments.rotate}deg) scale(${scale})`;
};

export const getVignetteStyle = (
  adjustments: EditingAdjustments
): CSSProperties | undefined => {
  const strength = adjustments.vignette / 100;
  const opacity = clamp(Math.abs(strength) * 0.65, 0, 0.65);
  if (opacity === 0) {
    return undefined;
  }
  const color = strength >= 0 ? "0,0,0" : "255,255,255";
  return {
    background: `radial-gradient(circle at center, rgba(${color},0) 45%, rgba(${color},${opacity}) 100%)`,
    mixBlendMode: strength >= 0 ? "multiply" : "screen",
    opacity,
  };
};

export const getGrainStyle = (
  adjustments: EditingAdjustments
): CSSProperties | undefined => {
  const intensity = clamp(adjustments.grain / 100, 0, 1);
  const roughness = clamp(adjustments.grainRoughness / 100, 0, 1);
  const opacity = intensity * (0.2 + roughness * 0.25);
  if (opacity === 0) {
    return undefined;
  }
  const size = clamp(120 - adjustments.grainSize + roughness * 20, 20, 140);
  return {
    backgroundImage: GRAIN_DATA,
    backgroundSize: `${size}px ${size}px`,
    opacity,
    mixBlendMode: "soft-light",
  };
};
