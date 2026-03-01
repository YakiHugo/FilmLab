import * as twgl from "twgl.js";
import type { ProgramInfo } from "twgl.js";
import { LUTCache } from "./LUTCache";
import { FilterPipeline } from "./gpu/FilterPipeline";
import type { PipelinePass } from "./gpu/PipelinePass";
import { TexturePool } from "./gpu/TexturePool";
import { readPixelsAsync } from "./gpu/TiledRenderer";
import { CURVE_LUT_SIZE, buildCurveLutPixels, createIdentityCurvePixels } from "./gpu/CurveLut";
import {
  buildGlowCompositePasses,
  buildGlowMaskPasses,
  buildHalationCompositePasses,
  buildHalationMaskPasses,
} from "./passes/opticsPasses";
import type {
  CurveUniforms,
  DetailUniforms,
  FilmUniforms,
  GeometryUniforms,
  HSLUniforms,
  HalationBloomUniforms,
  MasterUniforms,
} from "./types";

import fullscreenVertexSrc from "./shaders/Fullscreen.vert?raw";
import passthroughFragSrc from "./shaders/Passthrough.frag?raw";
import inputDecodeFragSrc from "./shaders/InputDecode.frag?raw";
import geometryFragSrc from "./shaders/Geometry.frag?raw";
import masterFragSrc from "./shaders/generated/MasterAdjustment.frag?raw";
import hslFragSrc from "./shaders/HSL.frag?raw";
import curveFragSrc from "./shaders/Curve.frag?raw";
import detailFragSrc from "./shaders/Detail.frag?raw";
import filmExpandFragSrc from "./shaders/FilmExpand.frag?raw";
import filmCompressionFragSrc from "./shaders/FilmCompression.frag?raw";
import filmDeveloperFragSrc from "./shaders/FilmDeveloper.frag?raw";
import filmToneResponseFragSrc from "./shaders/FilmToneResponse.frag?raw";
import filmColorMatrixFragSrc from "./shaders/FilmColorMatrix.frag?raw";
import filmLut3DFragSrc from "./shaders/FilmLUT3D.frag?raw";
import customLutFragSrc from "./shaders/CustomLUT.frag?raw";
import filmPrintFragSrc from "./shaders/FilmPrint.frag?raw";
import filmCMYColorHeadFragSrc from "./shaders/FilmCMYColorHead.frag?raw";
import filmColorCastFragSrc from "./shaders/FilmColorCast.frag?raw";
import filmPrintToningFragSrc from "./shaders/FilmPrintToning.frag?raw";
import filmGrainFragSrc from "./shaders/FilmGrain.frag?raw";
import proceduralGrainFragSrc from "./shaders/ProceduralGrain.frag?raw";
import filmVignetteFragSrc from "./shaders/FilmVignette.frag?raw";
import glowThresholdFragSrc from "./shaders/GlowThreshold.frag?raw";
import glowCompositeFragSrc from "./shaders/GlowComposite.frag?raw";
import filmBreathFragSrc from "./shaders/FilmBreath.frag?raw";
import filmDamageFragSrc from "./shaders/FilmDamage.frag?raw";
import overscanFragSrc from "./shaders/Overscan.frag?raw";
import halationThresholdFragSrc from "./shaders/HalationThreshold.frag?raw";
import gaussianBlurFragSrc from "./shaders/GaussianBlur.frag?raw";
import halationCompositeFragSrc from "./shaders/HalationComposite.frag?raw";
import downsampleFragSrc from "./shaders/Downsample.frag?raw";
import bilateralScaleFragSrc from "./shaders/BilateralScale.frag?raw";
import reconstructFragSrc from "./shaders/Reconstruct.frag?raw";
import outputEncodeFragSrc from "./shaders/OutputEncode.frag?raw";
import maskedBlendFragSrc from "./shaders/MaskedBlend.frag?raw";

export interface PipelineRenderOptions {
  skipGeometry?: boolean;
  skipMaster?: boolean;
  skipHsl?: boolean;
  skipCurve?: boolean;
  skipDetail?: boolean;
  skipFilm?: boolean;
  skipHalationBloom?: boolean;
  captureLinearOutput?: boolean;
}

export interface PipelineRendererOptions {
  preserveDrawingBuffer?: boolean;
  label?: "preview" | "export";
}

export interface PipelineRenderMetrics {
  totalMs: number;
  updateUniformsMs: number;
  filterChainMs: number;
  drawMs: number;
  passCpuMs: {
    geometry: number;
    master: number;
    hsl: number;
    curve: number;
    detail: number;
    film: number;
    optics: number;
  };
  activePasses: string[];
}

export interface LinearRenderResult {
  texture: WebGLTexture;
  width: number;
  height: number;
  format: "RGBA8" | "RGBA16F";
  release: () => void;
}

interface RendererPrograms {
  passthrough: ProgramInfo;
  inputDecode: ProgramInfo;
  geometry: ProgramInfo;
  master: ProgramInfo;
  hsl: ProgramInfo;
  curve: ProgramInfo;
  detail: ProgramInfo;
  filmExpand: ProgramInfo;
  filmCompression: ProgramInfo;
  filmDeveloper: ProgramInfo;
  filmToneResponse: ProgramInfo;
  filmColorMatrix: ProgramInfo;
  filmLut3D: ProgramInfo;
  customLut: ProgramInfo;
  filmPrint: ProgramInfo;
  filmCMYColorHead: ProgramInfo;
  filmColorCast: ProgramInfo;
  filmPrintToning: ProgramInfo;
  filmGrain: ProgramInfo;
  proceduralGrain: ProgramInfo;
  filmVignette: ProgramInfo;
  glowThreshold: ProgramInfo;
  glowComposite: ProgramInfo;
  filmBreath: ProgramInfo;
  filmDamage: ProgramInfo;
  overscan: ProgramInfo;
  halationThreshold: ProgramInfo;
  blur: ProgramInfo;
  halationComposite: ProgramInfo;
  downsample: ProgramInfo;
  bilateralScale: ProgramInfo;
  reconstruct: ProgramInfo;
  outputEncode: ProgramInfo;
  maskedBlend: ProgramInfo;
}

interface SourceTextureRecord {
  texture: WebGLTexture;
  width: number;
  height: number;
  mutable: boolean;
}

interface PassCpuMs {
  geometry: number;
  master: number;
  hsl: number;
  curve: number;
  detail: number;
  film: number;
  optics: number;
}

const NO_OP_METRICS: PipelineRenderMetrics = {
  totalMs: 0,
  updateUniformsMs: 0,
  filterChainMs: 0,
  drawMs: 0,
  passCpuMs: {
    geometry: 0,
    master: 0,
    hsl: 0,
    curve: 0,
    detail: 0,
    film: 0,
    optics: 0,
  },
  activePasses: [],
};

const shouldUseReducedDetailKernel = (label: "preview" | "export"): boolean => {
  if (label !== "preview" || typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const userAgent = navigator.userAgent || "";
  const uaIndicatesMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const coarsePointer =
    typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)").matches : false;
  return uaIndicatesMobile || coarsePointer;
};

const isMutableSource = (source: TexImageSource): boolean =>
  (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) ||
  (typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas) ||
  (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement);

const createIdentity3DLutTexture = (gl: WebGL2RenderingContext): WebGLTexture => {
  const data = new Uint8Array(2 * 2 * 2 * 4);
  let offset = 0;
  for (let b = 0; b < 2; b += 1) {
    for (let g = 0; g < 2; g += 1) {
      for (let r = 0; r < 2; r += 1) {
        data[offset] = r * 255;
        data[offset + 1] = g * 255;
        data[offset + 2] = b * 255;
        data[offset + 3] = 255;
        offset += 4;
      }
    }
  }

  const texture = gl.createTexture();
  if (!texture) {
    throw new Error("Failed to create identity 3D LUT texture.");
  }

  gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 2, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_3D, null);
  return texture;
};

type ProgramName = keyof RendererPrograms;

const PROGRAM_FRAGMENTS: Record<ProgramName, string> = {
  passthrough: passthroughFragSrc,
  inputDecode: inputDecodeFragSrc,
  geometry: geometryFragSrc,
  master: masterFragSrc,
  hsl: hslFragSrc,
  curve: curveFragSrc,
  detail: detailFragSrc,
  filmExpand: filmExpandFragSrc,
  filmCompression: filmCompressionFragSrc,
  filmDeveloper: filmDeveloperFragSrc,
  filmToneResponse: filmToneResponseFragSrc,
  filmColorMatrix: filmColorMatrixFragSrc,
  filmLut3D: filmLut3DFragSrc,
  customLut: customLutFragSrc,
  filmPrint: filmPrintFragSrc,
  filmCMYColorHead: filmCMYColorHeadFragSrc,
  filmColorCast: filmColorCastFragSrc,
  filmPrintToning: filmPrintToningFragSrc,
  filmGrain: filmGrainFragSrc,
  proceduralGrain: proceduralGrainFragSrc,
  filmVignette: filmVignetteFragSrc,
  glowThreshold: glowThresholdFragSrc,
  glowComposite: glowCompositeFragSrc,
  filmBreath: filmBreathFragSrc,
  filmDamage: filmDamageFragSrc,
  overscan: overscanFragSrc,
  halationThreshold: halationThresholdFragSrc,
  blur: gaussianBlurFragSrc,
  halationComposite: halationCompositeFragSrc,
  downsample: downsampleFragSrc,
  bilateralScale: bilateralScaleFragSrc,
  reconstruct: reconstructFragSrc,
  outputEncode: outputEncodeFragSrc,
  maskedBlend: maskedBlendFragSrc,
};

const CORE_PRECOMPILE_PROGRAMS: readonly ProgramName[] = [
  "passthrough",
  "inputDecode",
  "geometry",
  "master",
  "outputEncode",
];

const DEFERRED_WARMUP_PROGRAMS: readonly ProgramName[] = [
  "hsl",
  "curve",
  "detail",
  "halationThreshold",
  "blur",
  "halationComposite",
  "filmExpand",
  "filmCompression",
  "filmDeveloper",
];

