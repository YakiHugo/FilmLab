import type { HslColorKey } from "@/types";
import type {
  ImageRenderColorState,
  ImageRenderDetailState,
  ImageRenderToneState,
} from "@/render/image/types";
import type { FilmProfileV3 } from "@/types/film";
import type {
  MasterUniforms,
  HSLUniforms,
  CurveUniforms,
  DetailUniforms,
  FilmUniforms,
  HalationBloomUniforms,
} from "./types";

const IDENTITY_3X3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const VEC3_ZERO: [number, number, number] = [0, 0, 0];
const VEC3_ONE: [number, number, number] = [1, 1, 1];
const HALATION_COLOR_DEFAULT: [number, number, number] = [1.0, 0.3, 0.1];

/** Transpose 3x3 row-major to column-major for WebGL. */
function transpose3x3Into(target: number[], source: number[]) {
  target[0] = source[0] ?? 1;
  target[1] = source[3] ?? 0;
  target[2] = source[6] ?? 0;
  target[3] = source[1] ?? 0;
  target[4] = source[4] ?? 1;
  target[5] = source[7] ?? 0;
  target[6] = source[2] ?? 0;
  target[7] = source[5] ?? 0;
  target[8] = source[8] ?? 1;
}

function copyVec3(target: [number, number, number], source: [number, number, number]) {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
}

const srgbToLinearUnit = (value: number): number => {
  const clamped = Math.min(1, Math.max(0, value));
  if (clamped <= 0.04045) {
    return clamped / 12.92;
  }
  return Math.pow((clamped + 0.055) / 1.055, 2.4);
};

const clampValue = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const safeNumber = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

const RGB_TO_LMS: [[number, number, number], [number, number, number], [number, number, number]] = [
  [0.7328, 0.4296, -0.1624],
  [-0.7036, 1.6975, 0.0061],
  [0.0030, 0.0136, 0.9834],
];

const multiplyMat3Vec3 = (
  matrix: [[number, number, number], [number, number, number], [number, number, number]],
  vector: [number, number, number]
): [number, number, number] => [
  matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
  matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
  matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
];

const kelvinToSrgb = (kelvin: number): [number, number, number] => {
  const t = clampValue(kelvin, 1800, 50000) / 100;
  let r: number;
  let g: number;
  let b: number;

  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }

  return [
    clampValue(r, 0, 255) / 255,
    clampValue(g, 0, 255) / 255,
    clampValue(b, 0, 255) / 255,
  ];
};

const kelvinToLinearRgb = (kelvin: number): [number, number, number] => {
  const srgb = kelvinToSrgb(kelvin);
  return [
    srgbToLinearUnit(srgb[0]),
    srgbToLinearUnit(srgb[1]),
    srgbToLinearUnit(srgb[2]),
  ];
};

const D65_LMS_REFERENCE = (() => {
  const linearD65 = kelvinToLinearRgb(6500);
  return multiplyMat3Vec3(RGB_TO_LMS, linearD65);
})();

const resolveRelativeWhiteBalanceLmsScale = (
  out: [number, number, number],
  temperature: number,
  tint: number
): void => {
  const t = clampValue(temperature, -100, 100) / 100;
  const m = clampValue(tint, -100, 100) / 100;
  out[0] = Math.max(0.05, 1 + t * 0.1);
  out[1] = Math.max(0.05, 1 + m * 0.05);
  out[2] = Math.max(0.05, 1 - t * 0.1);
};

const resolveAbsoluteWhiteBalanceLmsScale = (
  out: [number, number, number],
  temperatureKelvin: number,
  tintMG: number
): void => {
  const linearRgb = kelvinToLinearRgb(temperatureKelvin);
  const lms = multiplyMat3Vec3(RGB_TO_LMS, linearRgb);

  const scaleL = lms[0] / Math.max(1.0e-4, D65_LMS_REFERENCE[0]);
  const scaleMBase = lms[1] / Math.max(1.0e-4, D65_LMS_REFERENCE[1]);
  const scaleS = lms[2] / Math.max(1.0e-4, D65_LMS_REFERENCE[2]);

  // Positive tintMG means magenta, i.e. reduce green-sensitive M response.
  const tintScale = 1 - clampValue(tintMG, -100, 100) * 0.002;
  const scaleM = scaleMBase * tintScale;

  out[0] = clampValue(scaleL, 0.3, 3.0);
  out[1] = clampValue(scaleM, 0.3, 3.0);
  out[2] = clampValue(scaleS, 0.3, 3.0);
};

