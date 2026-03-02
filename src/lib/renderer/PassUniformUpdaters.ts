import { copyMat3, copyVec3, resolveShortEdgePx } from "./UniformManager";
import type {
  DetailUniforms,
  FilmUniforms,
  GeometryUniforms,
  HSLUniforms,
  HalationBloomUniforms,
  MasterUniforms,
} from "./types";

interface GeometryPassUniformState {
  u_enabled: boolean;
  u_cropRect: Float32Array;
  u_sourceSize: Float32Array;
  u_outputSize: Float32Array;
  u_translatePx: Float32Array;
  u_rotate: number;
  u_perspectiveEnabled: boolean;
  u_homography: Float32Array;
  u_scale: number;
  u_flip: Float32Array;
  u_lensEnabled: boolean;
  u_lensK1: number;
  u_lensK2: number;
  u_lensVignetteBoost: number;
  u_caEnabled: boolean;
  u_caAmountPxRgb: Float32Array;
}

interface MasterPassUniformState {
  u_exposure: number;
  u_contrast: number;
  u_whiteBalanceLmsScale: Float32Array;
  u_tonalRange: Float32Array;
  u_curve: Float32Array;
  u_hueShift: number;
  u_saturation: number;
  u_vibrance: number;
  u_luminance: number;
  u_colorGradeShadows: Float32Array;
  u_colorGradeMidtones: Float32Array;
  u_colorGradeHighlights: Float32Array;
  u_colorGradeBlend: number;
  u_colorGradeBalance: number;
  u_dehaze: number;
}

interface HslPassUniformState {
  u_enabled: boolean;
  u_hue: Float32Array;
  u_saturation: Float32Array;
  u_luminance: Float32Array;
  u_bwEnabled: boolean;
  u_bwMix: Float32Array;
  u_calibrationEnabled: boolean;
  u_calibrationHue: Float32Array;
  u_calibrationSaturation: Float32Array;
}

interface DetailPassUniformState {
  u_enabled: boolean;
  u_texelSize: Float32Array;
  u_shortEdgePx: number;
  u_texture: number;
  u_clarity: number;
  u_sharpening: number;
  u_sharpenRadius: number;
  u_sharpenDetail: number;
  u_masking: number;
  u_noiseReduction: number;
  u_colorNoiseReduction: number;
  u_nrKernelRadius: number;
}

interface FilmPassUniformState {
  u_expandEnabled: boolean;
  u_expandBlackPoint: number;
  u_expandWhitePoint: number;
  u_filmCompressionEnabled: boolean;
  u_highlightRolloff: number;
  u_shoulderWidth: number;
  u_filmDeveloperEnabled: boolean;
  u_developerContrast: number;
  u_developerGamma: number;
  u_colorSeparation: Float32Array;
  u_toneEnabled: boolean;
  u_shoulder: number;
  u_toe: number;
  u_gamma: number;
  u_colorMatrixEnabled: boolean;
  u_colorMatrix: Float32Array;
  u_lutEnabled: boolean;
  u_lutIntensity: number;
  u_lutMixEnabled: boolean;
  u_lutMixFactor: number;
  u_lut: WebGLTexture | null;
  u_lutBlend: WebGLTexture | null;
  u_customLutEnabled: boolean;
  u_customLutIntensity: number;
  u_customLut: WebGLTexture | null;
  u_printEnabled: boolean;
  u_printDensity: number;
  u_printContrast: number;
  u_printWarmth: number;
  u_printStock: number;
  u_printLutEnabled: boolean;
  u_printLutIntensity: number;
  u_printLut: WebGLTexture | null;
  u_printTargetWhiteKelvin: number;
  u_cmyColorHeadEnabled: boolean;
  u_cyan: number;
  u_magenta: number;
  u_yellow: number;
  u_colorCastEnabled: boolean;
  u_colorCastShadows: Float32Array;
  u_colorCastMidtones: Float32Array;
  u_colorCastHighlights: Float32Array;
  u_printToningEnabled: boolean;
  u_toningShadows: Float32Array;
  u_toningMidtones: Float32Array;
  u_toningHighlights: Float32Array;
  u_toningStrength: number;
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
  u_grainColorSeparation: Float32Array;
  u_scannerMTF: number;
  u_filmFormat: number;
  u_textureSize: Float32Array;
  u_blueNoise: WebGLTexture | null;
  u_vignetteEnabled: boolean;
  u_vignetteAmount: number;
  u_vignetteMidpoint: number;
  u_vignetteRoundness: number;
  u_filmBreathEnabled: boolean;
  u_breathAmount: number;
  u_breathSeed: number;
  u_gateWeaveEnabled: boolean;
  u_gateWeaveAmount: number;
  u_gateWeaveSeed: number;
  u_filmDamageEnabled: boolean;
  u_damageAmount: number;
  u_damageSeed: number;
  u_damageTexture: WebGLTexture | null;
  u_overscanEnabled: boolean;
  u_overscanAmount: number;
  u_overscanRoundness: number;
  u_borderTexture: WebGLTexture | null;
  u_aspectRatio: number;
  u_pushPullEv: number;
}

