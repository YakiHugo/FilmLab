import type { PointCurvePoint } from "@/types";

export interface GeometryUniforms {
  enabled: boolean;
  cropRect: [number, number, number, number];
  sourceSize: [number, number];
  outputSize: [number, number];
  translatePx: [number, number];
  rotate: number;
  perspectiveEnabled: boolean;
  homography: number[];
  scale: number;
  flip: [number, number];
  lensEnabled: boolean;
  lensK1: number;
  lensK2: number;
  lensVignetteBoost: number;
  caEnabled: boolean;
  caAmountPxRgb: [number, number, number];
}

export interface MasterUniforms {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  whiteBalanceLmsScale: [number, number, number];
  hueShift: number;
  saturation: number;
  vibrance: number;
  luminance: number;
  curveHighlights: number;
  curveLights: number;
  curveDarks: number;
  curveShadows: number;
  colorGradeShadows: [number, number, number];
  colorGradeMidtones: [number, number, number];
  colorGradeHighlights: [number, number, number];
  colorGradeBlend: number;
  colorGradeBalance: number;
  dehaze: number;
}

export interface HSLUniforms {
  enabled: boolean;
  hue: [number, number, number, number, number, number, number, number];
  saturation: [number, number, number, number, number, number, number, number];
  luminance: [number, number, number, number, number, number, number, number];
  bwEnabled: boolean;
  bwMix: [number, number, number];
  calibrationEnabled: boolean;
  calibrationHue: [number, number, number];
  calibrationSaturation: [number, number, number];
}

export interface CurveUniforms {
  enabled: boolean;
  rgb: PointCurvePoint[];
  red: PointCurvePoint[];
  green: PointCurvePoint[];
  blue: PointCurvePoint[];
}

export interface DetailUniforms {
  enabled: boolean;
  texture: number;
  clarity: number;
  sharpening: number;
  sharpenRadius: number;
  sharpenDetail: number;
  masking: number;
  noiseReduction: number;
  colorNoiseReduction: number;
}

export interface FilmUniforms {
  u_expandEnabled: boolean;
  u_expandBlackPoint: number;
  u_expandWhitePoint: number;

  u_filmCompressionEnabled: boolean;
  u_highlightRolloff: number;
  u_shoulderWidth: number;

  u_filmDeveloperEnabled: boolean;
  u_developerContrast: number;
  u_developerGamma: number;
  u_colorSeparation: [number, number, number];

  u_toneEnabled: boolean;
  u_shoulder: number;
  u_toe: number;
  u_gamma: number;

  u_colorMatrixEnabled: boolean;
  u_colorMatrix: number[];

  u_lutEnabled: boolean;
  u_lutIntensity: number;

  u_printEnabled: boolean;
  u_printDensity: number;
  u_printContrast: number;
  u_printWarmth: number;
  u_printStock: number;
  u_printLutEnabled: boolean;
  u_printLutIntensity: number;

  u_cmyColorHeadEnabled: boolean;
  u_cyan: number;
  u_magenta: number;
  u_yellow: number;

  u_colorCastEnabled: boolean;
  u_colorCastShadows: [number, number, number];
  u_colorCastMidtones: [number, number, number];
  u_colorCastHighlights: [number, number, number];

  u_printToningEnabled: boolean;
  u_toningShadows: [number, number, number];
  u_toningMidtones: [number, number, number];
  u_toningHighlights: [number, number, number];
  u_toningStrength: number;

  u_customLutEnabled: boolean;
  u_customLutIntensity: number;

  u_grainEnabled: boolean;
  u_grainModel: number;
  u_grainAmount: number;
  u_grainSize: number;
  u_grainRoughness: number;
  u_grainShadowBias: number;
  u_grainSeed: number;
  u_grainIsColor: boolean;
  u_crystalDensity: number;
  u_crystalSizeMean: number;
  u_crystalSizeVariance: number;
  u_grainColorSeparation: [number, number, number];
  u_scannerMTF: number;
  u_filmFormat: number;

  u_vignetteEnabled: boolean;
  u_vignetteAmount: number;
  u_vignetteMidpoint: number;
  u_vignetteRoundness: number;

  u_filmBreathEnabled: boolean;
  u_breathAmount: number;
  u_breathSeed: number;

  u_filmDamageEnabled: boolean;
  u_damageAmount: number;
  u_damageSeed: number;

  u_overscanEnabled: boolean;
  u_overscanAmount: number;
  u_overscanRoundness: number;
}

export interface HalationBloomUniforms {
  halationEnabled: boolean;
  halationThreshold: number;
  halationIntensity: number;
  halationColor?: [number, number, number];
  halationHue?: number;
  halationSaturation?: number;
  halationBlueCompensation?: number;
  halationRadius?: number;
  bloomEnabled: boolean;
  bloomThreshold: number;
  bloomIntensity: number;
  bloomRadius?: number;
  glowEnabled: boolean;
  glowIntensity: number;
  glowMidtoneFocus: number;
  glowBias: number;
  glowRadius?: number;
}