function createMasterUniforms(): MasterUniforms {
  return {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    whiteBalanceLmsScale: [1, 1, 1],
    hueShift: 0,
    saturation: 0,
    vibrance: 0,
    luminance: 0,
    curveHighlights: 0,
    curveLights: 0,
    curveDarks: 0,
    curveShadows: 0,
    colorGradeShadows: [0, 0, 0],
    colorGradeMidtones: [0, 0, 0],
    colorGradeHighlights: [0, 0, 0],
    colorGradeBlend: 0,
    colorGradeBalance: 0,
    dehaze: 0,
  };
}

function createHslUniforms(): HSLUniforms {
  return {
    enabled: false,
    hue: [0, 0, 0, 0, 0, 0, 0, 0],
    saturation: [0, 0, 0, 0, 0, 0, 0, 0],
    luminance: [0, 0, 0, 0, 0, 0, 0, 0],
    bwEnabled: false,
    bwMix: [0.2126, 0.7152, 0.0722],
    calibrationEnabled: false,
    calibrationHue: [0, 0, 0],
    calibrationSaturation: [0, 0, 0],
  };
}

function createCurveUniforms(): CurveUniforms {
  return {
    enabled: false,
    rgb: [],
    red: [],
    green: [],
    blue: [],
  };
}

function createDetailUniforms(): DetailUniforms {
  return {
    enabled: false,
    texture: 0,
    clarity: 0,
    sharpening: 0,
    sharpenRadius: 40,
    sharpenDetail: 25,
    masking: 0,
    noiseReduction: 0,
    colorNoiseReduction: 0,
    u_shortEdgePx: 1,
  };
}

function createFilmUniforms(): FilmUniforms {
  return {
    u_expandEnabled: false,
    u_expandBlackPoint: 0,
    u_expandWhitePoint: 1,
    u_filmCompressionEnabled: false,
    u_highlightRolloff: 0.4,
    u_shoulderWidth: 0.4,
    u_filmDeveloperEnabled: false,
    u_developerContrast: 0,
    u_developerGamma: 1,
    u_colorSeparation: [1, 1, 1],
    u_toneEnabled: false,
    u_shoulder: 0,
    u_toe: 0,
    u_gamma: 1,
    u_colorMatrixEnabled: false,
    u_colorMatrix: [...IDENTITY_3X3],
    u_lutEnabled: false,
    u_lutIntensity: 0,
    u_lutMixEnabled: false,
    u_lutMixFactor: 0,
    u_printEnabled: false,
    u_printDensity: 0,
    u_printContrast: 0,
    u_printWarmth: 0,
    u_printStock: 0,
    u_printTargetWhiteKelvin: 6500,
    u_printLutEnabled: false,
    u_printLutIntensity: 1,
    u_cmyColorHeadEnabled: false,
    u_cyan: 0,
    u_magenta: 0,
    u_yellow: 0,
    u_colorCastEnabled: false,
    u_colorCastShadows: [0, 0, 0],
    u_colorCastMidtones: [0, 0, 0],
    u_colorCastHighlights: [0, 0, 0],
    u_printToningEnabled: false,
    u_toningShadows: [0, 0, 0],
    u_toningMidtones: [0, 0, 0],
    u_toningHighlights: [0, 0, 0],
    u_toningStrength: 0.35,
    u_customLutEnabled: false,
    u_customLutIntensity: 0,
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
    u_grainColorSeparation: [1, 1, 1],
    u_scannerMTF: 0.55,
    u_filmFormat: 2,
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
    u_pushPullEv: 0,
    u_filmDamageEnabled: false,
    u_damageAmount: 0,
    u_damageSeed: 0,
    u_overscanEnabled: false,
    u_overscanAmount: 0,
    u_overscanRoundness: 0.5,
  };
}

function createHalationBloomUniforms(): HalationBloomUniforms {
  return {
    halationEnabled: false,
    halationThreshold: srgbToLinearUnit(0.9),
    halationIntensity: 0,
    halationColor: [...HALATION_COLOR_DEFAULT],
    halationHue: 16,
    halationSaturation: 0.75,
    halationBlueCompensation: 0.2,
    bloomEnabled: false,
    bloomThreshold: srgbToLinearUnit(0.85),
    bloomIntensity: 0,
    glowEnabled: false,
    glowIntensity: 0,
    glowMidtoneFocus: 0.5,
    glowBias: 0.25,
  };
}

