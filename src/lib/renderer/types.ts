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
  temperature: number; // [-100, 100]
  tint: number; // [-100, 100]

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

  // Layer 6: Grain
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
  halationThreshold: number; // [0.5, 1.0]
  halationIntensity: number; // [0, 1]
  halationColor?: [number, number, number]; // RGB tint (default warm red)
  halationRadius?: number; // blur radius override

  // Bloom (neutral glow from bright areas)
  bloomEnabled: boolean;
  bloomThreshold: number; // [0.5, 1.0]
  bloomIntensity: number; // [0, 1]
  bloomRadius?: number; // blur radius override
}