const defineLazyProgram = (
  programs: RendererPrograms,
  gl: WebGL2RenderingContext,
  name: ProgramName,
  fragmentSource: string
) => {
  let cached: ProgramInfo | null = null;
  Object.defineProperty(programs, name, {
    enumerable: true,
    configurable: false,
    get() {
      if (!cached) {
        cached = twgl.createProgramInfo(gl, [fullscreenVertexSrc, fragmentSource]);
      }
      return cached;
    },
  });
};

const createPrograms = (gl: WebGL2RenderingContext): RendererPrograms => {
  const programs = {} as RendererPrograms;
  for (const name of Object.keys(PROGRAM_FRAGMENTS) as ProgramName[]) {
    defineLazyProgram(programs, gl, name, PROGRAM_FRAGMENTS[name]);
  }
  for (const name of CORE_PRECOMPILE_PROGRAMS) {
    void programs[name];
  }
  return programs;
};

const encodeCurveLutToBytes = (source: Float32Array, target: Uint8Array): Uint8Array => {
  const length = Math.min(source.length, target.length);
  for (let i = 0; i < length; i += 1) {
    target[i] = Math.min(255, Math.max(0, Math.round((source[i] ?? 0) * 255)));
  }
  return target;
};

const _floatToHalfView = new Float32Array(1);
const _floatToHalfIntView = new Int32Array(_floatToHalfView.buffer);

const floatToHalf = (value: number): number => {
  _floatToHalfView[0] = value;
  const x = _floatToHalfIntView[0] ?? 0;

  let bits = (x >> 16) & 0x8000;
  let m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;

  if (e < 103) {
    return bits;
  }
  if (e > 142) {
    bits |= 0x7c00;
    bits |= e === 255 && (x & 0x007fffff) ? 1 : 0;
    return bits;
  }
  if (e < 113) {
    m |= 0x0800;
    bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
    return bits;
  }

  bits |= ((e - 112) << 10) | (m >> 1);
  bits += m & 1;
  return bits;
};

const encodeCurveLutToHalfFloats = (source: Float32Array, target: Uint16Array): Uint16Array => {
  const length = Math.min(source.length, target.length);
  for (let i = 0; i < length; i += 1) {
    target[i] = floatToHalf(Math.min(1, Math.max(0, source[i] ?? 0)));
  }
  return target;
};

type FilmUniformViewName =
  | "expand"
  | "compression"
  | "developer"
  | "toneResponse"
  | "colorMatrix"
  | "lut3D"
  | "customLut"
  | "print"
  | "cmy"
  | "colorCast"
  | "printToning"
  | "filmGrain"
  | "proceduralGrain"
  | "vignette"
  | "breath"
  | "damage"
  | "overscan";

const FILM_UNIFORM_VIEW_KEYS: Record<FilmUniformViewName, readonly string[]> = {
  expand: ["u_expandEnabled", "u_expandBlackPoint", "u_expandWhitePoint"],
  compression: ["u_filmCompressionEnabled", "u_highlightRolloff", "u_shoulderWidth"],
  developer: ["u_filmDeveloperEnabled", "u_developerContrast", "u_developerGamma", "u_colorSeparation"],
  toneResponse: ["u_toneEnabled", "u_shoulder", "u_toe", "u_gamma"],
  colorMatrix: ["u_colorMatrixEnabled", "u_colorMatrix"],
  lut3D: ["u_lutEnabled", "u_lutIntensity", "u_lut"],
  customLut: ["u_customLutEnabled", "u_customLutIntensity", "u_customLut"],
  print: [
    "u_printEnabled",
    "u_printDensity",
    "u_printContrast",
    "u_printWarmth",
    "u_printStock",
    "u_printLutEnabled",
    "u_printLutIntensity",
    "u_printLut",
  ],
  cmy: ["u_cmyColorHeadEnabled", "u_cyan", "u_magenta", "u_yellow"],
  colorCast: ["u_colorCastEnabled", "u_colorCastShadows", "u_colorCastMidtones", "u_colorCastHighlights"],
  printToning: [
    "u_printToningEnabled",
    "u_toningShadows",
    "u_toningMidtones",
    "u_toningHighlights",
    "u_toningStrength",
  ],
  filmGrain: [
    "u_grainEnabled",
    "u_grainAmount",
    "u_grainSize",
    "u_grainRoughness",
    "u_grainShadowBias",
    "u_grainSeed",
    "u_grainIsColor",
    "u_textureSize",
    "u_blueNoise",
  ],
  proceduralGrain: [
    "u_grainEnabled",
    "u_grainAmount",
    "u_grainSize",
    "u_grainRoughness",
    "u_grainShadowBias",
    "u_grainSeed",
    "u_grainIsColor",
    "u_textureSize",
    "u_blueNoise",
    "u_grainModel",
    "u_crystalDensity",
    "u_crystalSizeMean",
    "u_crystalSizeVariance",
    "u_grainColorSeparation",
    "u_scannerMTF",
    "u_filmFormat",
  ],
  vignette: ["u_vignetteEnabled", "u_vignetteAmount", "u_vignetteMidpoint", "u_vignetteRoundness", "u_aspectRatio"],
  breath: ["u_filmBreathEnabled", "u_breathAmount", "u_breathSeed"],
  damage: ["u_filmDamageEnabled", "u_damageAmount", "u_damageSeed", "u_damageTexture"],
  overscan: ["u_borderTexture", "u_overscanEnabled", "u_overscanAmount", "u_overscanRoundness"],
};