const HSL_CHANNELS: HslColorKey[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
  "magenta",
];

function copyCurvePoints(target: CurveUniforms["rgb"], source: CurveUniforms["rgb"]) {
  target.length = source.length;
  for (let i = 0; i < source.length; i += 1) {
    const sourcePoint = source[i]!;
    const targetPoint = target[i];
    if (targetPoint) {
      targetPoint.x = sourcePoint.x;
      targetPoint.y = sourcePoint.y;
    } else {
      target[i] = { x: sourcePoint.x, y: sourcePoint.y };
    }
  }
}

const isIdentityCurve = (points: CurveUniforms["rgb"]) => {
  if (points.length < 2) {
    return true;
  }
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]!;
    if (Math.abs(point.y - point.x) > 0.5) {
      return false;
    }
  }
  return true;
};

export function resolveMasterUniforms(
  tone: ImageRenderToneState,
  color: ImageRenderColorState,
  detail: Pick<ImageRenderDetailState, "dehaze">,
  out?: MasterUniforms
): MasterUniforms {
  const target = out ?? createMasterUniforms();
  const grading = color.colorGrading;

  target.exposure = (safeNumber(tone.exposure) / 100) * 5;
  target.contrast = safeNumber(tone.contrast);
  target.highlights = safeNumber(tone.highlights);
  target.shadows = safeNumber(tone.shadows);
  target.whites = safeNumber(tone.whites);
  target.blacks = safeNumber(tone.blacks);

  const relativeTemperature = safeNumber(color.temperature);
  const relativeTint = safeNumber(color.tint);
  const hasAbsoluteWhiteBalance =
    Number.isFinite(color.temperatureKelvin ?? NaN) || Number.isFinite(color.tintMG ?? NaN);
  const relativeWhiteBalanceActive =
    Math.abs(relativeTemperature) > 0.001 || Math.abs(relativeTint) > 0.001;
  if (hasAbsoluteWhiteBalance && !relativeWhiteBalanceActive) {
    resolveAbsoluteWhiteBalanceLmsScale(
      target.whiteBalanceLmsScale,
      color.temperatureKelvin ?? 6500,
      color.tintMG ?? 0
    );
  } else {
    resolveRelativeWhiteBalanceLmsScale(
      target.whiteBalanceLmsScale,
      relativeTemperature,
      relativeTint
    );
  }

  target.hueShift = safeNumber(color.hue);
  target.saturation = safeNumber(color.saturation);
  target.vibrance = safeNumber(color.vibrance);
  target.luminance = 0;
  target.curveHighlights = 0;
  target.curveLights = 0;
  target.curveDarks = 0;
  target.curveShadows = 0;

  target.colorGradeShadows[0] = safeNumber(grading.shadows.hue);
  target.colorGradeShadows[1] = safeNumber(grading.shadows.saturation) / 100;
  target.colorGradeShadows[2] = safeNumber(grading.shadows.luminance) / 100;
  target.colorGradeMidtones[0] = safeNumber(grading.midtones.hue);
  target.colorGradeMidtones[1] = safeNumber(grading.midtones.saturation) / 100;
  target.colorGradeMidtones[2] = safeNumber(grading.midtones.luminance) / 100;
  target.colorGradeHighlights[0] = safeNumber(grading.highlights.hue);
  target.colorGradeHighlights[1] = safeNumber(grading.highlights.saturation) / 100;
  target.colorGradeHighlights[2] = safeNumber(grading.highlights.luminance) / 100;
  target.colorGradeBlend = safeNumber(grading.blend, 50) / 100;
  target.colorGradeBalance = safeNumber(grading.balance) / 100;
  target.dehaze = safeNumber(detail.dehaze);

  return target;
}