interface ThresholdPassUniformState {
  u_halationThreshold: number;
  u_bloomThreshold: number;
}

interface GlowThresholdPassUniformState {
  u_glowEnabled: boolean;
  u_glowIntensity: number;
  u_glowMidtoneFocus: number;
  u_glowBias: number;
}

interface BlurPassUniformState {
  u_blurDirection: Float32Array;
  u_blurRadius: number;
}

interface CompositePassUniformState {
  u_halationEnabled: boolean;
  u_halationIntensity: number;
  u_halationColor: Float32Array;
  u_halationHue: number;
  u_halationSaturation: number;
  u_halationBlueCompensation: number;
  u_bloomEnabled: boolean;
  u_bloomIntensity: number;
}

interface GlowCompositePassUniformState {
  u_glowEnabled: boolean;
  u_glowIntensity: number;
  u_glowBias: number;
}

export const applyGeometryPassUniforms = (
  target: GeometryPassUniformState,
  uniforms: GeometryUniforms
): void => {
  target.u_enabled = uniforms.enabled;
  target.u_cropRect[0] = uniforms.cropRect[0];
  target.u_cropRect[1] = uniforms.cropRect[1];
  target.u_cropRect[2] = uniforms.cropRect[2];
  target.u_cropRect[3] = uniforms.cropRect[3];
  target.u_sourceSize[0] = uniforms.sourceSize[0];
  target.u_sourceSize[1] = uniforms.sourceSize[1];
  target.u_outputSize[0] = uniforms.outputSize[0];
  target.u_outputSize[1] = uniforms.outputSize[1];
  target.u_translatePx[0] = uniforms.translatePx[0];
  target.u_translatePx[1] = uniforms.translatePx[1];
  target.u_rotate = uniforms.rotate;
  target.u_perspectiveEnabled = uniforms.perspectiveEnabled;
  for (let i = 0; i < 9; i += 1) {
    target.u_homography[i] = uniforms.homography[i] ?? (i % 4 === 0 ? 1 : 0);
  }
  target.u_scale = uniforms.scale;
  target.u_flip[0] = uniforms.flip[0];
  target.u_flip[1] = uniforms.flip[1];
  target.u_lensEnabled = uniforms.lensEnabled;
  target.u_lensK1 = uniforms.lensK1;
  target.u_lensK2 = uniforms.lensK2;
  target.u_lensVignetteBoost = uniforms.lensVignetteBoost;
  target.u_caEnabled = uniforms.caEnabled;
  target.u_caAmountPxRgb[0] = uniforms.caAmountPxRgb[0];
  target.u_caAmountPxRgb[1] = uniforms.caAmountPxRgb[1];
  target.u_caAmountPxRgb[2] = uniforms.caAmountPxRgb[2];
};

