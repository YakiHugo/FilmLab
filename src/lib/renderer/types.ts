import type { PointCurvePoint } from "@/types";

/** Uniforms for the Geometry shader pass. */
export interface GeometryUniforms {
  enabled: boolean;
  // Crop rectangle in source UV space: (x, y, w, h)
  cropRect: [number, number, number, number];
  // Source texture size in pixels
  sourceSize: [number, number];
  // Output canvas size in pixels
  outputSize: [number, number];
  // Translation in output pixel space
  translatePx: [number, number];
  // Rotation in radians
  rotate: number;
  // Perspective correction (homography in normalized [-1, 1] space)
  perspectiveEnabled: boolean;
  homography: number[]; // 9 elements, column-major
  // Scale factor [0.5, 2.0]
  scale: number;
  // Flip multipliers (-1 or 1)
  flip: [number, number];
  // Lens profile correction (radial Brown-Conrady k1/k2 terms)
  lensEnabled: boolean;
  lensK1: number;
  lensK2: number;
  lensVignetteBoost: number;
  // Lateral chromatic aberration correction (signed pixel offsets at image edge for R/G/B)
  caEnabled: boolean;
  caAmountPxRgb: [number, number, number];
}

/** Uniforms for the Master Adjustment shader pass. */
export interface MasterUniforms {
  // Basic adjustments
  exposure: number; // [-5, 5] EV
  contrast: number; // [-100, 100]
  highlights: number; // [-100, 100]
  shadows: number; // [-100, 100]
  whites: number; // [-100, 100]
  blacks: number; // [-100, 100]

  // White balance (LMS)
  whiteBalanceLmsScale: [number, number, number];

  // OKLab HSL
  hueShift: number; // [-180, 180] degrees
  saturation: number; // [-100, 100]
  vibrance: number; // [-100, 100]
  luminance: number; // [-100, 100]

  // Curves (4 segments)
  curveHighlights: number; // [-100, 100]
  curveLights: number; // [-100, 100]
  curveDarks: number; // [-100, 100]
  curveShadows: number; // [-100, 100]

  // Color grading (3-way)
  colorGradeShadows: [number, number, number]; // (hueDeg, sat[0..1], luminance[-1..1])
  colorGradeMidtones: [number, number, number]; // (hueDeg, sat[0..1], luminance[-1..1])
  colorGradeHighlights: [number, number, number]; // (hueDeg, sat[0..1], luminance[-1..1])
  colorGradeBlend: number; // [0, 1]
  colorGradeBalance: number; // [-1, 1]

  // Detail
  dehaze: number; // [-100, 100]
}

/** Uniforms for the 8-channel HSL selective color pass. */
export interface HSLUniforms {
  enabled: boolean;
  // Per channel values in UI range: hue[-100,100], saturation[-100,100], luminance[-100,100]
  hue: [number, number, number, number, number, number, number, number];
  saturation: [number, number, number, number, number, number, number, number];
  luminance: [number, number, number, number, number, number, number, number];
  bwEnabled: boolean;
  bwMix: [number, number, number];
  calibrationEnabled: boolean;
  calibrationHue: [number, number, number];
  calibrationSaturation: [number, number, number];
}

/** Uniforms for point-curve pass. Curve points are in [0, 255] space. */
export interface CurveUniforms {
  enabled: boolean;
  rgb: PointCurvePoint[];
  red: PointCurvePoint[];
  green: PointCurvePoint[];
  blue: PointCurvePoint[];
}

/** Uniforms for detail pass (clarity/texture/sharpen/NR). */
export interface DetailUniforms {
  enabled: boolean;
  texture: number; // [-100, 100]
  clarity: number; // [-100, 100]
  sharpening: number; // [0, 100]
  sharpenRadius: number; // [0, 100]
  sharpenDetail: number; // [0, 100]
  masking: number; // [0, 100]
  noiseReduction: number; // [0, 100]
  colorNoiseReduction: number; // [0, 100]
}

/** Uniforms for the Film Simulation shader pass. */
export interface FilmUniforms {
  // Layer 1: Tone Response
  u_toneEnabled: boolean;
  u_shoulder: number; // [0, 1]
  u_toe: number; // [0, 1]
  u_gamma: number; // [0.5, 2.0]

  // Layer 2: Color Matrix
  u_colorMatrixEnabled: boolean;
  u_colorMatrix: number[]; // 9 elements, column-major for WebGL

  // Layer 3: LUT
  u_lutEnabled: boolean;
  u_lutIntensity: number; // [0, 1]

  // Layer 4: Color Cast (per-zone tinting)
  u_colorCastEnabled: boolean;
  u_colorCastShadows: [number, number, number]; // RGB offset
  u_colorCastMidtones: [number, number, number]; // RGB offset
  u_colorCastHighlights: [number, number, number]; // RGB offset

  // Layer 5: Grain
  u_grainEnabled: boolean;
  u_grainAmount: number; // [0, 1]
  u_grainSize: number; // [0.5, 2.0]
  u_grainRoughness: number; // [0, 1]
  u_grainShadowBias: number; // [0, 1]
  u_grainSeed: number;
  u_grainIsColor: boolean;

  // Layer 6: Vignette
  u_vignetteEnabled: boolean;
  u_vignetteAmount: number; // [-1, 1]
  u_vignetteMidpoint: number; // [0, 1]
  u_vignetteRoundness: number; // [0, 1]
}

/** Uniforms for the Halation/Bloom multi-pass filter. */
export interface HalationBloomUniforms {
  // Halation (warm glow from bright areas)
  halationEnabled: boolean;
  halationThreshold: number; // linear luminance threshold (source UI is sRGB domain)
  halationIntensity: number; // [0, 1]
  halationColor?: [number, number, number]; // RGB tint (default warm red)
  halationRadius?: number; // blur radius override

  // Bloom (neutral glow from bright areas)
  bloomEnabled: boolean;
  bloomThreshold: number; // linear luminance threshold (source UI is sRGB domain)
  bloomIntensity: number; // [0, 1]
  bloomRadius?: number; // blur radius override
}
