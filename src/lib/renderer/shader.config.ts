/**
 * Shader Code Generator configuration.
 *
 * Defines which features are enabled in the generated Master and Film
 * shaders. The generator reads these configs at build time to produce
 * optimized GLSL that only includes code for enabled features.
 *
 * All features are enabled by default to match the hand-written shaders.
 * Disable a feature to eliminate its uniforms and code from the output.
 */

// -- Master Adjustment Shader Config --

export interface MasterConfig {
  exposure: { enabled: boolean; algorithm: "linear" };
  whiteBalance: { enabled: boolean; algorithm: "LMS" | "simple" };
  contrast: { enabled: boolean };
  tonalRange: { enabled: boolean };
  hsl: { enabled: boolean; space: "OKLab" | "HSV" };
  curve: { enabled: boolean };
  colorGrading: { enabled: boolean };
  dehaze: { enabled: boolean };
}

// -- Film Simulation Shader Config --

export interface FilmConfig {
  toneResponse: { enabled: boolean };
  lut: { enabled: boolean; size: 8 | 16 };
  colorMatrix: { enabled: boolean }; // Phase 3
  colorCast: { enabled: boolean };
  grain: { enabled: boolean };
  vignette: { enabled: boolean };
}

// -- Default configs (all features enabled) --

export const masterConfig: MasterConfig = {
  exposure: { enabled: true, algorithm: "linear" },
  whiteBalance: { enabled: true, algorithm: "LMS" },
  contrast: { enabled: true },
  tonalRange: { enabled: true },
  hsl: { enabled: true, space: "OKLab" },
  curve: { enabled: true },
  colorGrading: { enabled: true },
  dehaze: { enabled: true },
};

export const filmConfig: FilmConfig = {
  toneResponse: { enabled: true },
  lut: { enabled: true, size: 8 },
  colorMatrix: { enabled: true },
  colorCast: { enabled: true },
  grain: { enabled: true },
  vignette: { enabled: true },
};