export const applyMasterPassUniforms = (
  target: MasterPassUniformState,
  uniforms: MasterUniforms
): void => {
  target.u_exposure = uniforms.exposure;
  target.u_contrast = uniforms.contrast;
  target.u_whiteBalanceLmsScale[0] = uniforms.whiteBalanceLmsScale[0];
  target.u_whiteBalanceLmsScale[1] = uniforms.whiteBalanceLmsScale[1];
  target.u_whiteBalanceLmsScale[2] = uniforms.whiteBalanceLmsScale[2];
  target.u_tonalRange[0] = uniforms.highlights;
  target.u_tonalRange[1] = uniforms.shadows;
  target.u_tonalRange[2] = uniforms.whites;
  target.u_tonalRange[3] = uniforms.blacks;
  target.u_curve[0] = uniforms.curveHighlights;
  target.u_curve[1] = uniforms.curveLights;
  target.u_curve[2] = uniforms.curveDarks;
  target.u_curve[3] = uniforms.curveShadows;
  target.u_hueShift = uniforms.hueShift;
  target.u_saturation = uniforms.saturation;
  target.u_vibrance = uniforms.vibrance;
  target.u_luminance = uniforms.luminance;
  target.u_colorGradeShadows[0] = uniforms.colorGradeShadows[0];
  target.u_colorGradeShadows[1] = uniforms.colorGradeShadows[1];
  target.u_colorGradeShadows[2] = uniforms.colorGradeShadows[2];
  target.u_colorGradeMidtones[0] = uniforms.colorGradeMidtones[0];
  target.u_colorGradeMidtones[1] = uniforms.colorGradeMidtones[1];
  target.u_colorGradeMidtones[2] = uniforms.colorGradeMidtones[2];
  target.u_colorGradeHighlights[0] = uniforms.colorGradeHighlights[0];
  target.u_colorGradeHighlights[1] = uniforms.colorGradeHighlights[1];
  target.u_colorGradeHighlights[2] = uniforms.colorGradeHighlights[2];
  target.u_colorGradeBlend = uniforms.colorGradeBlend;
  target.u_colorGradeBalance = uniforms.colorGradeBalance;
  target.u_dehaze = uniforms.dehaze;
};

export const applyHslPassUniforms = (
  target: HslPassUniformState,
  uniforms: HSLUniforms
): void => {
  target.u_enabled = uniforms.enabled;
  for (let i = 0; i < 8; i += 1) {
    target.u_hue[i] = uniforms.hue[i];
    target.u_saturation[i] = uniforms.saturation[i];
    target.u_luminance[i] = uniforms.luminance[i];
  }
  target.u_bwEnabled = uniforms.bwEnabled;
  target.u_bwMix[0] = uniforms.bwMix[0];
  target.u_bwMix[1] = uniforms.bwMix[1];
  target.u_bwMix[2] = uniforms.bwMix[2];
  target.u_calibrationEnabled = uniforms.calibrationEnabled;
  target.u_calibrationHue[0] = uniforms.calibrationHue[0];
  target.u_calibrationHue[1] = uniforms.calibrationHue[1];
  target.u_calibrationHue[2] = uniforms.calibrationHue[2];
  target.u_calibrationSaturation[0] = uniforms.calibrationSaturation[0];
  target.u_calibrationSaturation[1] = uniforms.calibrationSaturation[1];
  target.u_calibrationSaturation[2] = uniforms.calibrationSaturation[2];
};

export const applyDetailPassUniforms = (
  target: DetailPassUniformState,
  uniforms: DetailUniforms,
  options: {
    targetWidth: number;
    targetHeight: number;
    detailKernelRadius: 1 | 2;
  }
): void => {
  target.u_enabled = uniforms.enabled;
  target.u_texelSize[0] = 1 / Math.max(1, options.targetWidth);
  target.u_texelSize[1] = 1 / Math.max(1, options.targetHeight);
  target.u_shortEdgePx = resolveShortEdgePx(options.targetWidth, options.targetHeight);
  target.u_texture = uniforms.texture;
  target.u_clarity = uniforms.clarity;
  target.u_sharpening = uniforms.sharpening;
  target.u_sharpenRadius = uniforms.sharpenRadius;
  target.u_sharpenDetail = uniforms.sharpenDetail;
  target.u_masking = uniforms.masking;
  target.u_noiseReduction = uniforms.noiseReduction;
  target.u_colorNoiseReduction = uniforms.colorNoiseReduction;
  target.u_nrKernelRadius = options.detailKernelRadius;
};

