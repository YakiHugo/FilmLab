const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface Filter2dPostProcessingParams {
  brightness: number;
  hue: number;
  blur: number;
  dilate: number;
}

export const hasFilter2dPostProcessing = (params: Filter2dPostProcessingParams) =>
  Math.abs(params.brightness) > 0.001 ||
  Math.abs(params.hue) > 0.001 ||
  params.blur > 0.001 ||
  params.dilate > 0.001;

export const resolveBlurRadiusPx = (value: number, shortEdge: number) =>
  (clamp(value, 0, 100) / 100) * Math.max(1, Math.min(18, shortEdge * 0.03));

export const resolveDilateRadiusPx = (value: number, shortEdge: number) =>
  Math.round((clamp(value, 0, 100) / 100) * Math.max(1, Math.min(4, shortEdge * 0.006)));

export const clampFilter2dValue = clamp;
