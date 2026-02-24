import type { EditingAdjustments, FilmProfile } from "@/types";
import type { FilmProfileV2 } from "@/types/film";
import type {
  MasterUniforms,
  HSLUniforms,
  CurveUniforms,
  DetailUniforms,
  FilmUniforms,
  HalationBloomUniforms,
} from "./types";
import { getFilmModule, normalizeFilmProfile } from "@/lib/film/profile";

const IDENTITY_3X3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Transpose 3x3 row-major to column-major for WebGL. */
function transpose3x3(m: number[]): number[] {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

function copyVec3(target: [number, number, number], source: [number, number, number]) {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
}

function createMasterUniforms(): MasterUniforms {
  return {
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    temperature: 0,
    tint: 0,
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
  };
}

function createFilmUniforms(): FilmUniforms {
  return {
    u_toneEnabled: false,
    u_shoulder: 0,
    u_toe: 0,
    u_gamma: 1,
    u_colorMatrixEnabled: false,
    u_colorMatrix: [...IDENTITY_3X3],
    u_lutEnabled: false,
    u_lutIntensity: 0,
    u_colorCastEnabled: false,
    u_colorCastShadows: [0, 0, 0],
    u_colorCastMidtones: [0, 0, 0],
    u_colorCastHighlights: [0, 0, 0],
    u_grainEnabled: false,
    u_grainAmount: 0,
    u_grainSize: 0.5,
    u_grainRoughness: 0.5,
    u_grainShadowBias: 0.45,
    u_grainSeed: 0,
    u_grainIsColor: true,
    u_vignetteEnabled: false,
    u_vignetteAmount: 0,
    u_vignetteMidpoint: 0.5,
    u_vignetteRoundness: 0.5,
  };
}

function createHalationBloomUniforms(): HalationBloomUniforms {
  return {
    halationEnabled: false,
    halationThreshold: 0.9,
    halationIntensity: 0,
    halationColor: [1.0, 0.3, 0.1],
    bloomEnabled: false,
    bloomThreshold: 0.85,
    bloomIntensity: 0,
  };
}

const HSL_CHANNELS: Array<keyof EditingAdjustments["hsl"]> = [
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

const clampCurveValue = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

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

const buildLegacyRgbCurve = (adj: EditingAdjustments): CurveUniforms["rgb"] => [
  { x: 0, y: clampCurveValue(adj.curveShadows * 0.7) },
  { x: 64, y: clampCurveValue(64 + adj.curveDarks * 1.25) },
  { x: 128, y: 128 },
  { x: 192, y: clampCurveValue(192 + adj.curveLights * 1.25) },
  { x: 255, y: clampCurveValue(255 + adj.curveHighlights * 0.7) },
];

/**
 * Map EditingAdjustments to MasterUniforms for the Master shader pass.
 *
 * The Master shader operates in linear space with scientific color models
 * (OKLab HSL, LMS white balance) instead of the RGB approximations in the
 * legacy shader. Parameter ranges are preserved for UI compatibility.
 */
export function resolveFromAdjustments(
  adj: EditingAdjustments,
  out?: MasterUniforms
): MasterUniforms {
  const target = out ?? createMasterUniforms();
  const grading = adj.colorGrading;

  // Exposure: map from [-100, 100] UI range to [-5, 5] EV
  target.exposure = (adj.exposure / 100) * 5;

  // These pass through directly (shader normalizes by /100)
  target.contrast = adj.contrast;
  target.highlights = adj.highlights;
  target.shadows = adj.shadows;
  target.whites = adj.whites;
  target.blacks = adj.blacks;

  // White balance
  target.temperature = adj.temperature;
  target.tint = adj.tint;

  // OKLab HSL: hueShift is new (not in v1 UI), default to 0
  target.hueShift = 0;
  target.saturation = adj.saturation;
  target.vibrance = adj.vibrance;
  target.luminance = 0; // Not exposed in current UI

  // Curves
  // Legacy 4-segment curve now runs in Curve pass to avoid hue shifts from
  // per-channel S-curve application. Keep Master curve disabled.
  target.curveHighlights = 0;
  target.curveLights = 0;
  target.curveDarks = 0;
  target.curveShadows = 0;

  // 3-way color grading
  target.colorGradeShadows[0] = grading.shadows.hue;
  target.colorGradeShadows[1] = grading.shadows.saturation / 100;
  target.colorGradeShadows[2] = grading.shadows.luminance / 100;
  target.colorGradeMidtones[0] = grading.midtones.hue;
  target.colorGradeMidtones[1] = grading.midtones.saturation / 100;
  target.colorGradeMidtones[2] = grading.midtones.luminance / 100;
  target.colorGradeHighlights[0] = grading.highlights.hue;
  target.colorGradeHighlights[1] = grading.highlights.saturation / 100;
  target.colorGradeHighlights[2] = grading.highlights.luminance / 100;
  target.colorGradeBlend = grading.blend / 100;
  target.colorGradeBalance = grading.balance / 100;

  // Detail
  target.dehaze = adj.dehaze;

  return target;
}

/**
 * Resolve per-hue HSL uniforms from adjustments.
 * Values stay in UI range and are normalized in shader.
 */
export function resolveHslUniforms(adj: EditingAdjustments, out?: HSLUniforms): HSLUniforms {
  const target = out ?? createHslUniforms();
  let enabled = false;

  for (let i = 0; i < HSL_CHANNELS.length; i += 1) {
    const channel = adj.hsl[HSL_CHANNELS[i]!];
    target.hue[i] = channel.hue;
    target.saturation[i] = channel.saturation;
    target.luminance[i] = channel.luminance;
    enabled =
      enabled ||
      Math.abs(channel.hue) > 0.001 ||
      Math.abs(channel.saturation) > 0.001 ||
      Math.abs(channel.luminance) > 0.001;
  }

  target.enabled = enabled;
  return target;
}

/**
 * Resolve point-curve uniforms from adjustments.
 */
export function resolveCurveUniforms(
  adj: EditingAdjustments,
  out?: CurveUniforms
): CurveUniforms {
  const target = out ?? createCurveUniforms();
  copyCurvePoints(target.rgb, adj.pointCurve.rgb);
  copyCurvePoints(target.red, adj.pointCurve.red);
  copyCurvePoints(target.green, adj.pointCurve.green);
  copyCurvePoints(target.blue, adj.pointCurve.blue);

  const hasLegacyCurve =
    Math.abs(adj.curveHighlights) > 0.001 ||
    Math.abs(adj.curveLights) > 0.001 ||
    Math.abs(adj.curveDarks) > 0.001 ||
    Math.abs(adj.curveShadows) > 0.001;

  // Compatibility bridge: old 4-slider tone curve still drives the RGB curve
  // until UI fully migrates to point-curve editing.
  if (
    hasLegacyCurve &&
    isIdentityCurve(target.rgb) &&
    isIdentityCurve(target.red) &&
    isIdentityCurve(target.green) &&
    isIdentityCurve(target.blue)
  ) {
    copyCurvePoints(target.rgb, buildLegacyRgbCurve(adj));
  }

  target.enabled =
    hasLegacyCurve ||
    !isIdentityCurve(target.rgb) ||
    !isIdentityCurve(target.red) ||
    !isIdentityCurve(target.green) ||
    !isIdentityCurve(target.blue);

  return target;
}

/**
 * Resolve detail uniforms from adjustments.
 */
export function resolveDetailUniforms(
  adj: EditingAdjustments,
  out?: DetailUniforms
): DetailUniforms {
  const target = out ?? createDetailUniforms();
  target.texture = adj.texture;
  target.clarity = adj.clarity;
  target.sharpening = adj.sharpening;
  target.sharpenRadius = adj.sharpenRadius;
  target.sharpenDetail = adj.sharpenDetail;
  target.masking = adj.masking;
  target.noiseReduction = adj.noiseReduction;
  target.colorNoiseReduction = adj.colorNoiseReduction;

  target.enabled =
    Math.abs(target.texture) > 0.001 ||
    Math.abs(target.clarity) > 0.001 ||
    target.sharpening > 0.001 ||
    target.noiseReduction > 0.001 ||
    target.colorNoiseReduction > 0.001;
  return target;
}

/**
 * Resolve Film uniforms from an existing v1 FilmProfile.
 *
 * Maps the legacy 5-module system (colorScience, tone, scan, grain, defects)
 * into the new Film shader uniform format.
 */
export function resolveFilmUniforms(
  profile: FilmProfile,
  options?: { grainSeed?: number },
  out?: FilmUniforms
): FilmUniforms {
  const target = out ?? createFilmUniforms();
  const normalized = normalizeFilmProfile(profile);
  const tone = getFilmModule(normalized, "tone");
  const grain = getFilmModule(normalized, "grain");
  const scan = getFilmModule(normalized, "scan");
  const colorScience = getFilmModule(normalized, "colorScience");

  const toneAmount = tone?.enabled ? tone.amount / 100 : 0;
  const grainAmount = grain?.enabled ? grain.amount / 100 : 0;
  const scanAmount = scan?.enabled ? scan.amount / 100 : 0;

  // Derive color cast from scanWarmth
  const warmth = (scan?.params.scanWarmth ?? 0) / 100;
  const warmthScale = warmth * 0.12 * scanAmount;
  const hasColorCast = Math.abs(warmthScale) > 0.001;
  const colorMatrix = colorScience?.enabled
    ? transpose3x3([
        colorScience.params.rgbMix[0],
        0,
        0,
        0,
        colorScience.params.rgbMix[1],
        0,
        0,
        0,
        colorScience.params.rgbMix[2],
      ])
    : IDENTITY_3X3;

  // Layer 1: Tone Response
  // Map from legacy tone module -- derive S-curve params from tone settings
  target.u_toneEnabled = toneAmount > 0;
  target.u_shoulder = 0; // Identity for v1 profiles; v2 profiles specify explicit values
  target.u_toe = 0; // Identity for v1 profiles; v2 profiles specify explicit values
  target.u_gamma = 1.0;

  // Layer 2: Color Matrix (derived from colorScience.rgbMix as diagonal)
  // Transpose to column-major for WebGL, consistent with V2 path.
  target.u_colorMatrixEnabled = colorScience?.enabled
    ? colorScience.params.rgbMix[0] !== 1 ||
      colorScience.params.rgbMix[1] !== 1 ||
      colorScience.params.rgbMix[2] !== 1
    : false;
  for (let i = 0; i < 9; i += 1) {
    target.u_colorMatrix[i] = colorMatrix[i] ?? IDENTITY_3X3[i] ?? 0;
  }

  // Layer 3: LUT (not available in v1 profiles, disabled by default)
  target.u_lutEnabled = false;
  target.u_lutIntensity = 0.0;

  // Layer 4: Color Cast (derived from scanWarmth)
  target.u_colorCastEnabled = hasColorCast;
  target.u_colorCastShadows[0] = warmthScale * 0.5;
  target.u_colorCastShadows[1] = 0;
  target.u_colorCastShadows[2] = -warmthScale * 0.5;
  target.u_colorCastMidtones[0] = warmthScale * 0.3;
  target.u_colorCastMidtones[1] = 0;
  target.u_colorCastMidtones[2] = -warmthScale * 0.3;
  target.u_colorCastHighlights[0] = warmthScale * 0.1;
  target.u_colorCastHighlights[1] = 0;
  target.u_colorCastHighlights[2] = -warmthScale * 0.1;

  // Layer 5: Grain
  target.u_grainEnabled = grainAmount > 0 && (grain?.params.amount ?? 0) > 0;
  target.u_grainAmount = (grain?.params.amount ?? 0) * grainAmount;
  target.u_grainSize = grain?.params.size ?? 0.5;
  target.u_grainRoughness = grain?.params.roughness ?? 0.5;
  target.u_grainShadowBias = grain?.params.shadowBoost ?? 0.45;
  target.u_grainSeed = options?.grainSeed ?? Date.now();
  target.u_grainIsColor = (grain?.params.color ?? 0.08) > 0.01;

  // Layer 6: Vignette
  target.u_vignetteEnabled = scanAmount > 0 && Math.abs(scan?.params.vignetteAmount ?? 0) > 0.001;
  target.u_vignetteAmount = (scan?.params.vignetteAmount ?? 0) * scanAmount;
  target.u_vignetteMidpoint = 0.5;
  target.u_vignetteRoundness = 0.5;

  return target;
}

/**
 * Resolve Halation/Bloom uniforms from a v1 FilmProfile.
 *
 * Maps the legacy scan module's halation/bloom parameters into the
 * new multi-pass HalationBloomFilter uniform format.
 */
export function resolveHalationBloomUniforms(
  profile: FilmProfile,
  out?: HalationBloomUniforms
): HalationBloomUniforms {
  const target = out ?? createHalationBloomUniforms();
  const normalized = normalizeFilmProfile(profile);
  const scan = getFilmModule(normalized, "scan");
  const scanAmount = scan?.enabled ? scan.amount / 100 : 0;

  const halIntensity = (scan?.params.halationAmount ?? 0) * scanAmount;
  const bloomIntensity = (scan?.params.bloomAmount ?? 0) * scanAmount;

  target.halationEnabled = halIntensity > 0.001;
  target.halationThreshold = scan?.params.halationThreshold ?? 0.9;
  target.halationIntensity = halIntensity;
  target.halationColor = [1.0, 0.3, 0.1]; // Classic warm film halation
  target.halationRadius = Math.max(1, halIntensity * 8);

  target.bloomEnabled = bloomIntensity > 0.001;
  target.bloomThreshold = scan?.params.bloomThreshold ?? 0.85;
  target.bloomIntensity = bloomIntensity;
  target.bloomRadius = Math.max(1, bloomIntensity * 10);

  return target;
}

/**
 * Resolve Film uniforms from a V2 FilmProfile.
 *
 * Directly maps the structured V2 profile layers to shader uniforms.
 */
export function resolveFilmUniformsV2(
  profile: FilmProfileV2,
  options?: { grainSeed?: number },
  out?: FilmUniforms
): FilmUniforms {
  const target = out ?? createFilmUniforms();
  const cc = profile.colorCast;
  const colorMatrix = transpose3x3(profile.colorMatrix?.matrix ?? IDENTITY_3X3);

  // Layer 1: Tone Response
  target.u_toneEnabled = profile.toneResponse.enabled;
  target.u_shoulder = profile.toneResponse.shoulder;
  target.u_toe = profile.toneResponse.toe;
  target.u_gamma = profile.toneResponse.gamma;

  // Layer 2: Color Matrix
  target.u_colorMatrixEnabled = profile.colorMatrix?.enabled ?? false;
  for (let i = 0; i < 9; i += 1) {
    target.u_colorMatrix[i] = colorMatrix[i] ?? IDENTITY_3X3[i] ?? 0;
  }

  // Layer 3: LUT
  target.u_lutEnabled = profile.lut.enabled && profile.lut.intensity > 0;
  target.u_lutIntensity = profile.lut.intensity;

  // Layer 4: Color Cast
  target.u_colorCastEnabled = cc?.enabled ?? false;
  copyVec3(target.u_colorCastShadows, cc?.shadows ?? [0, 0, 0]);
  copyVec3(target.u_colorCastMidtones, cc?.midtones ?? [0, 0, 0]);
  copyVec3(target.u_colorCastHighlights, cc?.highlights ?? [0, 0, 0]);

  // Layer 5: Grain
  target.u_grainEnabled = profile.grain.enabled && profile.grain.amount > 0;
  target.u_grainAmount = profile.grain.amount;
  target.u_grainSize = profile.grain.size;
  target.u_grainRoughness = profile.grain.roughness;
  target.u_grainShadowBias = profile.grain.shadowBias;
  target.u_grainSeed = options?.grainSeed ?? Date.now();
  target.u_grainIsColor = profile.grain.colorGrain;

  // Layer 6: Vignette
  target.u_vignetteEnabled = profile.vignette.enabled && Math.abs(profile.vignette.amount) > 0.001;
  target.u_vignetteAmount = profile.vignette.amount;
  target.u_vignetteMidpoint = profile.vignette.midpoint;
  target.u_vignetteRoundness = profile.vignette.roundness;

  return target;
}

/**
 * Resolve Halation/Bloom uniforms from a V2 FilmProfile.
 */
export function resolveHalationBloomUniformsV2(
  profile: FilmProfileV2,
  out?: HalationBloomUniforms
): HalationBloomUniforms {
  const target = out ?? createHalationBloomUniforms();
  const hal = profile.halation;
  const bloom = profile.bloom;

  target.halationEnabled = hal?.enabled ?? false;
  target.halationThreshold = hal?.threshold ?? 0.9;
  target.halationIntensity = hal?.intensity ?? 0;
  target.halationColor = hal?.color ?? [1.0, 0.3, 0.1];
  target.halationRadius = hal?.radius;

  target.bloomEnabled = bloom?.enabled ?? false;
  target.bloomThreshold = bloom?.threshold ?? 0.85;
  target.bloomIntensity = bloom?.intensity ?? 0;
  target.bloomRadius = bloom?.radius;

  return target;
}