export const applyFilmPassUniforms = (
  target: Record<string, unknown>,
  uniforms: FilmUniforms,
  options: {
    lutTexture: WebGLTexture | null;
    lutBlendTexture: WebGLTexture | null;
    customLutTexture: WebGLTexture | null;
    printLutTexture: WebGLTexture | null;
    fallback3DLutTexture: WebGLTexture;
    blueNoiseTexture: WebGLTexture;
    damageTexture: WebGLTexture;
    borderTexture: WebGLTexture;
    targetWidth: number;
    targetHeight: number;
  }
): void => {
  const state = target as unknown as FilmPassUniformState;
  state.u_expandEnabled = uniforms.u_expandEnabled;
  state.u_expandBlackPoint = uniforms.u_expandBlackPoint;
  state.u_expandWhitePoint = uniforms.u_expandWhitePoint;
  state.u_filmCompressionEnabled = uniforms.u_filmCompressionEnabled;
  state.u_highlightRolloff = uniforms.u_highlightRolloff;
  state.u_shoulderWidth = uniforms.u_shoulderWidth;
  state.u_filmDeveloperEnabled = uniforms.u_filmDeveloperEnabled;
  state.u_developerContrast = uniforms.u_developerContrast;
  state.u_developerGamma = uniforms.u_developerGamma;
  copyVec3(state.u_colorSeparation, uniforms.u_colorSeparation);

  state.u_toneEnabled = uniforms.u_toneEnabled;
  state.u_shoulder = uniforms.u_shoulder;
  state.u_toe = uniforms.u_toe;
  state.u_gamma = uniforms.u_gamma;
  state.u_colorMatrixEnabled = uniforms.u_colorMatrixEnabled;
  copyMat3(state.u_colorMatrix, uniforms.u_colorMatrix);

  state.u_lutEnabled = uniforms.u_lutEnabled && !!options.lutTexture;
  state.u_lutIntensity = uniforms.u_lutIntensity;
  state.u_lut = options.lutTexture ?? options.fallback3DLutTexture;
  state.u_lutMixEnabled =
    state.u_lutEnabled && uniforms.u_lutMixEnabled && !!options.lutBlendTexture;
  state.u_lutMixFactor = state.u_lutMixEnabled ? uniforms.u_lutMixFactor : 0;
  state.u_lutBlend =
    options.lutBlendTexture ?? options.lutTexture ?? options.fallback3DLutTexture;
  state.u_customLutEnabled = uniforms.u_customLutEnabled && !!options.customLutTexture;
  state.u_customLutIntensity = uniforms.u_customLutIntensity;
  state.u_customLut = options.customLutTexture ?? options.fallback3DLutTexture;
  state.u_printEnabled = uniforms.u_printEnabled;
  state.u_printDensity = uniforms.u_printDensity;
  state.u_printContrast = uniforms.u_printContrast;
  state.u_printWarmth = uniforms.u_printWarmth;
  state.u_printStock = uniforms.u_printStock;
  state.u_printLutEnabled = uniforms.u_printLutEnabled && !!options.printLutTexture;
  state.u_printLutIntensity = uniforms.u_printLutIntensity;
  state.u_printLut = options.printLutTexture ?? options.fallback3DLutTexture;
  state.u_printTargetWhiteKelvin = uniforms.u_printTargetWhiteKelvin;
  state.u_cmyColorHeadEnabled = uniforms.u_cmyColorHeadEnabled;
  state.u_cyan = uniforms.u_cyan;
  state.u_magenta = uniforms.u_magenta;
  state.u_yellow = uniforms.u_yellow;

  state.u_colorCastEnabled = uniforms.u_colorCastEnabled;
  copyVec3(state.u_colorCastShadows, uniforms.u_colorCastShadows);
  copyVec3(state.u_colorCastMidtones, uniforms.u_colorCastMidtones);
  copyVec3(state.u_colorCastHighlights, uniforms.u_colorCastHighlights);
  state.u_printToningEnabled = uniforms.u_printToningEnabled;
  copyVec3(state.u_toningShadows, uniforms.u_toningShadows);
  copyVec3(state.u_toningMidtones, uniforms.u_toningMidtones);
  copyVec3(state.u_toningHighlights, uniforms.u_toningHighlights);
  state.u_toningStrength = uniforms.u_toningStrength;

  state.u_grainEnabled = uniforms.u_grainEnabled;
  state.u_grainModel = uniforms.u_grainModel;
  state.u_grainAmount = uniforms.u_grainAmount;
  state.u_grainSize = uniforms.u_grainSize;
  state.u_grainRoughness = uniforms.u_grainRoughness;
  state.u_grainShadowBias = uniforms.u_grainShadowBias;
  state.u_grainSeed = uniforms.u_grainSeed;
  state.u_grainIsColor = uniforms.u_grainIsColor;
  state.u_crystalDensity = uniforms.u_crystalDensity;
  state.u_crystalSizeMean = uniforms.u_crystalSizeMean;
  state.u_crystalSizeVariance = uniforms.u_crystalSizeVariance;
  copyVec3(state.u_grainColorSeparation, uniforms.u_grainColorSeparation);
  state.u_scannerMTF = uniforms.u_scannerMTF;
  state.u_filmFormat = uniforms.u_filmFormat;
  state.u_blueNoise = options.blueNoiseTexture;

  state.u_textureSize[0] = options.targetWidth;
  state.u_textureSize[1] = options.targetHeight;

  state.u_vignetteEnabled = uniforms.u_vignetteEnabled;
  state.u_vignetteAmount = uniforms.u_vignetteAmount;
  state.u_vignetteMidpoint = uniforms.u_vignetteMidpoint;
  state.u_vignetteRoundness = uniforms.u_vignetteRoundness;
  state.u_filmBreathEnabled = uniforms.u_filmBreathEnabled;
  state.u_breathAmount = uniforms.u_breathAmount;
  state.u_breathSeed = uniforms.u_breathSeed;
  state.u_gateWeaveEnabled = uniforms.u_gateWeaveEnabled;
  state.u_gateWeaveAmount = uniforms.u_gateWeaveAmount;
  state.u_gateWeaveSeed = uniforms.u_gateWeaveSeed;
  state.u_filmDamageEnabled = uniforms.u_filmDamageEnabled;
  state.u_damageAmount = uniforms.u_damageAmount;
  state.u_damageSeed = uniforms.u_damageSeed;
  state.u_damageTexture = options.damageTexture;
  state.u_overscanEnabled = uniforms.u_overscanEnabled;
  state.u_overscanAmount = uniforms.u_overscanAmount;
  state.u_overscanRoundness = uniforms.u_overscanRoundness;
  state.u_borderTexture = options.borderTexture;
  state.u_aspectRatio = options.targetWidth / Math.max(1, options.targetHeight);
  state.u_pushPullEv = uniforms.u_pushPullEv;
};