export function resolveHslUniformsFromState(
  color: ImageRenderColorState,
  out?: HSLUniforms
): HSLUniforms {
  const target = out ?? createHslUniforms();
  let enabled = false;

  for (let i = 0; i < HSL_CHANNELS.length; i += 1) {
    const channel = color.hsl[HSL_CHANNELS[i]!];
    target.hue[i] = safeNumber(channel.hue);
    target.saturation[i] = safeNumber(channel.saturation);
    target.luminance[i] = safeNumber(channel.luminance);
    enabled =
      enabled ||
      Math.abs(safeNumber(channel.hue)) > 0.001 ||
      Math.abs(safeNumber(channel.saturation)) > 0.001 ||
      Math.abs(safeNumber(channel.luminance)) > 0.001;
  }

  target.bwEnabled = Boolean(color.bwEnabled);
  const bwMix = color.bwMix ?? { red: 0, green: 0, blue: 0 };
  const baseWeights: [number, number, number] = [0.2126, 0.7152, 0.0722];
  target.bwMix[0] = Math.max(0, baseWeights[0] * (1 + bwMix.red * 0.01));
  target.bwMix[1] = Math.max(0, baseWeights[1] * (1 + bwMix.green * 0.01));
  target.bwMix[2] = Math.max(0, baseWeights[2] * (1 + bwMix.blue * 0.01));
  const bwWeightSum = target.bwMix[0] + target.bwMix[1] + target.bwMix[2];
  if (bwWeightSum > 1.0e-5) {
    target.bwMix[0] /= bwWeightSum;
    target.bwMix[1] /= bwWeightSum;
    target.bwMix[2] /= bwWeightSum;
  } else {
    target.bwMix[0] = baseWeights[0];
    target.bwMix[1] = baseWeights[1];
    target.bwMix[2] = baseWeights[2];
  }

  const calibration = color.calibration;
  target.calibrationHue[0] = safeNumber(calibration?.redHue ?? 0);
  target.calibrationHue[1] = safeNumber(calibration?.greenHue ?? 0);
  target.calibrationHue[2] = safeNumber(calibration?.blueHue ?? 0);
  target.calibrationSaturation[0] = safeNumber(calibration?.redSaturation ?? 0);
  target.calibrationSaturation[1] = safeNumber(calibration?.greenSaturation ?? 0);
  target.calibrationSaturation[2] = safeNumber(calibration?.blueSaturation ?? 0);
  target.calibrationEnabled =
    Math.abs(target.calibrationHue[0]) > 0.001 ||
    Math.abs(target.calibrationHue[1]) > 0.001 ||
    Math.abs(target.calibrationHue[2]) > 0.001 ||
    Math.abs(target.calibrationSaturation[0]) > 0.001 ||
    Math.abs(target.calibrationSaturation[1]) > 0.001 ||
    Math.abs(target.calibrationSaturation[2]) > 0.001;
  enabled = enabled || target.bwEnabled || target.calibrationEnabled;

  target.enabled = enabled;
  return target;
}

export function resolveCurveUniformsFromState(
  color: Pick<ImageRenderColorState, "pointCurve">,
  out?: CurveUniforms
): CurveUniforms {
  const target = out ?? createCurveUniforms();
  copyCurvePoints(target.rgb, color.pointCurve.rgb);
  copyCurvePoints(target.red, color.pointCurve.red);
  copyCurvePoints(target.green, color.pointCurve.green);
  copyCurvePoints(target.blue, color.pointCurve.blue);
  target.enabled =
    !isIdentityCurve(target.rgb) ||
    !isIdentityCurve(target.red) ||
    !isIdentityCurve(target.green) ||
    !isIdentityCurve(target.blue);
  return target;
}

export function resolveDetailUniformsFromState(
  detail: ImageRenderDetailState,
  context?: { shortEdgePx?: number },
  out?: DetailUniforms
): DetailUniforms {
  const target = out ?? createDetailUniforms();
  target.texture = safeNumber(detail.texture);
  target.clarity = safeNumber(detail.clarity);
  target.sharpening = safeNumber(detail.sharpening);
  target.sharpenRadius = safeNumber(detail.sharpenRadius, 40);
  target.sharpenDetail = safeNumber(detail.sharpenDetail, 25);
  target.masking = safeNumber(detail.masking);
  target.noiseReduction = safeNumber(detail.noiseReduction);
  target.colorNoiseReduction = safeNumber(detail.colorNoiseReduction);
  target.u_shortEdgePx = Math.max(
    1,
    typeof context?.shortEdgePx === "number" && Number.isFinite(context.shortEdgePx)
      ? context.shortEdgePx
      : 1
  );
  target.enabled =
    Math.abs(target.texture) > 0.001 ||
    Math.abs(target.clarity) > 0.001 ||
    target.sharpening > 0.001 ||
    target.noiseReduction > 0.001 ||
    target.colorNoiseReduction > 0.001;
  return target;
}

