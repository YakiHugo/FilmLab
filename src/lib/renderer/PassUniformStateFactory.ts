export const createGeometryPassUniforms = () => ({
  u_cropRect: new Float32Array([0, 0, 1, 1]),
  u_sourceSize: new Float32Array([1, 1]),
  u_outputSize: new Float32Array([1, 1]),
  u_translatePx: new Float32Array([0, 0]),
  u_rotate: 0,
  u_perspectiveEnabled: false,
  u_homography: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  u_scale: 1,
  u_flip: new Float32Array([1, 1]),
  u_lensEnabled: false,
  u_lensK1: 0,
  u_lensK2: 0,
  u_lensVignetteBoost: 0,
  u_caEnabled: false,
  u_caAmountPxRgb: new Float32Array([0, 0, 0]),
  u_enabled: true,
});

export const createMasterPassUniforms = () => ({
  u_exposure: 0,
  u_contrast: 0,
  u_whiteBalanceLmsScale: new Float32Array([1, 1, 1]),
  u_tonalRange: new Float32Array([0, 0, 0, 0]),
  u_curve: new Float32Array([0, 0, 0, 0]),
  u_hueShift: 0,
  u_saturation: 0,
  u_vibrance: 0,
  u_luminance: 0,
  u_colorGradeShadows: new Float32Array([0, 0, 0]),
  u_colorGradeMidtones: new Float32Array([0, 0, 0]),
  u_colorGradeHighlights: new Float32Array([0, 0, 0]),
  u_colorGradeBlend: 0.5,
  u_colorGradeBalance: 0,
  u_dehaze: 0,
});

export const createHslPassUniforms = () => ({
  u_enabled: false,
  u_hue: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]),
  u_saturation: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]),
  u_luminance: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]),
  u_bwEnabled: false,
  u_bwMix: new Float32Array([0.2126, 0.7152, 0.0722]),
  u_calibrationEnabled: false,
  u_calibrationHue: new Float32Array([0, 0, 0]),
  u_calibrationSaturation: new Float32Array([0, 0, 0]),
});

export const createCurvePassUniforms = (): Record<string, unknown> => ({
  u_enabled: false,
  u_curveLut: null as WebGLTexture | null,
});

export const createDetailPassUniforms = () => ({
  u_enabled: false,
  u_texelSize: new Float32Array([1, 1]),
  u_shortEdgePx: 1,
  u_texture: 0,
  u_clarity: 0,
  u_sharpening: 0,
  u_sharpenRadius: 40,
  u_sharpenDetail: 25,
  u_masking: 0,
  u_noiseReduction: 0,
  u_colorNoiseReduction: 0,
  u_nrKernelRadius: 2,
});