export const applyHalationPassUniforms = (
  states: {
    thresholdPassUniforms: ThresholdPassUniformState;
    glowThresholdPassUniforms: GlowThresholdPassUniformState;
    blurHPassUniforms: BlurPassUniformState;
    blurVPassUniforms: BlurPassUniformState;
    glowBlurHPassUniforms: BlurPassUniformState;
    glowBlurVPassUniforms: BlurPassUniformState;
    compositePassUniforms: CompositePassUniformState;
    glowCompositePassUniforms: GlowCompositePassUniformState;
  },
  uniforms: HalationBloomUniforms,
  options: { targetWidth: number; targetHeight: number }
): { halationBlurPasses: number; glowBlurPasses: number } => {
  states.thresholdPassUniforms.u_halationThreshold = uniforms.halationThreshold;
  states.thresholdPassUniforms.u_bloomThreshold = uniforms.bloomThreshold;

  const halRadius = uniforms.halationRadius ?? Math.max(1, uniforms.halationIntensity * 8);
  const bloomRadius = uniforms.bloomRadius ?? Math.max(1, uniforms.bloomIntensity * 10);
  const avgRadius = Math.max(halRadius, bloomRadius);
  states.blurHPassUniforms.u_blurRadius = avgRadius;
  states.blurVPassUniforms.u_blurRadius = avgRadius;
  const halationBlurPasses = avgRadius > 4 ? 3 : 2;

  const blurWidth = Math.max(1, Math.round(options.targetWidth * 0.5));
  const blurHeight = Math.max(1, Math.round(options.targetHeight * 0.5));
  states.blurHPassUniforms.u_blurDirection[0] = 1 / blurWidth;
  states.blurHPassUniforms.u_blurDirection[1] = 0;
  states.blurVPassUniforms.u_blurDirection[0] = 0;
  states.blurVPassUniforms.u_blurDirection[1] = 1 / blurHeight;

  states.compositePassUniforms.u_halationEnabled =
    uniforms.halationEnabled && uniforms.halationIntensity > 0.001;
  states.compositePassUniforms.u_halationIntensity = uniforms.halationIntensity;
  if (uniforms.halationColor) {
    states.compositePassUniforms.u_halationColor[0] = uniforms.halationColor[0];
    states.compositePassUniforms.u_halationColor[1] = uniforms.halationColor[1];
    states.compositePassUniforms.u_halationColor[2] = uniforms.halationColor[2];
  }
  states.compositePassUniforms.u_halationHue = uniforms.halationHue ?? 16;
  states.compositePassUniforms.u_halationSaturation = uniforms.halationSaturation ?? 0.75;
  states.compositePassUniforms.u_halationBlueCompensation = uniforms.halationBlueCompensation ?? 0.2;
  states.compositePassUniforms.u_bloomEnabled =
    uniforms.bloomEnabled && uniforms.bloomIntensity > 0.001;
  states.compositePassUniforms.u_bloomIntensity = uniforms.bloomIntensity;

  states.glowThresholdPassUniforms.u_glowEnabled = uniforms.glowEnabled && uniforms.glowIntensity > 0.001;
  states.glowThresholdPassUniforms.u_glowIntensity = uniforms.glowIntensity;
  states.glowThresholdPassUniforms.u_glowMidtoneFocus = uniforms.glowMidtoneFocus;
  states.glowThresholdPassUniforms.u_glowBias = uniforms.glowBias;

  const glowRadius = uniforms.glowRadius ?? Math.max(1, uniforms.glowIntensity * 6);
  states.glowBlurHPassUniforms.u_blurRadius = glowRadius;
  states.glowBlurVPassUniforms.u_blurRadius = glowRadius;
  const glowBlurPasses = glowRadius > 4 ? 3 : 2;
  states.glowBlurHPassUniforms.u_blurDirection[0] = 1 / blurWidth;
  states.glowBlurHPassUniforms.u_blurDirection[1] = 0;
  states.glowBlurVPassUniforms.u_blurDirection[0] = 0;
  states.glowBlurVPassUniforms.u_blurDirection[1] = 1 / blurHeight;

  states.glowCompositePassUniforms.u_glowEnabled = uniforms.glowEnabled && uniforms.glowIntensity > 0.001;
  states.glowCompositePassUniforms.u_glowIntensity = uniforms.glowIntensity;
  states.glowCompositePassUniforms.u_glowBias = uniforms.glowBias;

  return {
    halationBlurPasses,
    glowBlurPasses,
  };
};