const resolvePrintStockCode = (
  stock: "kodak-2383" | "endura" | "cineon-log" | "custom" | undefined
) => {
  if (stock === "endura") return 1;
  if (stock === "cineon-log") return 2;
  if (stock === "custom") return 3;
  return 0;
};

const resolveFilmFormatCode = (format: "8mm" | "16mm" | "35mm" | "65mm" | undefined) => {
  if (format === "8mm") return 0;
  if (format === "16mm") return 1;
  if (format === "65mm") return 3;
  return 2;
};

export function resolveFilmUniformsV3(
  profile: FilmProfileV3,
  options?: { grainSeed?: number },
  out?: FilmUniforms
): FilmUniforms {
  const target = out ?? createFilmUniforms();
  const cc = profile.colorCast;
  const toning = profile.printToning;
  const grainSeed = options?.grainSeed ?? Date.now();
  const printTargetWhiteKelvin = clampValue(profile.print?.targetWhiteKelvin ?? 6500, 5500, 6500);
  const pushPullEv = safeNumber(profile.pushPull?.ev ?? 0);
  const gateWeaveAmount = clampValue(safeNumber(profile.gateWeave?.amount ?? 0), 0, 1);
  const gateWeaveSeed = profile.gateWeave?.seed ?? grainSeed;

  target.u_expandEnabled = profile.expand?.enabled ?? false;
  target.u_expandBlackPoint = profile.expand?.blackPoint ?? 0;
  target.u_expandWhitePoint = profile.expand?.whitePoint ?? 1;

  target.u_filmCompressionEnabled = profile.filmCompression?.enabled ?? false;
  target.u_highlightRolloff = profile.filmCompression?.highlightRolloff ?? 0.4;
  target.u_shoulderWidth = profile.filmCompression?.shoulderWidth ?? 0.4;

  target.u_filmDeveloperEnabled = profile.filmDeveloper?.enabled ?? false;
  target.u_developerContrast = profile.filmDeveloper?.contrast ?? 0;
  target.u_developerGamma = profile.filmDeveloper?.gamma ?? 1;
  copyVec3(target.u_colorSeparation, profile.filmDeveloper?.colorSeparation ?? VEC3_ONE);

  target.u_toneEnabled = profile.toneResponse.enabled;
  target.u_shoulder = profile.toneResponse.shoulder;
  target.u_toe = profile.toneResponse.toe;
  target.u_gamma = profile.toneResponse.gamma;

  target.u_colorMatrixEnabled = profile.colorMatrix?.enabled ?? false;
  transpose3x3Into(target.u_colorMatrix, profile.colorMatrix?.matrix ?? IDENTITY_3X3);

  target.u_lutEnabled = profile.lut3d.enabled && profile.lut3d.intensity > 0;
  target.u_lutIntensity = profile.lut3d.intensity;
  target.u_lutMixEnabled = false;
  target.u_lutMixFactor = 0;

  target.u_printEnabled = profile.print?.enabled ?? false;
  target.u_printDensity = profile.print?.density ?? 0;
  target.u_printContrast = profile.print?.contrast ?? 0;
  target.u_printWarmth = profile.print?.warmth ?? 0;
  target.u_printStock = resolvePrintStockCode(profile.print?.stock);
  target.u_printTargetWhiteKelvin = printTargetWhiteKelvin;
  target.u_printLutEnabled =
    (profile.print?.enabled ?? false) && profile.print?.stock === "custom";
  target.u_printLutIntensity = 1;

  target.u_cmyColorHeadEnabled = profile.cmyColorHead?.enabled ?? false;
  target.u_cyan = profile.cmyColorHead?.cyan ?? 0;
  target.u_magenta = profile.cmyColorHead?.magenta ?? 0;
  target.u_yellow = profile.cmyColorHead?.yellow ?? 0;

  target.u_colorCastEnabled = cc?.enabled ?? false;
  copyVec3(target.u_colorCastShadows, cc?.shadows ?? VEC3_ZERO);
  copyVec3(target.u_colorCastMidtones, cc?.midtones ?? VEC3_ZERO);
  copyVec3(target.u_colorCastHighlights, cc?.highlights ?? VEC3_ZERO);

  target.u_printToningEnabled = toning?.enabled ?? false;
  copyVec3(target.u_toningShadows, toning?.shadows ?? VEC3_ZERO);
  copyVec3(target.u_toningMidtones, toning?.midtones ?? VEC3_ZERO);
  copyVec3(target.u_toningHighlights, toning?.highlights ?? VEC3_ZERO);
  target.u_toningStrength = toning?.strength ?? 0.35;

  target.u_customLutEnabled = profile.customLut?.enabled ?? false;
  target.u_customLutIntensity = profile.customLut?.intensity ?? 0;

  target.u_grainEnabled = profile.grain.enabled && profile.grain.amount > 0;
  target.u_grainModel = profile.grain.model === "procedural" ? 1 : 0;
  target.u_grainAmount = profile.grain.amount;
  target.u_grainSize = profile.grain.size;
  target.u_grainRoughness = profile.grain.roughness;
  target.u_grainShadowBias = profile.grain.shadowBias;
  target.u_grainSeed = grainSeed;
  target.u_grainIsColor = profile.grain.colorGrain;
  target.u_crystalDensity = profile.grain.crystalDensity;
  target.u_crystalSizeMean = profile.grain.crystalSizeMean;
  target.u_crystalSizeVariance = profile.grain.crystalSizeVariance;
  copyVec3(target.u_grainColorSeparation, profile.grain.colorSeparation);
  target.u_scannerMTF = profile.grain.scannerMTF;
  target.u_filmFormat = resolveFilmFormatCode(profile.grain.filmFormat);

  target.u_vignetteEnabled = profile.vignette.enabled && Math.abs(profile.vignette.amount) > 0.001;
  target.u_vignetteAmount = profile.vignette.amount;
  target.u_vignetteMidpoint = profile.vignette.midpoint;
  target.u_vignetteRoundness = profile.vignette.roundness;

  target.u_filmBreathEnabled = profile.filmBreath?.enabled ?? false;
  target.u_breathAmount = profile.filmBreath?.amount ?? 0;
  target.u_breathSeed = grainSeed;
  target.u_gateWeaveEnabled = profile.gateWeave?.enabled ?? false;
  target.u_gateWeaveAmount = gateWeaveAmount;
  target.u_gateWeaveSeed = gateWeaveSeed;
  target.u_pushPullEv = pushPullEv;

  target.u_filmDamageEnabled = profile.filmDamage?.enabled ?? false;
  target.u_damageAmount = profile.filmDamage?.amount ?? 0;
  target.u_damageSeed = grainSeed;

  target.u_overscanEnabled = profile.overscan?.enabled ?? false;
  target.u_overscanAmount = profile.overscan?.amount ?? 0;
  target.u_overscanRoundness = profile.overscan?.roundness ?? 0.5;

  return target;
}