const createUniformView = (
  source: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> => {
  const view: Record<string, unknown> = {};
  for (const key of keys) {
    Object.defineProperty(view, key, {
      enumerable: true,
      configurable: false,
      get: () => source[key],
    });
  }
  return view;
};

const createFilmUniformViews = (
  source: Record<string, unknown>
): Record<FilmUniformViewName, Record<string, unknown>> => {
  const views = {} as Record<FilmUniformViewName, Record<string, unknown>>;
  for (const [name, keys] of Object.entries(FILM_UNIFORM_VIEW_KEYS) as [FilmUniformViewName, readonly string[]][]) {
    views[name] = createUniformView(source, keys);
  }
  return views;
};

export class PipelineRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly programs: RendererPrograms;
  private readonly texturePool: TexturePool;
  private readonly filterPipeline: FilterPipeline;
  private readonly lutCache = new LUTCache(12);
  private readonly rendererLabel: "preview" | "export";
  private readonly maxTextureSizeValue: number;
  private readonly intermediateFormat: "RGBA8" | "RGBA16F";
  private readonly detailKernelRadius: 1 | 2;
  private readonly sourceTextureCache = new Map<TexImageSource, SourceTextureRecord>();
  private sourceTextureLru: TexImageSource[] = [];
  private currentSourceTexture: WebGLTexture | null = null;
  private lutTexture: WebGLTexture | null = null;
  private currentLutKey: string | null = null;
  private customLutTexture: WebGLTexture | null = null;
  private currentCustomLutKey: string | null = null;
  private printLutTexture: WebGLTexture | null = null;
  private currentPrintLutKey: string | null = null;
  private curveLutTexture: WebGLTexture;
  private readonly curveLutPixels = createIdentityCurvePixels();
  private readonly curveLutPixelsHalf = new Uint16Array(CURVE_LUT_SIZE * 4);
  private readonly curveLutPixelsByte = new Uint8Array(CURVE_LUT_SIZE * 4);
  private readonly curveLutUsesFloat: boolean;
  private blueNoiseTexture: WebGLTexture;
  private damageTexture: WebGLTexture;
  private borderTexture: WebGLTexture;
  private fallback3DLutTexture: WebGLTexture;
  private destroyed = false;
  private contextLost = false;
  private onContextLost: (() => void) | null = null;
  private onContextRestored: (() => void) | null = null;
  private lastSourceWidth = 0;
  private lastSourceHeight = 0;
  private lastSourceRef: TexImageSource | null = null;
  private lastTargetWidth = 0;
  private lastTargetHeight = 0;
  private lastContextLostLogAt = 0;
  private lastContextRestoredLogAt = 0;
  private halationBlurPasses = 2;
  private glowBlurPasses = 2;

  private readonly geometryPassUniforms = {
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
  };

  private readonly masterPassUniforms = {
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
  };

  private readonly hslPassUniforms = {
    u_enabled: false,
    u_hue: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]),
    u_saturation: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]),
    u_luminance: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]),
    u_bwEnabled: false,
    u_bwMix: new Float32Array([0.2126, 0.7152, 0.0722]),
    u_calibrationEnabled: false,
    u_calibrationHue: new Float32Array([0, 0, 0]),
    u_calibrationSaturation: new Float32Array([0, 0, 0]),
  };

  private readonly curvePassUniforms: Record<string, unknown> = {
    u_enabled: false,
    u_curveLut: null as WebGLTexture | null,
  };

  private readonly detailPassUniforms = {
    u_enabled: false,
    u_texelSize: new Float32Array([1, 1]),
    u_texture: 0,
    u_clarity: 0,
    u_sharpening: 0,
    u_sharpenRadius: 40,
    u_sharpenDetail: 25,
    u_masking: 0,
    u_noiseReduction: 0,
    u_colorNoiseReduction: 0,
    u_nrKernelRadius: 2,
  };

  private readonly filmPassUniforms: Record<string, unknown> = {
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
    u_filmDamageEnabled: false,
    u_damageAmount: 0,
    u_damageSeed: 0,
    u_damageTexture: null as WebGLTexture | null,
    u_overscanEnabled: false,
    u_overscanAmount: 0,
    u_overscanRoundness: 0.5,
    u_borderTexture: null as WebGLTexture | null,
    u_aspectRatio: 1,
  };
  private readonly filmUniformViews = createFilmUniformViews(this.filmPassUniforms);

  private readonly thresholdPassUniforms = {
    u_halationThreshold: 0.9,
    u_bloomThreshold: 0.85,
  };

  private readonly glowThresholdPassUniforms = {
    u_glowEnabled: false,
    u_glowIntensity: 0,
    u_glowMidtoneFocus: 0.5,
    u_glowBias: 0.25,
  };

  private readonly blurHPassUniforms = {
    u_blurDirection: new Float32Array([0, 0]),
    u_blurRadius: 1,
  };

  private readonly blurVPassUniforms = {
    u_blurDirection: new Float32Array([0, 0]),
    u_blurRadius: 1,
  };

  private readonly glowBlurHPassUniforms = {
    u_blurDirection: new Float32Array([0, 0]),
    u_blurRadius: 1,
  };

  private readonly glowBlurVPassUniforms = {
    u_blurDirection: new Float32Array([0, 0]),
    u_blurRadius: 1,
  };

  private readonly compositePassUniforms = {
    u_halationEnabled: false,
    u_halationIntensity: 0,
    u_halationColor: new Float32Array([1.0, 0.3, 0.1]),
    u_halationHue: 16,
    u_halationSaturation: 0.75,
    u_halationBlueCompensation: 0.2,
    u_bloomEnabled: false,
    u_bloomIntensity: 0,
  };

  private readonly glowCompositePassUniforms = {
    u_glowEnabled: false,
    u_glowIntensity: 0,
    u_glowBias: 0.25,
  };

  private readonly downsamplePassUniforms = {
    u_texelSize: new Float32Array([1, 1]),
  };

  private readonly bilateralHalfPassUniforms = {
    u_texelSize: new Float32Array([1, 1]),
    u_sigmaRange: 0.045,
    u_strength: 0,
  };

  private readonly bilateralQuarterPassUniforms = {
    u_texelSize: new Float32Array([1, 1]),
    u_sigmaRange: 0.06,
    u_strength: 0,
  };

  private readonly reconstructPassUniforms = {
    u_halfScale: null as WebGLTexture | null,
    u_quarterScale: null as WebGLTexture | null,
    u_lumaStrength: 0,
    u_chromaStrength: 0,
  };

  private readonly outputEncodeUniforms = {
    u_inputLinear: true,
    u_enableDither: true,
    u_applyToneMap: false,
    u_outputSize: new Float32Array([1, 1]),
  };
  private readonly maskedBlendUniforms = {};
  private capturedLinearResult: LinearRenderResult | null = null;

  constructor(
    private readonly canvasElement: HTMLCanvasElement,
    width: number,
    height: number,
    options?: PipelineRendererOptions
  ) {
    this.rendererLabel = options?.label ?? "preview";
    this.detailKernelRadius = shouldUseReducedDetailKernel(this.rendererLabel) ? 1 : 2;

    const gl = canvasElement.getContext("webgl2", {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: options?.preserveDrawingBuffer ?? false,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
      depth: false,
      stencil: false,
    });
    if (!(gl instanceof WebGL2RenderingContext)) {
      throw new Error("WebGL2 is not available.");
    }
    this.gl = gl;
    this.programs = createPrograms(gl);
    this.maxTextureSizeValue = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const supportsFloatRenderTarget = !!gl.getExtension("EXT_color_buffer_float");
    const supportsFloatLinearFiltering = !!gl.getExtension("OES_texture_float_linear");
    const supportsHalfFloatLinearFiltering =
      !!gl.getExtension("OES_texture_half_float_linear") || supportsFloatLinearFiltering;
    const supportsFloatPipeline = supportsFloatRenderTarget && supportsFloatLinearFiltering;
    let curveLutUsesFloat = supportsHalfFloatLinearFiltering;
    this.intermediateFormat = supportsFloatPipeline ? "RGBA16F" : "RGBA8";
    this.texturePool = new TexturePool(
      gl,
      supportsFloatRenderTarget,
      supportsFloatLinearFiltering
    );
    this.filterPipeline = new FilterPipeline(gl, this.texturePool);

    this.canvasElement.width = Math.max(1, Math.round(width));
    this.canvasElement.height = Math.max(1, Math.round(height));
    this.lastTargetWidth = this.canvasElement.width;
    this.lastTargetHeight = this.canvasElement.height;
    gl.viewport(0, 0, this.lastTargetWidth, this.lastTargetHeight);

    while (gl.getError() !== gl.NO_ERROR) {
      // Clear stale GL errors so we can detect curve LUT upload fallback reliably.
    }
    this.curveLutTexture = twgl.createTexture(gl, {
      target: gl.TEXTURE_2D,
      src: curveLutUsesFloat
        ? encodeCurveLutToHalfFloats(this.curveLutPixels, this.curveLutPixelsHalf)
        : encodeCurveLutToBytes(this.curveLutPixels, this.curveLutPixelsByte),
      width: CURVE_LUT_SIZE,
      height: 1,
      internalFormat: curveLutUsesFloat ? gl.RGBA16F : gl.RGBA8,
      format: gl.RGBA,
      type: curveLutUsesFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
      min: gl.LINEAR,
      mag: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      auto: false,
    });
    if (curveLutUsesFloat && gl.getError() !== gl.NO_ERROR) {
      gl.deleteTexture(this.curveLutTexture);
      curveLutUsesFloat = false;
      this.curveLutTexture = twgl.createTexture(gl, {
        target: gl.TEXTURE_2D,
        src: encodeCurveLutToBytes(this.curveLutPixels, this.curveLutPixelsByte),
        width: CURVE_LUT_SIZE,
        height: 1,
        internalFormat: gl.RGBA8,
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        min: gl.LINEAR,
        mag: gl.LINEAR,
        wrapS: gl.CLAMP_TO_EDGE,
        wrapT: gl.CLAMP_TO_EDGE,
        auto: false,
      });
    }
    this.curveLutUsesFloat = curveLutUsesFloat;
    this.curvePassUniforms.u_curveLut = this.curveLutTexture;

    this.blueNoiseTexture = twgl.createTexture(gl, {
      target: gl.TEXTURE_2D,
      src: "/noise/blue-noise-64.png",
      min: gl.NEAREST,
      mag: gl.NEAREST,
      wrapS: gl.REPEAT,
      wrapT: gl.REPEAT,
      crossOrigin: "anonymous",
    });

    this.damageTexture = twgl.createTexture(gl, {
      target: gl.TEXTURE_2D,
      src: "/textures/damage/default.png",
      min: gl.LINEAR,
      mag: gl.LINEAR,
      wrapS: gl.REPEAT,
      wrapT: gl.REPEAT,
      crossOrigin: "anonymous",
    });

    this.borderTexture = twgl.createTexture(gl, {
      target: gl.TEXTURE_2D,
      src: "/textures/borders/default.png",
      min: gl.LINEAR,
      mag: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      crossOrigin: "anonymous",
    });

    this.fallback3DLutTexture = createIdentity3DLutTexture(gl);
    this.filmPassUniforms.u_lut = this.fallback3DLutTexture;
    this.filmPassUniforms.u_customLut = this.fallback3DLutTexture;
    this.filmPassUniforms.u_printLut = this.fallback3DLutTexture;
    this.filmPassUniforms.u_blueNoise = this.blueNoiseTexture;
    this.filmPassUniforms.u_damageTexture = this.damageTexture;
    this.filmPassUniforms.u_borderTexture = this.borderTexture;
    this.detailPassUniforms.u_nrKernelRadius = this.detailKernelRadius;

    this.attachContextListeners();
    this.scheduleDeferredProgramWarmup();
  }

  get isWebGL2(): boolean {
    return this.gl instanceof WebGL2RenderingContext;
  }

  get isContextLost(): boolean {
    return this.contextLost;
  }

  get maxTextureSize(): number {
    return this.maxTextureSizeValue;
  }

  get canvas(): HTMLCanvasElement {
    return this.canvasElement;
  }

  private clearCapturedLinearResult(): void {
    if (this.capturedLinearResult) {
      this.capturedLinearResult.release();
      this.capturedLinearResult = null;
    }
  }

  private setCapturedLinearResult(result: ReturnType<FilterPipeline["runToTexture"]>): void {
    this.clearCapturedLinearResult();
    this.capturedLinearResult = {
      texture: result.texture,
      width: result.width,
      height: result.height,
      format: result.format,
      release: result.release,
    };
  }

  consumeCapturedLinearResult(): LinearRenderResult | null {
    const captured = this.capturedLinearResult;
    this.capturedLinearResult = null;
    return captured;
  }

  borrowCapturedLinearResult(): LinearRenderResult | null {
    const captured = this.capturedLinearResult;
    if (!captured) {
      return null;
    }
    return {
      texture: captured.texture,
      width: captured.width,
      height: captured.height,
      format: captured.format,
      release: () => {},
    };
  }

  private drawLinearToCanvas(
    texture: WebGLTexture,
    width: number,
    height: number,
    format: "RGBA8" | "RGBA16F"
  ): void {
    this.outputEncodeUniforms.u_outputSize[0] = this.lastTargetWidth;
    this.outputEncodeUniforms.u_outputSize[1] = this.lastTargetHeight;
    this.outputEncodeUniforms.u_enableDither = true;
    this.filterPipeline.runToCanvas({
      baseWidth: this.lastTargetWidth,
      baseHeight: this.lastTargetHeight,
      passes: [
        {
          id: "output-encode",
          programInfo: this.programs.outputEncode,
          uniforms: this.outputEncodeUniforms,
          enabled: true,
        },
      ],
      input: {
        texture,
        width,
        height,
        format,
      },
      canvasOutput: {
        width: this.lastTargetWidth,
        height: this.lastTargetHeight,
      },
    });
  }

  presentLinearResult(result: LinearRenderResult): void {
    if (this.destroyed || this.contextLost) {
      return;
    }
    this.drawLinearToCanvas(result.texture, result.width, result.height, result.format);
  }

  blendLinearWithMask(
    base: LinearRenderResult,
    layer: LinearRenderResult,
    maskSource: TexImageSource
  ): LinearRenderResult {
    if (this.destroyed || this.contextLost) {
      return {
        texture: base.texture,
        width: base.width,
        height: base.height,
        format: base.format,
        release: () => {},
      };
    }
    const maskTexture = twgl.createTexture(this.gl, {
      target: this.gl.TEXTURE_2D,
      src: maskSource,
      min: this.gl.LINEAR,
      mag: this.gl.LINEAR,
      wrapS: this.gl.CLAMP_TO_EDGE,
      wrapT: this.gl.CLAMP_TO_EDGE,
      auto: false,
    });
    try {
      const blended = this.filterPipeline.runToTexture({
        baseWidth: this.lastTargetWidth,
        baseHeight: this.lastTargetHeight,
        passes: [
          {
            id: "masked-linear-blend",
            programInfo: this.programs.maskedBlend,
            uniforms: this.maskedBlendUniforms,
            extraTextures: {
              u_layer: layer.texture,
              u_mask: maskTexture,
            },
            outputFormat: this.intermediateFormat,
            enabled: true,
          },
        ],
        input: {
          texture: base.texture,
          width: base.width,
          height: base.height,
          format: base.format,
        },
      });
      return {
        texture: blended.texture,
        width: blended.width,
        height: blended.height,
        format: blended.format,
        release: blended.release,
      };
    } finally {
      this.gl.deleteTexture(maskTexture);
    }
  }

  async loadLUT(url: string, level: 8 | 16 = 8): Promise<void> {
    if (this.destroyed || this.contextLost) {
      return;
    }
    const lutFormat = this.intermediateFormat;
    const key = `${url}|${level}|${lutFormat}`;
    if (this.currentLutKey === key && this.lutTexture) {
      return;
    }
    const texture = await this.lutCache.get(this.gl, url, level, {
      textureFormat: lutFormat,
    });
    this.lutTexture = texture;
    this.currentLutKey = key;
  }

  async ensureLUT(lut: { url: string; level: 8 | 16 } | null): Promise<void> {
    if (!lut) {
      return;
    }
    await this.loadLUT(lut.url, lut.level);
  }

  async loadCustomLUT(url: string, level: 8 | 16 = 8): Promise<void> {
    if (this.destroyed || this.contextLost) {
      return;
    }
    const lutFormat = this.intermediateFormat;
    const key = `${url}|${level}|${lutFormat}`;
    if (this.currentCustomLutKey === key && this.customLutTexture) {
      return;
    }
    const texture = await this.lutCache.get(this.gl, url, level, {
      textureFormat: lutFormat,
    });
    this.customLutTexture = texture;
    this.currentCustomLutKey = key;
  }

  async ensureCustomLUT(lut: { url: string; level: 8 | 16 } | null): Promise<void> {
    if (!lut) {
      return;
    }
    await this.loadCustomLUT(lut.url, lut.level);
  }

  async loadPrintLUT(url: string, level: 8 | 16 = 8): Promise<void> {
    if (this.destroyed || this.contextLost) {
      return;
    }
    const lutFormat = this.intermediateFormat;
    const key = `${url}|${level}|${lutFormat}`;
    if (this.currentPrintLutKey === key && this.printLutTexture) {
      return;
    }
    const texture = await this.lutCache.get(this.gl, url, level, {
      textureFormat: lutFormat,
    });
    this.printLutTexture = texture;
    this.currentPrintLutKey = key;
  }

  async ensurePrintLUT(lut: { url: string; level: 8 | 16 } | null): Promise<void> {
    if (!lut) {
      return;
    }
    await this.loadPrintLUT(lut.url, lut.level);
  }

  updateSource(
    source: TexImageSource,
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number,
    targetHeight: number
  ): void {
    if (this.destroyed || this.contextLost) {
      return;
    }

    const sourceW = Math.max(1, Math.round(sourceWidth));
    const sourceH = Math.max(1, Math.round(sourceHeight));
    const targetW = Math.max(1, Math.round(targetWidth));
    const targetH = Math.max(1, Math.round(targetHeight));

    let record = this.sourceTextureCache.get(source);
    const needsRecreate = !record || record.width !== sourceW || record.height !== sourceH;
    if (needsRecreate) {
      if (record) {
        this.gl.deleteTexture(record.texture);
      }
      const texture = twgl.createTexture(this.gl, {
        target: this.gl.TEXTURE_2D,
        width: sourceW,
        height: sourceH,
        internalFormat: this.gl.RGBA8,
        format: this.gl.RGBA,
        type: this.gl.UNSIGNED_BYTE,
        min: this.gl.LINEAR,
        mag: this.gl.LINEAR,
        wrapS: this.gl.CLAMP_TO_EDGE,
        wrapT: this.gl.CLAMP_TO_EDGE,
        auto: false,
      });
      record = {
        texture,
        width: sourceW,
        height: sourceH,
        mutable: isMutableSource(source),
      };
      this.sourceTextureCache.set(source, record);
    }
    if (!record) {
      return;
    }

    const sourceRefChanged = source !== this.lastSourceRef;
    const sourceSizeChanged = sourceW !== this.lastSourceWidth || sourceH !== this.lastSourceHeight;
    if (sourceRefChanged || sourceSizeChanged || record.mutable) {
      this.uploadSourceTexture(record.texture, source);
    }

    this.sourceTextureLru = this.sourceTextureLru.filter((entry) => entry !== source);
    this.sourceTextureLru.push(source);
    let lruScanBudget = this.sourceTextureLru.length;
    while (this.sourceTextureLru.length > 8 && lruScanBudget > 0) {
      const oldestSource = this.sourceTextureLru.shift();
      if (!oldestSource) {
        continue;
      }
      if (oldestSource === source || oldestSource === this.lastSourceRef) {
        this.sourceTextureLru.push(oldestSource);
        lruScanBudget -= 1;
        continue;
      }
      const oldestRecord = this.sourceTextureCache.get(oldestSource);
      if (!oldestRecord) {
        lruScanBudget -= 1;
        continue;
      }
      this.gl.deleteTexture(oldestRecord.texture);
      this.sourceTextureCache.delete(oldestSource);
      lruScanBudget = this.sourceTextureLru.length;
    }

    if (targetW !== this.lastTargetWidth || targetH !== this.lastTargetHeight) {
      this.canvasElement.width = targetW;
      this.canvasElement.height = targetH;
      this.gl.viewport(0, 0, targetW, targetH);
      this.lastTargetWidth = targetW;
      this.lastTargetHeight = targetH;
    }

    this.currentSourceTexture = record.texture;
    this.lastSourceRef = source;
    this.lastSourceWidth = sourceW;
    this.lastSourceHeight = sourceH;
  }

  render(
    geometryUniforms: GeometryUniforms,
    masterUniforms: MasterUniforms,
    hslUniforms: HSLUniforms,
    curveUniforms: CurveUniforms,
    detailUniforms: DetailUniforms,
    filmUniforms: FilmUniforms | null,
    options?: PipelineRenderOptions,
    halationBloomUniforms?: HalationBloomUniforms | null
  ): PipelineRenderMetrics {
    if (
      this.destroyed ||
      this.contextLost ||
      !this.currentSourceTexture ||
      this.lastTargetWidth <= 0 ||
      this.lastTargetHeight <= 0
    ) {
      return NO_OP_METRICS;
    }

    const startedAt = performance.now();
    this.clearCapturedLinearResult();
    const passCpuMs: PassCpuMs = {
      geometry: 0,
      master: 0,
      hsl: 0,
      curve: 0,
      detail: 0,
      film: 0,
      optics: 0,
    };

    const useGeometry = !options?.skipGeometry;
    const useMaster = !options?.skipMaster;
    const useHsl = hslUniforms.enabled && !options?.skipHsl;
    const useCurve = curveUniforms.enabled && !options?.skipCurve;
    const useDetail = detailUniforms.enabled && !options?.skipDetail;
    const useFilm = !!filmUniforms && !options?.skipFilm;
    const useHalation = !!halationBloomUniforms && !options?.skipHalationBloom;

    let timer = performance.now();
    if (useGeometry) {
      this.updateGeometryPassUniforms(geometryUniforms);
      passCpuMs.geometry = performance.now() - timer;
    }

    timer = performance.now();
    if (useMaster) {
      this.updateMasterPassUniforms(masterUniforms);
      passCpuMs.master = performance.now() - timer;
    }

    timer = performance.now();
    if (useHsl) {
      this.updateHslPassUniforms(hslUniforms);
      passCpuMs.hsl = performance.now() - timer;
    }

    timer = performance.now();
    if (useCurve) {
      this.updateCurvePassUniforms(curveUniforms);
      passCpuMs.curve = performance.now() - timer;
    }

    timer = performance.now();
    if (useDetail) {
      this.updateDetailPassUniforms(detailUniforms);
      passCpuMs.detail = performance.now() - timer;
    }

    timer = performance.now();
    if (useFilm && filmUniforms) {
      this.updateFilmPassUniforms(filmUniforms);
      passCpuMs.film = performance.now() - timer;
    }

    timer = performance.now();
    if (useHalation && halationBloomUniforms) {
      this.updateHalationPassUniforms(halationBloomUniforms);
      passCpuMs.optics = performance.now() - timer;
    }

    const updateUniformsMs = performance.now() - startedAt;

    const filterChainStartedAt = performance.now();
    const mainPasses: PipelinePass[] = [];
    let filmStageCount = 0;
    if (!useGeometry) {
      mainPasses.push({
        id: "input-decode",
        programInfo: this.programs.inputDecode,
        uniforms: {},
        outputFormat: this.intermediateFormat,
        enabled: true,
      });
    }
    if (useGeometry) {
      mainPasses.push({
        id: "geometry",
        programInfo: this.programs.geometry,
        uniforms: this.geometryPassUniforms,
        outputFormat: this.intermediateFormat,
        enabled: true,
      });
    }
    if (useMaster) {
      mainPasses.push({
        id: "master",
        programInfo: this.programs.master,
        uniforms: this.masterPassUniforms,
        outputFormat: this.intermediateFormat,
        enabled: true,
      });
    }
    if (useHsl) {
      mainPasses.push({
        id: "hsl",
        programInfo: this.programs.hsl,
        uniforms: this.hslPassUniforms,
        outputFormat: this.intermediateFormat,
        enabled: true,
      });
    }
    if (useCurve) {
      mainPasses.push({
        id: "curve",
        programInfo: this.programs.curve,
        uniforms: this.curvePassUniforms,
        outputFormat: this.intermediateFormat,
        enabled: true,
      });
    }
    if (useDetail) {
      mainPasses.push({
        id: "detail",
        programInfo: this.programs.detail,
        uniforms: this.detailPassUniforms,
        outputFormat: this.intermediateFormat,
        enabled: true,
      });
    }
    const shouldRunMultiscaleDenoise =
      useDetail &&
      ((this.detailPassUniforms.u_noiseReduction as number) > 0.001 ||
        (this.detailPassUniforms.u_colorNoiseReduction as number) > 0.001);
    if (useFilm) {
      const expandEnabled = Boolean(this.filmPassUniforms.u_expandEnabled);
      const compressionEnabled = Boolean(this.filmPassUniforms.u_filmCompressionEnabled);
      const developerEnabled = Boolean(this.filmPassUniforms.u_filmDeveloperEnabled);
      const toneEnabled = Boolean(this.filmPassUniforms.u_toneEnabled);
      const colorMatrixEnabled = Boolean(this.filmPassUniforms.u_colorMatrixEnabled);
      const lutEnabled = Boolean(this.filmPassUniforms.u_lutEnabled);
      const customLutEnabled = Boolean(this.filmPassUniforms.u_customLutEnabled);
      const printEnabled = Boolean(this.filmPassUniforms.u_printEnabled);
      const cmyEnabled = Boolean(this.filmPassUniforms.u_cmyColorHeadEnabled);
      const colorCastEnabled = Boolean(this.filmPassUniforms.u_colorCastEnabled);
      const printToningEnabled = Boolean(this.filmPassUniforms.u_printToningEnabled);
      const grainEnabled = Boolean(this.filmPassUniforms.u_grainEnabled);
      const vignetteEnabled = Boolean(this.filmPassUniforms.u_vignetteEnabled);
      const breathEnabled = Boolean(this.filmPassUniforms.u_filmBreathEnabled);
      const damageEnabled = Boolean(this.filmPassUniforms.u_filmDamageEnabled);
      const overscanEnabled = Boolean(this.filmPassUniforms.u_overscanEnabled);
      const grainModel = Number(this.filmPassUniforms.u_grainModel ?? 0);

      if (expandEnabled) {
        mainPasses.push({
          id: "film-expand",
          programInfo: this.programs.filmExpand,
          uniforms: this.filmUniformViews.expand,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }

      if (compressionEnabled) {
        mainPasses.push({
          id: "film-compression",
          programInfo: this.programs.filmCompression,
          uniforms: this.filmUniformViews.compression,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }

      if (developerEnabled) {
        mainPasses.push({
          id: "film-developer",
          programInfo: this.programs.filmDeveloper,
          uniforms: this.filmUniformViews.developer,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }

      if (toneEnabled) {
        mainPasses.push({
          id: "film-tone-response",
          programInfo: this.programs.filmToneResponse,
          uniforms: this.filmUniformViews.toneResponse,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }

      if (colorMatrixEnabled) {
        mainPasses.push({
          id: "film-color-matrix",
          programInfo: this.programs.filmColorMatrix,
          uniforms: this.filmUniformViews.colorMatrix,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }

      if (lutEnabled) {
        mainPasses.push({
          id: "film-lut-3d",
          programInfo: this.programs.filmLut3D,
          uniforms: this.filmUniformViews.lut3D,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }

      if (customLutEnabled) {
        mainPasses.push({
          id: "film-custom-lut",
          programInfo: this.programs.customLut,
          uniforms: this.filmUniformViews.customLut,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }

      if (printEnabled) {
        mainPasses.push({
          id: "film-print",
          programInfo: this.programs.filmPrint,
          uniforms: this.filmUniformViews.print,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }

      if (cmyEnabled) {
        mainPasses.push({
          id: "film-cmy-head",
          programInfo: this.programs.filmCMYColorHead,
          uniforms: this.filmUniformViews.cmy,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }

      if (colorCastEnabled) {
        mainPasses.push({
          id: "film-color-cast",
          programInfo: this.programs.filmColorCast,
          uniforms: this.filmUniformViews.colorCast,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }

      if (printToningEnabled) {
        mainPasses.push({
          id: "film-print-toning",
          programInfo: this.programs.filmPrintToning,
          uniforms: this.filmUniformViews.printToning,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }

      if (grainEnabled) {
        mainPasses.push({
          id: "film-grain",
          programInfo: grainModel > 0.5 ? this.programs.proceduralGrain : this.programs.filmGrain,
          uniforms: grainModel > 0.5 ? this.filmUniformViews.proceduralGrain : this.filmUniformViews.filmGrain,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }

      if (vignetteEnabled) {
        mainPasses.push({
          id: "film-vignette",
          programInfo: this.programs.filmVignette,
          uniforms: this.filmUniformViews.vignette,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }

      if (breathEnabled) {
        mainPasses.push({
          id: "film-breath",
          programInfo: this.programs.filmBreath,
          uniforms: this.filmUniformViews.breath,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }

      if (damageEnabled) {
        mainPasses.push({
          id: "film-damage",
          programInfo: this.programs.filmDamage,
          uniforms: this.filmUniformViews.damage,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }

      if (overscanEnabled) {
        mainPasses.push({
          id: "film-overscan",
          programInfo: this.programs.overscan,
          uniforms: this.filmUniformViews.overscan,
          outputFormat: this.intermediateFormat,
          enabled: true,
        });
        filmStageCount += 1;
      }
    }
    if (mainPasses.length === 0) {
      mainPasses.push({
        id: "passthrough",
        programInfo: this.programs.passthrough,
        uniforms: {},
        enabled: true,
      });
    }
    this.outputEncodeUniforms.u_applyToneMap = filmStageCount === 0;
    let drawMs = 0;
    const renderOutputToCanvas = (
      texture: WebGLTexture,
      width: number,
      height: number,
      format: "RGBA8" | "RGBA16F"
    ) => {
      const drawStartedAt = performance.now();
      this.drawLinearToCanvas(texture, width, height, format);
      drawMs += performance.now() - drawStartedAt;
    };

    const baseResult = this.filterPipeline.runToTexture({
      baseWidth: this.lastTargetWidth,
      baseHeight: this.lastTargetHeight,
      passes: mainPasses,
      input: {
        texture: this.currentSourceTexture,
        width: this.lastTargetWidth,
        height: this.lastTargetHeight,
        format: "RGBA8",
      },
    });

    let finalResult = baseResult;

    try {
      if (shouldRunMultiscaleDenoise) {
        this.downsamplePassUniforms.u_texelSize[0] = 1 / Math.max(1, finalResult.width);
        this.downsamplePassUniforms.u_texelSize[1] = 1 / Math.max(1, finalResult.height);
        this.bilateralHalfPassUniforms.u_strength = Math.min(
          1,
          (this.detailPassUniforms.u_noiseReduction as number) * 0.01
        );
        this.bilateralQuarterPassUniforms.u_strength = Math.min(
          1,
          (this.detailPassUniforms.u_noiseReduction as number) * 0.013
        );
        this.reconstructPassUniforms.u_lumaStrength = Math.min(
          1,
          (this.detailPassUniforms.u_noiseReduction as number) * 0.01
        );
        this.reconstructPassUniforms.u_chromaStrength = Math.min(
          1,
          (this.detailPassUniforms.u_colorNoiseReduction as number) * 0.01
        );

        const halfDownsample = this.filterPipeline.runToTexture({
          baseWidth: this.lastTargetWidth,
          baseHeight: this.lastTargetHeight,
          passes: [
            {
              id: "denoise-downsample-half",
              programInfo: this.programs.downsample,
              uniforms: this.downsamplePassUniforms,
              outputFormat: this.intermediateFormat,
              resolution: 0.5,
              enabled: true,
            },
          ],
          input: {
            texture: finalResult.texture,
            width: finalResult.width,
            height: finalResult.height,
            format: finalResult.format,
          },
        });

        try {
          this.bilateralHalfPassUniforms.u_texelSize[0] = 1 / Math.max(1, halfDownsample.width);
          this.bilateralHalfPassUniforms.u_texelSize[1] = 1 / Math.max(1, halfDownsample.height);
          const halfBilateral = this.filterPipeline.runToTexture({
            baseWidth: halfDownsample.width,
            baseHeight: halfDownsample.height,
            passes: [
              {
                id: "denoise-bilateral-half",
                programInfo: this.programs.bilateralScale,
                uniforms: this.bilateralHalfPassUniforms,
                outputFormat: this.intermediateFormat,
                enabled: true,
              },
            ],
            input: {
              texture: halfDownsample.texture,
              width: halfDownsample.width,
              height: halfDownsample.height,
              format: halfDownsample.format,
            },
          });

          try {
            this.downsamplePassUniforms.u_texelSize[0] = 1 / Math.max(1, halfBilateral.width);
            this.downsamplePassUniforms.u_texelSize[1] = 1 / Math.max(1, halfBilateral.height);
            const quarterDownsample = this.filterPipeline.runToTexture({
              baseWidth: halfBilateral.width,
              baseHeight: halfBilateral.height,
              passes: [
                {
                  id: "denoise-downsample-quarter",
                  programInfo: this.programs.downsample,
                  uniforms: this.downsamplePassUniforms,
                  outputFormat: this.intermediateFormat,
                  resolution: 0.5,
                  enabled: true,
                },
              ],
              input: {
                texture: halfBilateral.texture,
                width: halfBilateral.width,
                height: halfBilateral.height,
                format: halfBilateral.format,
              },
            });

            try {
              this.bilateralQuarterPassUniforms.u_texelSize[0] =
                1 / Math.max(1, quarterDownsample.width);
              this.bilateralQuarterPassUniforms.u_texelSize[1] =
                1 / Math.max(1, quarterDownsample.height);
              const quarterBilateral = this.filterPipeline.runToTexture({
                baseWidth: quarterDownsample.width,
                baseHeight: quarterDownsample.height,
                passes: [
                  {
                    id: "denoise-bilateral-quarter",
                    programInfo: this.programs.bilateralScale,
                    uniforms: this.bilateralQuarterPassUniforms,
                    outputFormat: this.intermediateFormat,
                    enabled: true,
                  },
                ],
                input: {
                  texture: quarterDownsample.texture,
                  width: quarterDownsample.width,
                  height: quarterDownsample.height,
                  format: quarterDownsample.format,
                },
              });

              try {
                this.reconstructPassUniforms.u_halfScale = halfBilateral.texture;
                this.reconstructPassUniforms.u_quarterScale = quarterBilateral.texture;
                const reconstructed = this.filterPipeline.runToTexture({
                  baseWidth: this.lastTargetWidth,
                  baseHeight: this.lastTargetHeight,
                  passes: [
                    {
                      id: "denoise-reconstruct",
                      programInfo: this.programs.reconstruct,
                      uniforms: this.reconstructPassUniforms,
                      extraTextures: {
                        u_halfScale: halfBilateral.texture,
                        u_quarterScale: quarterBilateral.texture,
                      },
                      outputFormat: this.intermediateFormat,
                      enabled: true,
                    },
                  ],
                  input: {
                    texture: finalResult.texture,
                    width: finalResult.width,
                    height: finalResult.height,
                    format: finalResult.format,
                  },
                });
                finalResult = reconstructed;
              } finally {
                quarterBilateral.release();
              }
            } finally {
              quarterDownsample.release();
            }
          } finally {
            halfBilateral.release();
          }
        } finally {
          halfDownsample.release();
        }
      }

      const halationEnabled =
        useHalation &&
        (Boolean(this.compositePassUniforms.u_halationEnabled) ||
          Boolean(this.compositePassUniforms.u_bloomEnabled));
      const glowEnabled = useHalation && Boolean(this.glowCompositePassUniforms.u_glowEnabled);

      if (!halationEnabled && !glowEnabled) {
        renderOutputToCanvas(
          finalResult.texture,
          finalResult.width,
          finalResult.height,
          finalResult.format
        );
      } else {
        let halationResult: ReturnType<FilterPipeline["runToTexture"]> | null = null;
        let glowResult: ReturnType<FilterPipeline["runToTexture"]> | null = null;

        try {
          if (halationEnabled) {
            const maskPasses: PipelinePass[] = buildHalationMaskPasses({
              programs: this.programs,
              thresholdUniforms: this.thresholdPassUniforms,
              blurHUniforms: this.blurHPassUniforms,
              blurVUniforms: this.blurVPassUniforms,
              blurPasses: this.halationBlurPasses,
              outputFormat: this.intermediateFormat,
            });

            const maskResult = this.filterPipeline.runToTexture({
              baseWidth: this.lastTargetWidth,
              baseHeight: this.lastTargetHeight,
              passes: maskPasses,
              input: {
                texture: finalResult.texture,
                width: finalResult.width,
                height: finalResult.height,
                format: finalResult.format,
              },
            });

            try {
              halationResult = this.filterPipeline.runToTexture({
                baseWidth: this.lastTargetWidth,
                baseHeight: this.lastTargetHeight,
                passes: buildHalationCompositePasses({
                  programs: this.programs,
                  compositeUniforms: this.compositePassUniforms,
                  maskTexture: maskResult.texture,
                  outputFormat: this.intermediateFormat,
                }),
                input: {
                  texture: finalResult.texture,
                  width: finalResult.width,
                  height: finalResult.height,
                  format: finalResult.format,
                },
              });
            } finally {
              maskResult.release();
            }
          }

          if (glowEnabled) {
            const glowInput = halationResult ?? finalResult;
            const glowMaskPasses: PipelinePass[] = buildGlowMaskPasses({
              programs: this.programs,
              thresholdUniforms: this.glowThresholdPassUniforms,
              blurHUniforms: this.glowBlurHPassUniforms,
              blurVUniforms: this.glowBlurVPassUniforms,
              blurPasses: this.glowBlurPasses,
              outputFormat: this.intermediateFormat,
            });

            const glowMaskResult = this.filterPipeline.runToTexture({
              baseWidth: this.lastTargetWidth,
              baseHeight: this.lastTargetHeight,
              passes: glowMaskPasses,
              input: {
                texture: glowInput.texture,
                width: glowInput.width,
                height: glowInput.height,
                format: glowInput.format,
              },
            });

            try {
              glowResult = this.filterPipeline.runToTexture({
                baseWidth: this.lastTargetWidth,
                baseHeight: this.lastTargetHeight,
                passes: buildGlowCompositePasses({
                  programs: this.programs,
                  compositeUniforms: this.glowCompositePassUniforms,
                  maskTexture: glowMaskResult.texture,
                  outputFormat: this.intermediateFormat,
                }),
                input: {
                  texture: glowInput.texture,
                  width: glowInput.width,
                  height: glowInput.height,
                  format: glowInput.format,
                },
              });
            } finally {
              glowMaskResult.release();
            }
          }

          const outputResult = glowResult ?? halationResult ?? finalResult;
          if (options?.captureLinearOutput) {
            const captured = this.filterPipeline.runToTexture({
              baseWidth: this.lastTargetWidth,
              baseHeight: this.lastTargetHeight,
              passes: [
                {
                  id: "capture-linear-output",
                  programInfo: this.programs.passthrough,
                  uniforms: {},
                  outputFormat: this.intermediateFormat,
                  enabled: true,
                },
              ],
              input: {
                texture: outputResult.texture,
                width: outputResult.width,
                height: outputResult.height,
                format: outputResult.format,
              },
            });
            this.setCapturedLinearResult(captured);
          }
          renderOutputToCanvas(
            outputResult.texture,
            outputResult.width,
            outputResult.height,
            outputResult.format
          );
        } finally {
          if (glowResult) {
            glowResult.release();
          }
          if (halationResult) {
            halationResult.release();
          }
        }
      }
    } finally {
      if (finalResult !== baseResult) {
        finalResult.release();
      }
      baseResult.release();
    }

    const filterChainMs = Math.max(0, performance.now() - filterChainStartedAt - drawMs);

    const activePasses: string[] = [];
    if (useGeometry) activePasses.push("geometry");
    if (useMaster) activePasses.push("master");
    if (useHsl) activePasses.push("hsl");
    if (useCurve) activePasses.push("curve");
    if (useDetail) activePasses.push("detail");
    if (filmStageCount > 0) activePasses.push("film");
    const opticsActive =
      useHalation &&
      (Boolean(this.compositePassUniforms.u_halationEnabled) ||
        Boolean(this.compositePassUniforms.u_bloomEnabled) ||
        Boolean(this.glowCompositePassUniforms.u_glowEnabled));
    if (opticsActive) activePasses.push("optics");

    return {
      totalMs: performance.now() - startedAt,
      updateUniformsMs,
      filterChainMs,
      drawMs,
      passCpuMs,
      activePasses,
    };
  }

  /**
   * Read back the current default framebuffer as raw RGBA8 pixels.
   * Returned rows are in WebGL readback order (bottom-up).
   * Alpha is straight/unpremultiplied (renderer uses `premultipliedAlpha: false`).
   */
  extractPixels(): Uint8Array {
    if (this.destroyed || this.contextLost) {
      return new Uint8Array(0);
    }
    const width = Math.max(0, this.canvasElement.width);
    const height = Math.max(0, this.canvasElement.height);
    if (width === 0 || height === 0) {
      return new Uint8Array(0);
    }
    const pixels = new Uint8Array(width * height * 4);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.readPixels(0, 0, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
    return pixels;
  }

  /**
   * Async GPU fence-based readback of the default framebuffer.
   * Returned rows are in WebGL readback order (bottom-up).
   * Alpha is straight/unpremultiplied (renderer uses `premultipliedAlpha: false`).
   */
  async extractPixelsAsync(): Promise<Uint8Array> {
    if (this.destroyed || this.contextLost) {
      return new Uint8Array(0);
    }
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    return readPixelsAsync(this.gl, this.canvasElement.width, this.canvasElement.height);
  }

  extractCanvas(): HTMLCanvasElement {
    if (this.destroyed || this.contextLost) {
      return document.createElement("canvas");
    }
    const output = document.createElement("canvas");
    output.width = this.canvasElement.width;
    output.height = this.canvasElement.height;
    const context = output.getContext("2d");
    if (!context) {
      return output;
    }
    context.drawImage(this.canvasElement, 0, 0);
    return output;
  }

  dispose(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.clearCapturedLinearResult();

    if (this.onContextLost) {
      this.onContextLost();
      this.onContextLost = null;
    }
    if (this.onContextRestored) {
      this.onContextRestored();
      this.onContextRestored = null;
    }

    this.texturePool.dispose();
    this.lutCache.dispose(this.gl);

    for (const record of this.sourceTextureCache.values()) {
      this.gl.deleteTexture(record.texture);
    }
    this.sourceTextureCache.clear();
    this.sourceTextureLru = [];
    this.currentSourceTexture = null;

    this.gl.deleteTexture(this.curveLutTexture);
    this.gl.deleteTexture(this.blueNoiseTexture);
    this.gl.deleteTexture(this.damageTexture);
    this.gl.deleteTexture(this.borderTexture);
    this.gl.deleteTexture(this.fallback3DLutTexture);
    this.curveLutTexture = null as unknown as WebGLTexture;
    this.blueNoiseTexture = null as unknown as WebGLTexture;
    this.damageTexture = null as unknown as WebGLTexture;
    this.borderTexture = null as unknown as WebGLTexture;
    this.fallback3DLutTexture = null as unknown as WebGLTexture;

    this.lutTexture = null;
    this.currentLutKey = null;
    this.customLutTexture = null;
    this.currentCustomLutKey = null;
    this.printLutTexture = null;
    this.currentPrintLutKey = null;
  }

  private attachContextListeners(): void {
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      this.contextLost = true;
      const now = Date.now();
      if (now - this.lastContextLostLogAt > 2000) {
        console.warn(`WebGL context lost in PipelineRenderer (${this.rendererLabel})`);
        this.lastContextLostLogAt = now;
      }
    };
    const handleContextRestored = () => {
      this.contextLost = true;
      const now = Date.now();
      if (now - this.lastContextRestoredLogAt > 2000) {
        console.info(
          `WebGL context restored in PipelineRenderer (${this.rendererLabel}), recycling renderer.`
        );
        this.lastContextRestoredLogAt = now;
      }
    };

    this.canvasElement.addEventListener("webglcontextlost", handleContextLost);
    this.canvasElement.addEventListener("webglcontextrestored", handleContextRestored);
    this.onContextLost = () =>
      this.canvasElement.removeEventListener("webglcontextlost", handleContextLost);
    this.onContextRestored = () =>
      this.canvasElement.removeEventListener("webglcontextrestored", handleContextRestored);
  }

  private scheduleDeferredProgramWarmup(): void {
    if (typeof window === "undefined") {
      return;
    }
    const winWithIdle = window as Window & {
      requestIdleCallback?: (callback: () => void, opts?: { timeout: number }) => number;
    };
    const warmup = () => {
      if (this.destroyed || this.contextLost) {
        return;
      }
      for (const name of DEFERRED_WARMUP_PROGRAMS) {
        try {
          void this.programs[name];
        } catch {
          // Ignore warmup compile errors; normal pass execution will surface actionable errors.
        }
      }
    };
    if (typeof winWithIdle.requestIdleCallback === "function") {
      winWithIdle.requestIdleCallback(warmup, { timeout: 1200 });
      return;
    }
    window.setTimeout(warmup, 80);
  }

  private uploadSourceTexture(texture: WebGLTexture, source: TexImageSource): void {
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, 1);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      source
    );
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, 0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  private updateGeometryPassUniforms(u: GeometryUniforms): void {
    this.geometryPassUniforms.u_enabled = u.enabled;
    this.geometryPassUniforms.u_cropRect[0] = u.cropRect[0];
    this.geometryPassUniforms.u_cropRect[1] = u.cropRect[1];
    this.geometryPassUniforms.u_cropRect[2] = u.cropRect[2];
    this.geometryPassUniforms.u_cropRect[3] = u.cropRect[3];
    this.geometryPassUniforms.u_sourceSize[0] = u.sourceSize[0];
    this.geometryPassUniforms.u_sourceSize[1] = u.sourceSize[1];
    this.geometryPassUniforms.u_outputSize[0] = u.outputSize[0];
    this.geometryPassUniforms.u_outputSize[1] = u.outputSize[1];
    this.geometryPassUniforms.u_translatePx[0] = u.translatePx[0];
    this.geometryPassUniforms.u_translatePx[1] = u.translatePx[1];
    this.geometryPassUniforms.u_rotate = u.rotate;
    this.geometryPassUniforms.u_perspectiveEnabled = u.perspectiveEnabled;
    for (let i = 0; i < 9; i += 1) {
      this.geometryPassUniforms.u_homography[i] = u.homography[i] ?? (i % 4 === 0 ? 1 : 0);
    }
    this.geometryPassUniforms.u_scale = u.scale;
    this.geometryPassUniforms.u_flip[0] = u.flip[0];
    this.geometryPassUniforms.u_flip[1] = u.flip[1];
    this.geometryPassUniforms.u_lensEnabled = u.lensEnabled;
    this.geometryPassUniforms.u_lensK1 = u.lensK1;
    this.geometryPassUniforms.u_lensK2 = u.lensK2;
    this.geometryPassUniforms.u_lensVignetteBoost = u.lensVignetteBoost;
    this.geometryPassUniforms.u_caEnabled = u.caEnabled;
    this.geometryPassUniforms.u_caAmountPxRgb[0] = u.caAmountPxRgb[0];
    this.geometryPassUniforms.u_caAmountPxRgb[1] = u.caAmountPxRgb[1];
    this.geometryPassUniforms.u_caAmountPxRgb[2] = u.caAmountPxRgb[2];
  }

  private updateMasterPassUniforms(u: MasterUniforms): void {
    this.masterPassUniforms.u_exposure = u.exposure;
    this.masterPassUniforms.u_contrast = u.contrast;
    this.masterPassUniforms.u_whiteBalanceLmsScale[0] = u.whiteBalanceLmsScale[0];
    this.masterPassUniforms.u_whiteBalanceLmsScale[1] = u.whiteBalanceLmsScale[1];
    this.masterPassUniforms.u_whiteBalanceLmsScale[2] = u.whiteBalanceLmsScale[2];
    this.masterPassUniforms.u_tonalRange[0] = u.highlights;
    this.masterPassUniforms.u_tonalRange[1] = u.shadows;
    this.masterPassUniforms.u_tonalRange[2] = u.whites;
    this.masterPassUniforms.u_tonalRange[3] = u.blacks;
    this.masterPassUniforms.u_curve[0] = u.curveHighlights;
    this.masterPassUniforms.u_curve[1] = u.curveLights;
    this.masterPassUniforms.u_curve[2] = u.curveDarks;
    this.masterPassUniforms.u_curve[3] = u.curveShadows;
    this.masterPassUniforms.u_hueShift = u.hueShift;
    this.masterPassUniforms.u_saturation = u.saturation;
    this.masterPassUniforms.u_vibrance = u.vibrance;
    this.masterPassUniforms.u_luminance = u.luminance;
    this.masterPassUniforms.u_colorGradeShadows[0] = u.colorGradeShadows[0];
    this.masterPassUniforms.u_colorGradeShadows[1] = u.colorGradeShadows[1];
    this.masterPassUniforms.u_colorGradeShadows[2] = u.colorGradeShadows[2];
    this.masterPassUniforms.u_colorGradeMidtones[0] = u.colorGradeMidtones[0];
    this.masterPassUniforms.u_colorGradeMidtones[1] = u.colorGradeMidtones[1];
    this.masterPassUniforms.u_colorGradeMidtones[2] = u.colorGradeMidtones[2];
    this.masterPassUniforms.u_colorGradeHighlights[0] = u.colorGradeHighlights[0];
    this.masterPassUniforms.u_colorGradeHighlights[1] = u.colorGradeHighlights[1];
    this.masterPassUniforms.u_colorGradeHighlights[2] = u.colorGradeHighlights[2];
    this.masterPassUniforms.u_colorGradeBlend = u.colorGradeBlend;
    this.masterPassUniforms.u_colorGradeBalance = u.colorGradeBalance;
    this.masterPassUniforms.u_dehaze = u.dehaze;
  }

  private updateHslPassUniforms(u: HSLUniforms): void {
    this.hslPassUniforms.u_enabled = u.enabled;
    for (let i = 0; i < 8; i += 1) {
      this.hslPassUniforms.u_hue[i] = u.hue[i];
      this.hslPassUniforms.u_saturation[i] = u.saturation[i];
      this.hslPassUniforms.u_luminance[i] = u.luminance[i];
    }
    this.hslPassUniforms.u_bwEnabled = u.bwEnabled;
    this.hslPassUniforms.u_bwMix[0] = u.bwMix[0];
    this.hslPassUniforms.u_bwMix[1] = u.bwMix[1];
    this.hslPassUniforms.u_bwMix[2] = u.bwMix[2];
    this.hslPassUniforms.u_calibrationEnabled = u.calibrationEnabled;
    this.hslPassUniforms.u_calibrationHue[0] = u.calibrationHue[0];
    this.hslPassUniforms.u_calibrationHue[1] = u.calibrationHue[1];
    this.hslPassUniforms.u_calibrationHue[2] = u.calibrationHue[2];
    this.hslPassUniforms.u_calibrationSaturation[0] = u.calibrationSaturation[0];
    this.hslPassUniforms.u_calibrationSaturation[1] = u.calibrationSaturation[1];
    this.hslPassUniforms.u_calibrationSaturation[2] = u.calibrationSaturation[2];
  }

  private updateCurvePassUniforms(u: CurveUniforms): void {
    this.curvePassUniforms.u_enabled = u.enabled;
    buildCurveLutPixels(u, this.curveLutPixels);
    const curvePixels = this.curveLutUsesFloat
      ? encodeCurveLutToHalfFloats(this.curveLutPixels, this.curveLutPixelsHalf)
      : encodeCurveLutToBytes(this.curveLutPixels, this.curveLutPixelsByte);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.curveLutTexture);
    this.gl.texSubImage2D(
      this.gl.TEXTURE_2D,
      0,
      0,
      0,
      CURVE_LUT_SIZE,
      1,
      this.gl.RGBA,
      this.curveLutUsesFloat ? this.gl.HALF_FLOAT : this.gl.UNSIGNED_BYTE,
      curvePixels
    );
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  private updateDetailPassUniforms(u: DetailUniforms): void {
    this.detailPassUniforms.u_enabled = u.enabled;
    this.detailPassUniforms.u_texelSize[0] = 1 / Math.max(1, this.lastTargetWidth);
    this.detailPassUniforms.u_texelSize[1] = 1 / Math.max(1, this.lastTargetHeight);
    this.detailPassUniforms.u_texture = u.texture;
    this.detailPassUniforms.u_clarity = u.clarity;
    this.detailPassUniforms.u_sharpening = u.sharpening;
    this.detailPassUniforms.u_sharpenRadius = u.sharpenRadius;
    this.detailPassUniforms.u_sharpenDetail = u.sharpenDetail;
    this.detailPassUniforms.u_masking = u.masking;
    this.detailPassUniforms.u_noiseReduction = u.noiseReduction;
    this.detailPassUniforms.u_colorNoiseReduction = u.colorNoiseReduction;
    this.detailPassUniforms.u_nrKernelRadius = this.detailKernelRadius;
  }

  private updateFilmPassUniforms(u: FilmUniforms): void {
    this.filmPassUniforms.u_expandEnabled = u.u_expandEnabled;
    this.filmPassUniforms.u_expandBlackPoint = u.u_expandBlackPoint;
    this.filmPassUniforms.u_expandWhitePoint = u.u_expandWhitePoint;
    this.filmPassUniforms.u_filmCompressionEnabled = u.u_filmCompressionEnabled;
    this.filmPassUniforms.u_highlightRolloff = u.u_highlightRolloff;
    this.filmPassUniforms.u_shoulderWidth = u.u_shoulderWidth;
    this.filmPassUniforms.u_filmDeveloperEnabled = u.u_filmDeveloperEnabled;
    this.filmPassUniforms.u_developerContrast = u.u_developerContrast;
    this.filmPassUniforms.u_developerGamma = u.u_developerGamma;
    const separation = this.filmPassUniforms.u_colorSeparation as Float32Array;
    separation[0] = u.u_colorSeparation[0];
    separation[1] = u.u_colorSeparation[1];
    separation[2] = u.u_colorSeparation[2];

    this.filmPassUniforms.u_toneEnabled = u.u_toneEnabled;
    this.filmPassUniforms.u_shoulder = u.u_shoulder;
    this.filmPassUniforms.u_toe = u.u_toe;
    this.filmPassUniforms.u_gamma = u.u_gamma;
    this.filmPassUniforms.u_colorMatrixEnabled = u.u_colorMatrixEnabled;

    const colorMatrix = this.filmPassUniforms.u_colorMatrix as Float32Array;
    for (let i = 0; i < 9; i += 1) {
      colorMatrix[i] = u.u_colorMatrix[i] ?? (i % 4 === 0 ? 1 : 0);
    }

    this.filmPassUniforms.u_lutEnabled = u.u_lutEnabled && !!this.lutTexture;
    this.filmPassUniforms.u_lutIntensity = u.u_lutIntensity;
    this.filmPassUniforms.u_lut = this.lutTexture ?? this.fallback3DLutTexture;
    this.filmPassUniforms.u_customLutEnabled = u.u_customLutEnabled && !!this.customLutTexture;
    this.filmPassUniforms.u_customLutIntensity = u.u_customLutIntensity;
    this.filmPassUniforms.u_customLut = this.customLutTexture ?? this.fallback3DLutTexture;
    this.filmPassUniforms.u_printEnabled = u.u_printEnabled;
    this.filmPassUniforms.u_printDensity = u.u_printDensity;
    this.filmPassUniforms.u_printContrast = u.u_printContrast;
    this.filmPassUniforms.u_printWarmth = u.u_printWarmth;
    this.filmPassUniforms.u_printStock = u.u_printStock;
    this.filmPassUniforms.u_printLutEnabled = u.u_printLutEnabled && !!this.printLutTexture;
    this.filmPassUniforms.u_printLutIntensity = u.u_printLutIntensity;
    this.filmPassUniforms.u_printLut = this.printLutTexture ?? this.fallback3DLutTexture;
    this.filmPassUniforms.u_cmyColorHeadEnabled = u.u_cmyColorHeadEnabled;
    this.filmPassUniforms.u_cyan = u.u_cyan;
    this.filmPassUniforms.u_magenta = u.u_magenta;
    this.filmPassUniforms.u_yellow = u.u_yellow;

    this.filmPassUniforms.u_colorCastEnabled = u.u_colorCastEnabled;
    const castShadows = this.filmPassUniforms.u_colorCastShadows as Float32Array;
    const castMidtones = this.filmPassUniforms.u_colorCastMidtones as Float32Array;
    const castHighlights = this.filmPassUniforms.u_colorCastHighlights as Float32Array;
    castShadows[0] = u.u_colorCastShadows[0];
    castShadows[1] = u.u_colorCastShadows[1];
    castShadows[2] = u.u_colorCastShadows[2];
    castMidtones[0] = u.u_colorCastMidtones[0];
    castMidtones[1] = u.u_colorCastMidtones[1];
    castMidtones[2] = u.u_colorCastMidtones[2];
    castHighlights[0] = u.u_colorCastHighlights[0];
    castHighlights[1] = u.u_colorCastHighlights[1];
    castHighlights[2] = u.u_colorCastHighlights[2];
    this.filmPassUniforms.u_printToningEnabled = u.u_printToningEnabled;
    const toningShadows = this.filmPassUniforms.u_toningShadows as Float32Array;
    const toningMidtones = this.filmPassUniforms.u_toningMidtones as Float32Array;
    const toningHighlights = this.filmPassUniforms.u_toningHighlights as Float32Array;
    toningShadows[0] = u.u_toningShadows[0];
    toningShadows[1] = u.u_toningShadows[1];
    toningShadows[2] = u.u_toningShadows[2];
    toningMidtones[0] = u.u_toningMidtones[0];
    toningMidtones[1] = u.u_toningMidtones[1];
    toningMidtones[2] = u.u_toningMidtones[2];
    toningHighlights[0] = u.u_toningHighlights[0];
    toningHighlights[1] = u.u_toningHighlights[1];
    toningHighlights[2] = u.u_toningHighlights[2];
    this.filmPassUniforms.u_toningStrength = u.u_toningStrength;

    this.filmPassUniforms.u_grainEnabled = u.u_grainEnabled;
    this.filmPassUniforms.u_grainModel = u.u_grainModel;
    this.filmPassUniforms.u_grainAmount = u.u_grainAmount;
    this.filmPassUniforms.u_grainSize = u.u_grainSize;
    this.filmPassUniforms.u_grainRoughness = u.u_grainRoughness;
    this.filmPassUniforms.u_grainShadowBias = u.u_grainShadowBias;
    this.filmPassUniforms.u_grainSeed = u.u_grainSeed;
    this.filmPassUniforms.u_grainIsColor = u.u_grainIsColor;
    this.filmPassUniforms.u_crystalDensity = u.u_crystalDensity;
    this.filmPassUniforms.u_crystalSizeMean = u.u_crystalSizeMean;
    this.filmPassUniforms.u_crystalSizeVariance = u.u_crystalSizeVariance;
    const grainSeparation = this.filmPassUniforms.u_grainColorSeparation as Float32Array;
    grainSeparation[0] = u.u_grainColorSeparation[0];
    grainSeparation[1] = u.u_grainColorSeparation[1];
    grainSeparation[2] = u.u_grainColorSeparation[2];
    this.filmPassUniforms.u_scannerMTF = u.u_scannerMTF;
    this.filmPassUniforms.u_filmFormat = u.u_filmFormat;
    this.filmPassUniforms.u_blueNoise = this.blueNoiseTexture;

    const textureSize = this.filmPassUniforms.u_textureSize as Float32Array;
    textureSize[0] = this.lastTargetWidth;
    textureSize[1] = this.lastTargetHeight;

    this.filmPassUniforms.u_vignetteEnabled = u.u_vignetteEnabled;
    this.filmPassUniforms.u_vignetteAmount = u.u_vignetteAmount;
    this.filmPassUniforms.u_vignetteMidpoint = u.u_vignetteMidpoint;
    this.filmPassUniforms.u_vignetteRoundness = u.u_vignetteRoundness;
    this.filmPassUniforms.u_filmBreathEnabled = u.u_filmBreathEnabled;
    this.filmPassUniforms.u_breathAmount = u.u_breathAmount;
    this.filmPassUniforms.u_breathSeed = u.u_breathSeed;
    this.filmPassUniforms.u_filmDamageEnabled = u.u_filmDamageEnabled;
    this.filmPassUniforms.u_damageAmount = u.u_damageAmount;
    this.filmPassUniforms.u_damageSeed = u.u_damageSeed;
    this.filmPassUniforms.u_damageTexture = this.damageTexture;
    this.filmPassUniforms.u_overscanEnabled = u.u_overscanEnabled;
    this.filmPassUniforms.u_overscanAmount = u.u_overscanAmount;
    this.filmPassUniforms.u_overscanRoundness = u.u_overscanRoundness;
    this.filmPassUniforms.u_borderTexture = this.borderTexture;
    this.filmPassUniforms.u_aspectRatio = this.lastTargetWidth / Math.max(1, this.lastTargetHeight);
  }

  private updateHalationPassUniforms(u: HalationBloomUniforms): void {
    this.thresholdPassUniforms.u_halationThreshold = u.halationThreshold;
    this.thresholdPassUniforms.u_bloomThreshold = u.bloomThreshold;

    const halRadius = u.halationRadius ?? Math.max(1, u.halationIntensity * 8);
    const bloomRadius = u.bloomRadius ?? Math.max(1, u.bloomIntensity * 10);
    const avgRadius = Math.max(halRadius, bloomRadius);
    this.blurHPassUniforms.u_blurRadius = avgRadius;
    this.blurVPassUniforms.u_blurRadius = avgRadius;
    this.halationBlurPasses = avgRadius > 4 ? 3 : 2;

    const blurWidth = Math.max(1, Math.round(this.lastTargetWidth * 0.5));
    const blurHeight = Math.max(1, Math.round(this.lastTargetHeight * 0.5));
    this.blurHPassUniforms.u_blurDirection[0] = 1 / blurWidth;
    this.blurHPassUniforms.u_blurDirection[1] = 0;
    this.blurVPassUniforms.u_blurDirection[0] = 0;
    this.blurVPassUniforms.u_blurDirection[1] = 1 / blurHeight;

    this.compositePassUniforms.u_halationEnabled = u.halationEnabled && u.halationIntensity > 0.001;
    this.compositePassUniforms.u_halationIntensity = u.halationIntensity;
    if (u.halationColor) {
      this.compositePassUniforms.u_halationColor[0] = u.halationColor[0];
      this.compositePassUniforms.u_halationColor[1] = u.halationColor[1];
      this.compositePassUniforms.u_halationColor[2] = u.halationColor[2];
    }
    this.compositePassUniforms.u_halationHue = u.halationHue ?? 16;
    this.compositePassUniforms.u_halationSaturation = u.halationSaturation ?? 0.75;
    this.compositePassUniforms.u_halationBlueCompensation =
      u.halationBlueCompensation ?? 0.2;
    this.compositePassUniforms.u_bloomEnabled = u.bloomEnabled && u.bloomIntensity > 0.001;
    this.compositePassUniforms.u_bloomIntensity = u.bloomIntensity;

    this.glowThresholdPassUniforms.u_glowEnabled = u.glowEnabled && u.glowIntensity > 0.001;
    this.glowThresholdPassUniforms.u_glowIntensity = u.glowIntensity;
    this.glowThresholdPassUniforms.u_glowMidtoneFocus = u.glowMidtoneFocus;
    this.glowThresholdPassUniforms.u_glowBias = u.glowBias;

    const glowRadius = u.glowRadius ?? Math.max(1, u.glowIntensity * 6);
    this.glowBlurHPassUniforms.u_blurRadius = glowRadius;
    this.glowBlurVPassUniforms.u_blurRadius = glowRadius;
    this.glowBlurPasses = glowRadius > 4 ? 3 : 2;
    this.glowBlurHPassUniforms.u_blurDirection[0] = 1 / blurWidth;
    this.glowBlurHPassUniforms.u_blurDirection[1] = 0;
    this.glowBlurVPassUniforms.u_blurDirection[0] = 0;
    this.glowBlurVPassUniforms.u_blurDirection[1] = 1 / blurHeight;

    this.glowCompositePassUniforms.u_glowEnabled = u.glowEnabled && u.glowIntensity > 0.001;
    this.glowCompositePassUniforms.u_glowIntensity = u.glowIntensity;
    this.glowCompositePassUniforms.u_glowBias = u.glowBias;
  }
}