export const createFilmPassUniforms = (): Record<string, unknown> => ({
  u_expandEnabled: false,
  u_expandBlackPoint: 0,
  u_expandWhitePoint: 1,
  u_filmCompressionEnabled: false,
  u_highlightRolloff: 0.4,
  u_shoulderWidth: 0.4,
  u_filmDeveloperEnabled: false,
  u_developerContrast: 0,
  u_developerGamma: 1,
  u_colorSeparation: new Float32Array([1, 1, 1]),
  u_toneEnabled: false,
  u_shoulder: 0.8,
  u_toe: 0.3,
  u_gamma: 1,
  u_colorMatrixEnabled: false,
  u_colorMatrix: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  u_lutEnabled: false,
  u_lutIntensity: 0,
  u_lut: null as WebGLTexture | null,
  u_lutMixEnabled: false,
  u_lutMixFactor: 0,
  u_lutBlend: null as WebGLTexture | null,
  u_customLutEnabled: false,
  u_customLutIntensity: 0,
  u_customLut: null as WebGLTexture | null,
  u_printEnabled: false,
  u_printDensity: 0,
  u_printContrast: 0,
  u_printWarmth: 0,
  u_printStock: 0,
  u_printLutEnabled: false,
  u_printLutIntensity: 1,
  u_printLut: null as WebGLTexture | null,
  u_printTargetWhiteKelvin: 6500,
  u_cmyColorHeadEnabled: false,
  u_cyan: 0,
  u_magenta: 0,
  u_yellow: 0,
  u_colorCastEnabled: false,
  u_colorCastShadows: new Float32Array([0, 0, 0]),
  u_colorCastMidtones: new Float32Array([0, 0, 0]),
  u_colorCastHighlights: new Float32Array([0, 0, 0]),
  u_printToningEnabled: false,
  u_toningShadows: new Float32Array([0, 0, 0]),
  u_toningMidtones: new Float32Array([0, 0, 0]),
  u_toningHighlights: new Float32Array([0, 0, 0]),
  u_toningStrength: 0.35,
  u_grainEnabled: false,
  u_grainModel: 0,
  u_grainAmount: 0,
  u_grainSize: 0.5,
  u_grainRoughness: 0.5,
  u_grainShadowBias: 0.45,
  u_grainSeed: 0,
  u_grainIsColor: true,
  u_crystalDensity: 0.5,
  u_crystalSizeMean: 0.5,
  u_crystalSizeVariance: 0.35,
  u_grainColorSeparation: new Float32Array([1, 1, 1]),
  u_scannerMTF: 0.55,
  u_filmFormat: 2,
  u_textureSize: new Float32Array([1, 1]),
  u_blueNoise: null as WebGLTexture | null,
  u_vignetteEnabled: false,
  u_vignetteAmount: 0,
  u_vignetteMidpoint: 0.5,
  u_vignetteRoundness: 0.5,
  u_filmBreathEnabled: false,
  u_breathAmount: 0,
  u_breathSeed: 0,
  u_gateWeaveEnabled: false,
  u_gateWeaveAmount: 0,
  u_gateWeaveSeed: 0,
  u_filmDamageEnabled: false,
  u_damageAmount: 0,
  u_damageSeed: 0,
  u_damageTexture: null as WebGLTexture | null,
  u_overscanEnabled: false,
  u_overscanAmount: 0,
  u_overscanRoundness: 0.5,
  u_borderTexture: null as WebGLTexture | null,
  u_aspectRatio: 1,
  u_pushPullEv: 0,
});

export const createThresholdPassUniforms = () => ({
  u_halationThreshold: 0.9,
  u_bloomThreshold: 0.85,
});

export const createGlowThresholdPassUniforms = () => ({
  u_glowEnabled: false,
  u_glowIntensity: 0,
  u_glowMidtoneFocus: 0.5,
  u_glowBias: 0.25,
});

export const createBlurPassUniforms = () => ({
  u_blurDirection: new Float32Array([0, 0]),
  u_blurRadius: 1,
});

export const createCompositePassUniforms = () => ({
  u_halationEnabled: false,
  u_halationIntensity: 0,
  u_halationColor: new Float32Array([1.0, 0.3, 0.1]),
  u_halationHue: 16,
  u_halationSaturation: 0.75,
  u_halationBlueCompensation: 0.2,
  u_bloomEnabled: false,
  u_bloomIntensity: 0,
});

export const createGlowCompositePassUniforms = () => ({
  u_glowEnabled: false,
  u_glowIntensity: 0,
  u_glowBias: 0.25,
});

export const createDownsamplePassUniforms = () => ({
  u_texelSize: new Float32Array([1, 1]),
});

export const createBilateralPassUniforms = (sigmaRange: number) => ({
  u_texelSize: new Float32Array([1, 1]),
  u_sigmaRange: sigmaRange,
  u_strength: 0,
});

export const createReconstructPassUniforms = () => ({
  u_halfScale: null as WebGLTexture | null,
  u_quarterScale: null as WebGLTexture | null,
  u_lumaStrength: 0,
  u_chromaStrength: 0,
});

export const createOutputEncodeUniforms = () => ({
  u_inputLinear: true,
  u_enableDither: true,
  u_applyToneMap: false,
  u_outputSize: new Float32Array([1, 1]),
});