export function resolveHalationBloomUniformsV3(
  profile: FilmProfileV3,
  out?: HalationBloomUniforms
): HalationBloomUniforms {
  const target = out ?? createHalationBloomUniforms();
  const hal = profile.halation;
  const bloom = profile.bloom;
  const glow = profile.glow;

  target.halationEnabled = hal?.enabled ?? false;
  target.halationThreshold = srgbToLinearUnit(hal?.threshold ?? 0.9);
  target.halationIntensity = hal?.intensity ?? 0;
  if (target.halationColor) {
    copyVec3(target.halationColor, HALATION_COLOR_DEFAULT);
  } else {
    target.halationColor = [...HALATION_COLOR_DEFAULT];
  }
  target.halationHue = hal?.hue ?? 16;
  target.halationSaturation = hal?.saturation ?? 0.75;
  target.halationBlueCompensation = hal?.blueCompensation ?? 0.2;
  target.halationRadius = hal?.radius ?? 3;

  target.bloomEnabled = bloom?.enabled ?? false;
  target.bloomThreshold = srgbToLinearUnit(bloom?.threshold ?? 0.85);
  target.bloomIntensity = bloom?.intensity ?? 0;
  target.bloomRadius = bloom?.radius ?? 4;
  target.glowEnabled = glow?.enabled ?? false;
  target.glowIntensity = glow?.intensity ?? 0;
  target.glowMidtoneFocus = glow?.midtoneFocus ?? 0.5;
  target.glowBias = glow?.bias ?? 0.25;
  target.glowRadius = glow?.enabled ? glow?.radius ?? Math.max(1, (glow?.intensity ?? 0) * 6) : 0;
  return target;
}
