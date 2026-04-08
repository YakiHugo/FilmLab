import * as twgl from "twgl.js";
import { LUTCache } from "./LUTCache";
import { buildMainPasses } from "./PassBuilder";
import {
  DEFERRED_WARMUP_PROGRAMS,
  createPrograms,
  type RendererPrograms,
} from "./ProgramRegistry";
import {
  applyDetailPassUniforms,
  applyFilmPassUniforms,
  applyGeometryPassUniforms,
  applyHalationPassUniforms,
  applyHslPassUniforms,
  applyMasterPassUniforms,
} from "./PassUniformUpdaters";
import { FilterPipeline } from "./gpu/FilterPipeline";
import {
  ensureSourceTextureRecord,
  pruneSourceTextureCache,
  resolveLutCacheKey,
  touchSourceTextureLru,
  uploadSourceTexture,
  type SourceTextureRecord,
} from "./TextureManager";
import { TexturePool } from "./gpu/TexturePool";
import { readPixelsAsync } from "./gpu/TiledRenderer";
import { CURVE_LUT_SIZE, buildCurveLutPixels, createIdentityCurvePixels } from "./gpu/CurveLut";
import { encodeCurveLutToBytes, encodeCurveLutToHalfFloats } from "./CurveLutEncoding";
import { runPostProcessing } from "./RenderPostProcessing";
import { generateMaskTexture as generateLayerMaskTexture } from "@/lib/layerMaskTexture";
import { clamp } from "@/lib/math";
import type { TimestampOverlayGpuInput } from "@/lib/timestampOverlay";
import {
  clampFilter2dValue,
  hasFilter2dPostProcessing,
  resolveBlurRadiusPx,
  resolveDilateRadiusPx,
  type Filter2dPostProcessingParams,
} from "@/lib/filter2dShared";
import {
  hasLocalMaskRangeConstraints,
  resolveLocalMaskColorRange,
  resolveLocalMaskLumaRange,
} from "@/lib/localMaskShared";
import type { EditorLayerBlendMode, EditorLayerMask } from "@/types";
import type { LocalAdjustmentMask } from "@/types";
import type {
  CurveUniforms,
  DetailUniforms,
  FilmUniforms,
  GeometryUniforms,
  HSLUniforms,
  HalationBloomUniforms,
  MasterUniforms,
} from "./types";

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

const GPU_BRUSH_MASK_MAX_POINTS = 512;

interface TexturePresentOptions {
  inputLinear?: boolean;
  applyToneMap?: boolean;
  enableDither?: boolean;
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

interface UniformUpdateOptions {
  useGeometry: boolean;
  useMaster: boolean;
  useHsl: boolean;
  useCurve: boolean;
  useDetail: boolean;
  useFilm: boolean;
  useHalation: boolean;
  geometryUniforms: GeometryUniforms;
  masterUniforms: MasterUniforms;
  hslUniforms: HSLUniforms;
  curveUniforms: CurveUniforms;
  detailUniforms: DetailUniforms;
  filmUniforms: FilmUniforms | null;
  halationBloomUniforms: HalationBloomUniforms | null | undefined;
}

interface LayerBlendOptions {
  opacity?: number;
  blendMode?: EditorLayerBlendMode;
  maskSource?: TexImageSource | null;
  invertMask?: boolean;
}

interface AsciiTextmodeSurfaceInput {
  cacheKey: string;
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  renderMode: "glyph" | "dot";
  backgroundFillRgba: Uint8ClampedArray | null;
  backgroundSourceCanvas: HTMLCanvasElement | null;
  backgroundBlurPx: number;
  foregroundBlendMode: GlobalCompositeOperation;
  gridOverlay: boolean;
  gridOverlayAlpha: number;
  charset: readonly string[];
  emptyGlyphIndex: number;
  glyphIndexByCell: Uint16Array;
  foregroundRgbaByCell: Uint8ClampedArray;
  backgroundRgbaByCell: Uint8ClampedArray;
  dotRadiusByCell: Float32Array;
}

interface AsciiGpuCarrierInput {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  renderMode: "glyph" | "dot";
  colorMode: "grayscale" | "full-color" | "duotone";
  density: number;
  coverage: number;
  edgeEmphasis: number;
  brightness: number;
  contrast: number;
  foregroundOpacity: number;
  foregroundBlendMode: GlobalCompositeOperation;
  backgroundMode: "none" | "solid" | "cell-solid" | "blurred-source";
  backgroundOpacity: number;
  backgroundFillRgba: Uint8ClampedArray | null;
  cellBackgroundRgba: Uint8ClampedArray | null;
  backgroundSourceCanvas: HTMLCanvasElement | null;
  backgroundBlurPx: number;
  invert: boolean;
  gridOverlay: boolean;
  gridOverlayAlpha: number;
  charset: readonly string[];
  sourceCanvas: HTMLCanvasElement;
}

interface GlyphAtlasInput {
  cellWidth: number;
  cellHeight: number;
  charset: readonly string[];
  fontFamily: string;
  fontSizePx?: number;
  fontSizeScale?: number;
}

interface AsciiBackgroundSourceInput {
  width: number;
  height: number;
  backgroundSourceCanvas: HTMLCanvasElement | null;
  backgroundBlurPx: number;
}

interface AsciiGlyphAtlasRecord {
  texture: WebGLTexture;
  columns: number;
  rows: number;
  glyphCount: number;
}

interface AsciiSurfaceTextureCacheRecord {
  columns: number;
  rows: number;
  foregroundTexture: WebGLTexture;
  backgroundTexture: WebGLTexture;
  glyphIndexTexture: WebGLTexture;
  dotRadiusTexture: WebGLTexture;
}

type AsciiTextmodeLayerKind = "background" | "foreground";

const LAYER_BLEND_MODE_MAP: Record<EditorLayerBlendMode, number> = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  softLight: 4,
};

const ASCII_GPU_EMPTY_GLYPH_INDEX = 255;

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

export class PipelineRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly programs: RendererPrograms;
  private readonly texturePool: TexturePool;
  private readonly filterPipeline: FilterPipeline;
  private readonly lutCache = new LUTCache(12);
  private readonly asciiGlyphAtlasCache = new Map<string, AsciiGlyphAtlasRecord>();
  private asciiGlyphAtlasLru: string[] = [];
  private readonly asciiSurfaceTextureCache = new Map<string, AsciiSurfaceTextureCacheRecord>();
  private asciiSurfaceTextureLru: string[] = [];
  private asciiGlyphIndexStaging: Uint8Array | null = null;
  private asciiDotRadiusStaging: Uint8Array | null = null;
  private readonly rendererLabel: "preview" | "export";
  private readonly maxTextureSizeValue: number;
  private readonly intermediateFormat: "RGBA8" | "RGBA16F";
  private readonly detailKernelRadius: 1 | 2;
  private readonly sourceTextureCache = new Map<TexImageSource, SourceTextureRecord>();
  private sourceTextureLru: TexImageSource[] = [];
  private currentSourceTexture: WebGLTexture | null = null;
  private lutTexture: WebGLTexture | null = null;
  private currentLutKey: string | null = null;
  private lutBlendTexture: WebGLTexture | null = null;
  private currentLutBlendKey: string | null = null;
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
  private fullMaskTexture: WebGLTexture;
  private emptyMaskTexture: WebGLTexture;
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
    u_lensVignetteMidpoint: 0.25,
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
  };
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
  private readonly maskedBlendUniforms = {
    u_opacity: 1,
    u_blendMode: LAYER_BLEND_MODE_MAP.normal,
    u_useMask: false,
    u_invertMask: false,
  };
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
    this.fullMaskTexture = twgl.createTexture(gl, {
      target: gl.TEXTURE_2D,
      src: new Uint8Array([255, 255, 255, 255]),
      width: 1,
      height: 1,
      internalFormat: gl.RGBA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      min: gl.NEAREST,
      mag: gl.NEAREST,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      auto: false,
    });
    this.emptyMaskTexture = twgl.createTexture(gl, {
      target: gl.TEXTURE_2D,
      src: new Uint8Array([0, 0, 0, 0]),
      width: 1,
      height: 1,
      internalFormat: gl.RGBA8,
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      min: gl.NEAREST,
      mag: gl.NEAREST,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
      auto: false,
    });
    this.filmPassUniforms.u_lut = this.fallback3DLutTexture;
    this.filmPassUniforms.u_lutBlend = this.fallback3DLutTexture;
    this.filmPassUniforms.u_lutMixEnabled = false;
    this.filmPassUniforms.u_lutMixFactor = 0;
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

  private drawTextureToCanvas(
    texture: WebGLTexture,
    width: number,
    height: number,
    format: "RGBA8" | "RGBA16F",
    options?: TexturePresentOptions
  ): void {
    this.outputEncodeUniforms.u_inputLinear = options?.inputLinear ?? true;
    this.outputEncodeUniforms.u_outputSize[0] = this.lastTargetWidth;
    this.outputEncodeUniforms.u_outputSize[1] = this.lastTargetHeight;
    this.outputEncodeUniforms.u_enableDither = options?.enableDither ?? true;
    this.outputEncodeUniforms.u_applyToneMap = options?.applyToneMap ?? false;
    if (!this.outputEncodeUniforms.u_inputLinear && !this.outputEncodeUniforms.u_enableDither) {
      this.filterPipeline.runToCanvas({
        baseWidth: this.lastTargetWidth,
        baseHeight: this.lastTargetHeight,
        passes: [
          {
            id: "output-display-passthrough",
            programInfo: this.programs.passthrough,
            uniforms: {},
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
      return;
    }
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
    this.drawTextureToCanvas(result.texture, result.width, result.height, result.format);
  }

  presentTextureResult(result: LinearRenderResult, options?: TexturePresentOptions): void {
    if (this.destroyed || this.contextLost) {
      return;
    }
    this.drawTextureToCanvas(result.texture, result.width, result.height, result.format, options);
  }

  applyFilter2dSource(
    source: TexImageSource,
    sourceWidth: number,
    sourceHeight: number,
    params: Filter2dPostProcessingParams
  ): boolean {
    if (this.destroyed || this.contextLost) {
      return false;
    }

    const targetWidth = Math.max(1, Math.round(sourceWidth));
    const targetHeight = Math.max(1, Math.round(sourceHeight));
    const shortEdge = Math.min(targetWidth, targetHeight);
    if (!hasFilter2dPostProcessing(params)) {
      try {
        const passthrough = this.captureLinearSource(
          source,
          targetWidth,
          targetHeight,
          targetWidth,
          targetHeight,
          {
            decodeSrgb: false,
          }
        );
        try {
          this.presentTextureResult(passthrough, {
            inputLinear: false,
            enableDither: false,
          });
          return true;
        } finally {
          passthrough.release();
        }
      } catch {
        return false;
      }
    }

    this.updateSource(source, targetWidth, targetHeight, targetWidth, targetHeight);
    if (!this.currentSourceTexture) {
      return false;
    }

    const brightnessFactor = Math.max(
      0,
      1 + clampFilter2dValue(params.brightness, -100, 100) / 100
    );
    const hueRadians = (clampFilter2dValue(params.hue, -100, 100) / 100) * Math.PI;
    const blurRadius = resolveBlurRadiusPx(params.blur, shortEdge);
    const dilateRadius = resolveDilateRadiusPx(params.dilate, shortEdge);
    const blurDirectionH = new Float32Array([1 / targetWidth, 0]);
    const blurDirectionV = new Float32Array([0, 1 / targetHeight]);
    const dilateTexelSize = new Float32Array([1 / targetWidth, 1 / targetHeight]);

    const passes = [
      {
        id: "filter2d-adjust",
        programInfo: this.programs.filter2dAdjust,
        uniforms: {
          u_brightness: brightnessFactor,
          u_hueRadians: hueRadians,
        },
        outputFormat: this.intermediateFormat,
        enabled: Math.abs(params.brightness) > 0.001 || Math.abs(params.hue) > 0.001,
      },
      {
        id: "filter2d-blur-h",
        programInfo: this.programs.blur,
        uniforms: {
          u_blurDirection: blurDirectionH,
          u_blurRadius: Math.max(blurRadius, 1),
        },
        outputFormat: this.intermediateFormat,
        enabled: blurRadius > 0.001,
      },
      {
        id: "filter2d-blur-v",
        programInfo: this.programs.blur,
        uniforms: {
          u_blurDirection: blurDirectionV,
          u_blurRadius: Math.max(blurRadius, 1),
        },
        outputFormat: this.intermediateFormat,
        enabled: blurRadius > 0.001,
      },
      {
        id: "filter2d-dilate",
        programInfo: this.programs.dilate,
        uniforms: {
          u_texelSize: dilateTexelSize,
          u_radius: dilateRadius,
        },
        outputFormat: this.intermediateFormat,
        enabled: dilateRadius > 0,
      },
    ];

    try {
      const result = this.filterPipeline.runToTexture({
        baseWidth: targetWidth,
        baseHeight: targetHeight,
        passes: [...passes],
        input: {
          texture: this.currentSourceTexture,
          width: targetWidth,
          height: targetHeight,
          format: "RGBA8",
        },
      });
      try {
        this.presentTextureResult(result, {
          inputLinear: false,
          enableDither: false,
        });
      } finally {
        result.release();
      }
      return true;
    } catch {
      return false;
    }
  }

  applyLocalMaskRangeGateSource(
    referenceSource: TexImageSource,
    referenceWidth: number,
    referenceHeight: number,
    maskSource: TexImageSource,
    maskWidth: number,
    maskHeight: number,
    mask: LocalAdjustmentMask
  ): boolean {
    if (this.destroyed || this.contextLost) {
      return false;
    }
    if (!hasLocalMaskRangeConstraints(mask)) {
      return true;
    }

    const targetWidth = Math.max(1, Math.round(maskWidth));
    const targetHeight = Math.max(1, Math.round(maskHeight));
    this.updateSource(referenceSource, referenceWidth, referenceHeight, targetWidth, targetHeight);
    if (!this.currentSourceTexture) {
      return false;
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
    const lumaRange = resolveLocalMaskLumaRange(mask);
    const colorRange = resolveLocalMaskColorRange(mask);
    const useLumaRange = !(lumaRange.min <= 0.0001 && lumaRange.max >= 0.9999);
    const useColorRange = !(colorRange.hueRange >= 179.999 && colorRange.satMin <= 1e-4);

    try {
      const result = this.filterPipeline.runToTexture({
        baseWidth: targetWidth,
        baseHeight: targetHeight,
        passes: [
          {
            id: "local-mask-range-gate",
            programInfo: this.programs.localMaskRangeGate,
            uniforms: {
              u_useLumaRange: useLumaRange,
              u_lumaMin: lumaRange.min,
              u_lumaMax: lumaRange.max,
              u_lumaFeather: lumaRange.feather,
              u_useColorRange: useColorRange,
              u_hueCenter: colorRange.hueCenter,
              u_hueRange: colorRange.hueRange,
              u_hueFeather: colorRange.hueFeather,
              u_satMin: colorRange.satMin,
              u_satFeather: colorRange.satFeather,
            },
            extraTextures: {
              u_mask: maskTexture,
            },
            outputFormat: this.intermediateFormat,
            enabled: true,
          },
        ],
        input: {
          texture: this.currentSourceTexture,
          width: targetWidth,
          height: targetHeight,
          format: "RGBA8",
        },
      });
      try {
        this.presentTextureResult(result, {
          inputLinear: false,
          enableDither: false,
        });
      } finally {
        result.release();
      }
      return true;
    } catch {
      return false;
    } finally {
      this.gl.deleteTexture(maskTexture);
    }
  }

  renderLocalMaskShape(
    mask: LocalAdjustmentMask,
    targetWidth: number,
    targetHeight: number,
    options?: {
      fullWidth?: number;
      fullHeight?: number;
      offsetX?: number;
      offsetY?: number;
    }
  ): boolean {
    if (this.destroyed || this.contextLost) {
      return false;
    }

    const safeTargetWidth = Math.max(1, Math.round(targetWidth));
    const safeTargetHeight = Math.max(1, Math.round(targetHeight));
    if (safeTargetWidth !== this.lastTargetWidth || safeTargetHeight !== this.lastTargetHeight) {
      this.canvasElement.width = safeTargetWidth;
      this.canvasElement.height = safeTargetHeight;
      this.gl.viewport(0, 0, safeTargetWidth, safeTargetHeight);
      this.lastTargetWidth = safeTargetWidth;
      this.lastTargetHeight = safeTargetHeight;
    }

    const fullWidth = Math.max(1, Math.round(options?.fullWidth ?? safeTargetWidth));
    const fullHeight = Math.max(1, Math.round(options?.fullHeight ?? safeTargetHeight));
    const offsetX = options?.offsetX ?? 0;
    const offsetY = options?.offsetY ?? 0;

    if (mask.mode === "brush") {
      if (mask.points.length > GPU_BRUSH_MASK_MAX_POINTS) {
        return false;
      }

      const minDimension = Math.max(1, Math.min(fullWidth, fullHeight));
      const brushSizePx = Math.max(1, clamp(mask.brushSize, 0.005, 0.25) * minDimension);
      const feather = clamp(mask.feather, 0, 1);
      const flow = clamp(mask.flow, 0.05, 1);
      const canvasSize = new Float32Array([safeTargetWidth, safeTargetHeight]);
      const passes =
        mask.points.length > 0
          ? mask.points.map((point, index) => {
              const pressure = clamp(point.pressure ?? 1, 0.1, 1);
              const radius = Math.max(1, brushSizePx * pressure);
              return {
                id: `local-mask-shape-brush-${index}`,
                programInfo: this.programs.brushMaskStamp,
                uniforms: {
                  u_canvasSize: canvasSize,
                  u_centerPx: new Float32Array([
                    clamp(point.x, 0, 1) * fullWidth - offsetX,
                    clamp(point.y, 0, 1) * fullHeight - offsetY,
                  ]),
                  u_radiusPx: radius,
                  u_innerRadiusPx: Math.max(0, radius * (1 - feather)),
                  u_flow: flow,
                },
                outputFormat: "RGBA8" as const,
                enabled: true,
              };
            })
          : [];

      if (mask.invert || passes.length === 0) {
        passes.push({
          id: mask.invert
            ? "local-mask-shape-brush-invert"
            : "local-mask-shape-brush-empty",
          programInfo: mask.invert ? this.programs.maskInvert : this.programs.passthrough,
          uniforms: {},
          outputFormat: "RGBA8" as const,
          enabled: true,
        });
      }

      try {
        this.filterPipeline.runToCanvas({
          baseWidth: safeTargetWidth,
          baseHeight: safeTargetHeight,
          passes,
          input: {
            texture: this.emptyMaskTexture,
            width: 1,
            height: 1,
            format: "RGBA8",
          },
          canvasOutput: {
            width: safeTargetWidth,
            height: safeTargetHeight,
          },
        });
        return true;
      } catch {
        return false;
      }
    }

    const localX = (value: number) =>
      (clamp(value, 0, 1) * fullWidth - offsetX) / safeTargetWidth;
    const localY = (value: number) =>
      (clamp(value, 0, 1) * fullHeight - offsetY) / safeTargetHeight;
    const linearStart = new Float32Array([localX(mask.mode === "linear" ? mask.startX : 0), localY(mask.mode === "linear" ? mask.startY : 0)]);
    const linearEnd = new Float32Array([localX(mask.mode === "linear" ? mask.endX : 0), localY(mask.mode === "linear" ? mask.endY : 0)]);
    if (
      mask.mode === "linear" &&
      (linearEnd[0] - linearStart[0]) * (linearEnd[0] - linearStart[0]) +
        (linearEnd[1] - linearStart[1]) * (linearEnd[1] - linearStart[1]) <
        1e-6
    ) {
      linearEnd[1] += 1 / safeTargetHeight;
    }

    const pass =
      mask.mode === "linear"
        ? {
            id: "local-mask-shape-linear",
            programInfo: this.programs.linearGradientMask,
            uniforms: {
              u_start: linearStart,
              u_end: linearEnd,
              u_feather: clamp(mask.feather, 0, 1),
              u_invert: Boolean(mask.invert),
            },
            enabled: true,
          }
        : {
            id: "local-mask-shape-radial",
            programInfo: this.programs.radialGradientMask,
            uniforms: {
              u_center: new Float32Array([localX(mask.centerX), localY(mask.centerY)]),
              u_radius: new Float32Array([
                (Math.max(0.01, mask.radiusX) * fullWidth) / safeTargetWidth,
                (Math.max(0.01, mask.radiusY) * fullHeight) / safeTargetHeight,
              ]),
              u_feather: clamp(mask.feather, 0, 1),
              u_invert: Boolean(mask.invert),
            },
            enabled: true,
          };

    try {
      this.filterPipeline.runToCanvas({
        baseWidth: safeTargetWidth,
        baseHeight: safeTargetHeight,
        passes: [pass],
        input: {
          texture: this.fullMaskTexture,
          width: 1,
          height: 1,
          format: "RGBA8",
        },
        canvasOutput: {
          width: safeTargetWidth,
          height: safeTargetHeight,
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  captureLinearSource(
    source: TexImageSource,
    sourceWidth: number,
    sourceHeight: number,
    targetWidth = sourceWidth,
    targetHeight = sourceHeight,
    options?: {
      decodeSrgb?: boolean;
    }
  ): LinearRenderResult {
    if (this.destroyed || this.contextLost) {
      throw new Error("PipelineRenderer is not available.");
    }

    this.updateSource(source, sourceWidth, sourceHeight, targetWidth, targetHeight);
    if (!this.currentSourceTexture) {
      throw new Error("Source texture is not initialized.");
    }

    const captured = this.filterPipeline.runToTexture({
      baseWidth: this.lastTargetWidth,
      baseHeight: this.lastTargetHeight,
      passes: [
        {
          id: "capture-linear-source",
          programInfo: options?.decodeSrgb === false ? this.programs.passthrough : this.programs.inputDecode,
          uniforms: {},
          outputFormat: this.intermediateFormat,
          enabled: true,
        },
      ],
      input: {
        texture: this.currentSourceTexture,
        width: this.lastTargetWidth,
        height: this.lastTargetHeight,
        format: "RGBA8",
      },
    });

    return {
      texture: captured.texture,
      width: captured.width,
      height: captured.height,
      format: captured.format,
      release: captured.release,
    };
  }

  private hasVisibleAsciiCellData(data: Uint8ClampedArray): boolean {
    for (let index = 3; index < data.length; index += 4) {
      if ((data[index] ?? 0) > 0) {
        return true;
      }
    }
    return false;
  }

  private createAsciiRgbaTexture(
    data: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number
  ): WebGLTexture {
    return twgl.createTexture(this.gl, {
      target: this.gl.TEXTURE_2D,
      src: data,
      width,
      height,
      internalFormat: this.gl.RGBA8,
      format: this.gl.RGBA,
      type: this.gl.UNSIGNED_BYTE,
      min: this.gl.NEAREST,
      mag: this.gl.NEAREST,
      wrapS: this.gl.CLAMP_TO_EDGE,
      wrapT: this.gl.CLAMP_TO_EDGE,
      auto: false,
    });
  }

  private releaseAsciiSurfaceTextureCacheRecord(record: AsciiSurfaceTextureCacheRecord): void {
    this.gl.deleteTexture(record.foregroundTexture);
    this.gl.deleteTexture(record.backgroundTexture);
    this.gl.deleteTexture(record.glyphIndexTexture);
    this.gl.deleteTexture(record.dotRadiusTexture);
  }

  private pruneAsciiSurfaceTextureCache(maxEntries = 4): void {
    while (this.asciiSurfaceTextureLru.length > maxEntries) {
      const oldestKey = this.asciiSurfaceTextureLru.shift();
      if (!oldestKey) {
        break;
      }
      const record = this.asciiSurfaceTextureCache.get(oldestKey);
      if (!record) {
        continue;
      }
      this.releaseAsciiSurfaceTextureCacheRecord(record);
      this.asciiSurfaceTextureCache.delete(oldestKey);
    }
  }

  private createAsciiSurfaceTextureCacheRecord(
    surface: AsciiTextmodeSurfaceInput
  ): AsciiSurfaceTextureCacheRecord {
    return {
      columns: surface.columns,
      rows: surface.rows,
      foregroundTexture: this.createAsciiRgbaTexture(
        surface.foregroundRgbaByCell,
        surface.columns,
        surface.rows
      ),
      backgroundTexture: this.createAsciiRgbaTexture(
        surface.backgroundRgbaByCell,
        surface.columns,
        surface.rows
      ),
      glyphIndexTexture: this.createAsciiRgbaTexture(
        this.buildAsciiGlyphIndexTextureData(surface),
        surface.columns,
        surface.rows
      ),
      dotRadiusTexture: this.createAsciiRgbaTexture(
        this.buildAsciiDotRadiusTextureData(surface),
        surface.columns,
        surface.rows
      ),
    };
  }

  private updateAsciiRgbaTexture(
    texture: WebGLTexture,
    data: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number
  ): void {
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texSubImage2D(
      this.gl.TEXTURE_2D,
      0,
      0,
      0,
      width,
      height,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      data
    );
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  private updateAsciiSurfaceTextureCacheRecord(
    record: AsciiSurfaceTextureCacheRecord,
    surface: AsciiTextmodeSurfaceInput
  ): void {
    this.updateAsciiRgbaTexture(record.foregroundTexture, surface.foregroundRgbaByCell, surface.columns, surface.rows);
    this.updateAsciiRgbaTexture(record.backgroundTexture, surface.backgroundRgbaByCell, surface.columns, surface.rows);
    this.updateAsciiRgbaTexture(record.glyphIndexTexture, this.buildAsciiGlyphIndexTextureData(surface), surface.columns, surface.rows);
    this.updateAsciiRgbaTexture(record.dotRadiusTexture, this.buildAsciiDotRadiusTextureData(surface), surface.columns, surface.rows);
  }

  private getAsciiSurfaceTextureCacheRecord(
    surface: AsciiTextmodeSurfaceInput
  ): AsciiSurfaceTextureCacheRecord {
    const cacheKey = surface.cacheKey.trim();
    if (!cacheKey) {
      return this.createAsciiSurfaceTextureCacheRecord(surface);
    }

    const cached = this.asciiSurfaceTextureCache.get(cacheKey);
    if (cached) {
      if (cached.columns === surface.columns && cached.rows === surface.rows) {
        this.updateAsciiSurfaceTextureCacheRecord(cached, surface);
      } else {
        this.releaseAsciiSurfaceTextureCacheRecord(cached);
        const recreated = this.createAsciiSurfaceTextureCacheRecord(surface);
        this.asciiSurfaceTextureCache.set(cacheKey, recreated);
      }
      this.asciiSurfaceTextureLru = [
        cacheKey,
        ...this.asciiSurfaceTextureLru.filter((key) => key !== cacheKey),
      ];
      return this.asciiSurfaceTextureCache.get(cacheKey)!;
    }

    const created = this.createAsciiSurfaceTextureCacheRecord(surface);

    this.asciiSurfaceTextureCache.set(cacheKey, created);
    this.asciiSurfaceTextureLru = [
      cacheKey,
      ...this.asciiSurfaceTextureLru.filter((key) => key !== cacheKey),
    ];
    this.pruneAsciiSurfaceTextureCache();
    return created;
  }

  private buildAsciiGlyphIndexTextureData(surface: AsciiTextmodeSurfaceInput): Uint8Array {
    const cellCount = surface.columns * surface.rows;
    const requiredSize = cellCount * 4;
    if (!this.asciiGlyphIndexStaging || this.asciiGlyphIndexStaging.length < requiredSize) {
      this.asciiGlyphIndexStaging = new Uint8Array(requiredSize);
    }
    const data = this.asciiGlyphIndexStaging;
    data.fill(0, 0, requiredSize);
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      const glyphIndex = surface.glyphIndexByCell[cellIndex] ?? surface.emptyGlyphIndex;
      data[cellIndex * 4] =
        glyphIndex === surface.emptyGlyphIndex ? ASCII_GPU_EMPTY_GLYPH_INDEX : Math.min(254, glyphIndex);
      data[cellIndex * 4 + 3] = 255;
    }
    return data.subarray(0, requiredSize);
  }

  private buildAsciiDotRadiusTextureData(surface: AsciiTextmodeSurfaceInput): Uint8Array {
    const cellCount = surface.columns * surface.rows;
    const requiredSize = cellCount * 4;
    if (!this.asciiDotRadiusStaging || this.asciiDotRadiusStaging.length < requiredSize) {
      this.asciiDotRadiusStaging = new Uint8Array(requiredSize);
    }
    const data = this.asciiDotRadiusStaging;
    data.fill(0, 0, requiredSize);
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      data[cellIndex * 4] = Math.round(clamp(surface.dotRadiusByCell[cellIndex] ?? 0, 0, 255));
      data[cellIndex * 4 + 3] = 255;
    }
    return data.subarray(0, requiredSize);
  }

  private releaseAsciiGlyphAtlasRecord(record: AsciiGlyphAtlasRecord): void {
    this.gl.deleteTexture(record.texture);
  }

  private pruneAsciiGlyphAtlasCache(maxEntries = 16): void {
    while (this.asciiGlyphAtlasLru.length > maxEntries) {
      const oldestKey = this.asciiGlyphAtlasLru.shift();
      if (!oldestKey) {
        break;
      }
      const record = this.asciiGlyphAtlasCache.get(oldestKey);
      if (!record) {
        continue;
      }
      this.releaseAsciiGlyphAtlasRecord(record);
      this.asciiGlyphAtlasCache.delete(oldestKey);
    }
  }

  private getGlyphAtlas(surface: GlyphAtlasInput): AsciiGlyphAtlasRecord {
    const key = [
      surface.fontFamily,
      surface.fontSizePx ?? "",
      surface.fontSizeScale ?? "",
      `${surface.cellWidth}x${surface.cellHeight}`,
      surface.charset.join(""),
    ].join(":");
    const cached = this.asciiGlyphAtlasCache.get(key);
    if (cached) {
      this.asciiGlyphAtlasLru = [key, ...this.asciiGlyphAtlasLru.filter((candidate) => candidate !== key)];
      return cached;
    }

    const glyphCount = Math.max(1, surface.charset.length);
    const columns = Math.max(1, Math.ceil(Math.sqrt(glyphCount)));
    const rows = Math.max(1, Math.ceil(glyphCount / columns));
    const atlasCanvas = document.createElement("canvas");
    atlasCanvas.width = Math.max(1, columns * surface.cellWidth);
    atlasCanvas.height = Math.max(1, rows * surface.cellHeight);
    const context = atlasCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      atlasCanvas.width = 0;
      atlasCanvas.height = 0;
      throw new Error("Failed to acquire ASCII glyph atlas context.");
    }

    context.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `${Math.max(
      6,
      Math.round(surface.fontSizePx ?? surface.cellHeight * (surface.fontSizeScale ?? 0.9))
    )}px ${surface.fontFamily}`;

    for (let glyphIndex = 0; glyphIndex < surface.charset.length; glyphIndex += 1) {
      const glyph = surface.charset[glyphIndex] ?? "";
      if (!glyph || glyph === " ") {
        continue;
      }
      const column = glyphIndex % columns;
      const row = Math.floor(glyphIndex / columns);
      const x = column * surface.cellWidth + surface.cellWidth / 2;
      const y = row * surface.cellHeight + surface.cellHeight / 2;
      context.fillText(glyph, x, y);
    }

    const texture = twgl.createTexture(this.gl, {
      target: this.gl.TEXTURE_2D,
      src: atlasCanvas,
      min: this.gl.LINEAR,
      mag: this.gl.LINEAR,
      wrapS: this.gl.CLAMP_TO_EDGE,
      wrapT: this.gl.CLAMP_TO_EDGE,
      auto: false,
    });
    atlasCanvas.width = 0;
    atlasCanvas.height = 0;

    const record = {
      texture,
      columns,
      rows,
      glyphCount,
    };
    this.asciiGlyphAtlasCache.set(key, record);
    this.asciiGlyphAtlasLru = [key, ...this.asciiGlyphAtlasLru.filter((candidate) => candidate !== key)];
    this.pruneAsciiGlyphAtlasCache();
    return record;
  }

  private renderAsciiBackgroundSourceLayer(
    surface: AsciiBackgroundSourceInput
  ): LinearRenderResult | null {
    if (!surface.backgroundSourceCanvas) {
      return null;
    }

    const captured = this.captureLinearSource(
      surface.backgroundSourceCanvas,
      surface.width,
      surface.height,
      surface.width,
      surface.height,
      {
        decodeSrgb: false,
      }
    );

    if (surface.backgroundBlurPx <= 0.001) {
      return captured;
    }

    const blurDirectionH = new Float32Array([1 / surface.width, 0]);
    const blurDirectionV = new Float32Array([0, 1 / surface.height]);

    try {
      const blurred = this.filterPipeline.runToTexture({
        baseWidth: surface.width,
        baseHeight: surface.height,
        passes: [
          {
            id: "ascii-background-blur-h",
            programInfo: this.programs.blur,
            uniforms: {
              u_blurDirection: blurDirectionH,
              u_blurRadius: Math.max(surface.backgroundBlurPx, 1),
            },
            outputFormat: this.intermediateFormat,
            enabled: true,
          },
          {
            id: "ascii-background-blur-v",
            programInfo: this.programs.blur,
            uniforms: {
              u_blurDirection: blurDirectionV,
              u_blurRadius: Math.max(surface.backgroundBlurPx, 1),
            },
            outputFormat: this.intermediateFormat,
            enabled: true,
          },
        ],
        input: {
          texture: captured.texture,
          width: captured.width,
          height: captured.height,
          format: captured.format,
        },
      });
      return {
        texture: blurred.texture,
        width: blurred.width,
        height: blurred.height,
        format: blurred.format,
        release: blurred.release,
      };
    } finally {
      captured.release();
    }
  }

  private renderAsciiTextmodeLayer(
    surface: AsciiTextmodeSurfaceInput,
    layerKind: AsciiTextmodeLayerKind
  ): LinearRenderResult | null {
    const hasBackground =
      Boolean(surface.backgroundFillRgba) ||
      Boolean(surface.backgroundSourceCanvas) ||
      this.hasVisibleAsciiCellData(surface.backgroundRgbaByCell);
    const hasForeground =
      this.hasVisibleAsciiCellData(surface.foregroundRgbaByCell) || surface.gridOverlay;
    if ((layerKind === "background" && !hasBackground) || (layerKind === "foreground" && !hasForeground)) {
      return null;
    }

    const glyphAtlas =
      layerKind === "foreground" && surface.renderMode === "glyph"
        ? this.getGlyphAtlas({
            cellWidth: surface.cellWidth,
            cellHeight: surface.cellHeight,
            charset: surface.charset,
            fontFamily: "monospace",
            fontSizeScale: 0.9,
          })
        : {
            texture: this.emptyMaskTexture,
            columns: 1,
            rows: 1,
            glyphCount: 0,
          };
    const cacheKey = surface.cacheKey.trim();
    const usesCachedTextures = cacheKey.length > 0;
    const textureRecord = this.getAsciiSurfaceTextureCacheRecord(surface);
    const backgroundSourceLayer =
      layerKind === "background" ? this.renderAsciiBackgroundSourceLayer(surface) : null;
    const backgroundSourceTexture = backgroundSourceLayer?.texture ?? this.emptyMaskTexture;

    try {
      const rendered = this.filterPipeline.runToTexture({
        baseWidth: surface.width,
        baseHeight: surface.height,
        passes: [
          {
            id: `ascii-textmode-${layerKind}`,
            programInfo: this.programs.asciiTextmode,
            uniforms: {
              u_canvasSize: new Float32Array([surface.width, surface.height]),
              u_gridSize: new Float32Array([surface.columns, surface.rows]),
              u_cellSize: new Float32Array([surface.cellWidth, surface.cellHeight]),
              u_glyphAtlasGrid: new Float32Array([glyphAtlas.columns, glyphAtlas.rows]),
              u_backgroundFill: surface.backgroundFillRgba
                ? new Float32Array([
                    (surface.backgroundFillRgba[0] ?? 0) / 255,
                    (surface.backgroundFillRgba[1] ?? 0) / 255,
                    (surface.backgroundFillRgba[2] ?? 0) / 255,
                    (surface.backgroundFillRgba[3] ?? 0) / 255,
                  ])
                : new Float32Array([0, 0, 0, 0]),
              u_emptyGlyphIndex: ASCII_GPU_EMPTY_GLYPH_INDEX,
              u_glyphCount: glyphAtlas.glyphCount,
              u_layerMode: layerKind === "background" ? 0 : 1,
              u_renderMode: surface.renderMode === "dot" ? 1 : 0,
              u_useBackgroundCanvas: Boolean(backgroundSourceLayer),
              u_useBackgroundFill: Boolean(surface.backgroundFillRgba),
              u_gridOverlay: surface.gridOverlay,
              u_gridOverlayAlpha: surface.gridOverlayAlpha,
            },
            extraTextures: {
              u_backgroundCanvas: backgroundSourceTexture,
              u_cellForeground: textureRecord.foregroundTexture,
              u_cellBackground: textureRecord.backgroundTexture,
              u_cellGlyphIndex: textureRecord.glyphIndexTexture,
              u_cellDotRadius: textureRecord.dotRadiusTexture,
              u_glyphAtlas: glyphAtlas.texture,
            },
            outputFormat: "RGBA8",
            enabled: true,
          },
        ],
        input: {
          texture: this.emptyMaskTexture,
          width: 1,
          height: 1,
          format: "RGBA8",
        },
      });

      return {
        texture: rendered.texture,
        width: rendered.width,
        height: rendered.height,
        format: rendered.format,
        release: rendered.release,
      };
    } finally {
      backgroundSourceLayer?.release();
      if (!usesCachedTextures) {
        this.releaseAsciiSurfaceTextureCacheRecord(textureRecord);
      }
    }
  }

  private renderAsciiCarrierLayer(
    carrier: AsciiGpuCarrierInput,
    layerKind: AsciiTextmodeLayerKind,
    analysisGrid: LinearRenderResult
  ): LinearRenderResult | null {
    const hasBackground =
      Boolean(carrier.backgroundFillRgba) ||
      Boolean(carrier.backgroundSourceCanvas) ||
      Boolean(carrier.cellBackgroundRgba);
    const hasForeground = carrier.foregroundOpacity > 0.001 || carrier.gridOverlay;
    if ((layerKind === "background" && !hasBackground) || (layerKind === "foreground" && !hasForeground)) {
      return null;
    }

    const glyphAtlas =
      layerKind === "foreground" && carrier.renderMode === "glyph"
        ? this.getGlyphAtlas({
            cellWidth: carrier.cellWidth,
            cellHeight: carrier.cellHeight,
            charset: carrier.charset,
            fontFamily: "monospace",
            fontSizeScale: 0.9,
          })
        : {
            texture: this.emptyMaskTexture,
            columns: 1,
            rows: 1,
            glyphCount: 0,
          };
    const backgroundSourceLayer =
      layerKind === "background" ? this.renderAsciiBackgroundSourceLayer(carrier) : null;
    const backgroundSourceTexture = backgroundSourceLayer?.texture ?? this.emptyMaskTexture;
    const backgroundFill =
      carrier.backgroundFillRgba
        ? new Float32Array([
            (carrier.backgroundFillRgba[0] ?? 0) / 255,
            (carrier.backgroundFillRgba[1] ?? 0) / 255,
            (carrier.backgroundFillRgba[2] ?? 0) / 255,
            (carrier.backgroundFillRgba[3] ?? 0) / 255,
          ])
        : new Float32Array([0, 0, 0, 0]);
    const cellBackground =
      carrier.cellBackgroundRgba
        ? new Float32Array([
            (carrier.cellBackgroundRgba[0] ?? 0) / 255,
            (carrier.cellBackgroundRgba[1] ?? 0) / 255,
            (carrier.cellBackgroundRgba[2] ?? 0) / 255,
            (carrier.cellBackgroundRgba[3] ?? 0) / 255,
          ])
        : new Float32Array([0, 0, 0, 0]);

    try {
      const rendered = this.filterPipeline.runToTexture({
        baseWidth: carrier.width,
        baseHeight: carrier.height,
        passes: [
          {
            id: `ascii-carrier-${layerKind}`,
            programInfo: this.programs.asciiCarrier,
            uniforms: {
              u_canvasSize: new Float32Array([carrier.width, carrier.height]),
              u_gridSize: new Float32Array([carrier.columns, carrier.rows]),
              u_cellSize: new Float32Array([carrier.cellWidth, carrier.cellHeight]),
              u_glyphAtlasGrid: new Float32Array([glyphAtlas.columns, glyphAtlas.rows]),
              u_backgroundFill: backgroundFill,
              u_cellBackgroundColor: cellBackground,
              u_glyphCount: glyphAtlas.glyphCount,
              u_layerMode: layerKind === "background" ? 0 : 1,
              u_renderMode: carrier.renderMode === "dot" ? 1 : 0,
              u_colorMode:
                carrier.colorMode === "duotone" ? 2 : carrier.colorMode === "full-color" ? 1 : 0,
              u_density: carrier.density,
              u_coverage: carrier.coverage,
              u_edgeEmphasis: carrier.edgeEmphasis,
              u_brightness: carrier.brightness,
              u_contrast: carrier.contrast,
              u_foregroundOpacity: carrier.foregroundOpacity,
              u_invert: carrier.invert,
              u_useBackgroundCanvas: Boolean(backgroundSourceLayer),
              u_useBackgroundFill: Boolean(carrier.backgroundFillRgba),
              u_useCellBackground: Boolean(carrier.cellBackgroundRgba),
              u_gridOverlay: carrier.gridOverlay,
              u_gridOverlayAlpha: carrier.gridOverlayAlpha,
            },
            extraTextures: {
              u_backgroundCanvas: backgroundSourceTexture,
              u_glyphAtlas: glyphAtlas.texture,
            },
            outputFormat: "RGBA8",
            enabled: true,
          },
        ],
        input: {
          texture: analysisGrid.texture,
          width: analysisGrid.width,
          height: analysisGrid.height,
          format: analysisGrid.format,
        },
      });

      return {
        texture: rendered.texture,
        width: rendered.width,
        height: rendered.height,
        format: rendered.format,
        release: rendered.release,
      };
    } finally {
      backgroundSourceLayer?.release();
    }
  }

  renderAsciiTextmodeComposite(options: {
    baseCanvas: HTMLCanvasElement;
    surface: AsciiTextmodeSurfaceInput;
    foregroundBlendMode: EditorLayerBlendMode;
  }): boolean {
    if (this.destroyed || this.contextLost) {
      return false;
    }

    try {
      let composited = this.captureLinearSource(
        options.baseCanvas,
        options.baseCanvas.width,
        options.baseCanvas.height,
        options.baseCanvas.width,
        options.baseCanvas.height,
        {
          decodeSrgb: false,
        }
      );

      try {
        const backgroundLayer = this.renderAsciiTextmodeLayer(options.surface, "background");
        if (backgroundLayer) {
          try {
            const blended = this.blendLinearLayers(composited, backgroundLayer, {
              blendMode: "normal",
              opacity: 1,
            });
            composited.release();
            composited = blended;
          } finally {
            backgroundLayer.release();
          }
        }

        const foregroundLayer = this.renderAsciiTextmodeLayer(options.surface, "foreground");
        if (foregroundLayer) {
          try {
            const blended = this.blendLinearLayers(composited, foregroundLayer, {
              blendMode: options.foregroundBlendMode,
              opacity: 1,
            });
            composited.release();
            composited = blended;
          } finally {
            foregroundLayer.release();
          }
        }

        this.presentTextureResult(composited, {
          inputLinear: false,
          enableDither: false,
        });
        return true;
      } finally {
        composited.release();
      }
    } catch {
      return false;
    }
  }

  renderAsciiCarrierComposite(options: {
    baseCanvas: HTMLCanvasElement;
    carrier: AsciiGpuCarrierInput;
    foregroundBlendMode: EditorLayerBlendMode;
  }): boolean {
    if (this.destroyed || this.contextLost) {
      return false;
    }

    try {
      let composited = this.captureLinearSource(
        options.baseCanvas,
        options.baseCanvas.width,
        options.baseCanvas.height,
        options.baseCanvas.width,
        options.baseCanvas.height,
        {
          decodeSrgb: false,
        }
      );
      const analysisGrid = this.captureLinearSource(
        options.carrier.sourceCanvas,
        options.carrier.sourceCanvas.width,
        options.carrier.sourceCanvas.height,
        options.carrier.columns,
        options.carrier.rows,
        {
          decodeSrgb: false,
        }
      );

      try {
        const backgroundLayer = this.renderAsciiCarrierLayer(options.carrier, "background", analysisGrid);
        if (backgroundLayer) {
          try {
            const blended = this.blendLinearLayers(composited, backgroundLayer, {
              blendMode: "normal",
              opacity: 1,
            });
            composited.release();
            composited = blended;
          } finally {
            backgroundLayer.release();
          }
        }

        const foregroundLayer = this.renderAsciiCarrierLayer(options.carrier, "foreground", analysisGrid);
        if (foregroundLayer) {
          try {
            const blended = this.blendLinearLayers(composited, foregroundLayer, {
              blendMode: options.foregroundBlendMode,
              opacity: 1,
            });
            composited.release();
            composited = blended;
          } finally {
            foregroundLayer.release();
          }
        }

        this.presentTextureResult(composited, {
          inputLinear: false,
          enableDither: false,
        });
        return true;
      } finally {
        analysisGrid.release();
        composited.release();
      }
    } catch {
      return false;
    }
  }

  private renderTimestampOverlayLayer(overlay: TimestampOverlayGpuInput): LinearRenderResult | null {
    if (overlay.charCount <= 0) {
      return null;
    }

    const glyphAtlas = this.getGlyphAtlas({
      cellWidth: overlay.cellWidth,
      cellHeight: overlay.cellHeight,
      charset: overlay.charset,
      fontFamily: overlay.fontFamily || "sans-serif",
      fontSizePx: overlay.fontSizePx,
    });

    const backgroundColor = new Float32Array([
      (overlay.backgroundColorRgba[0] ?? 0) / 255,
      (overlay.backgroundColorRgba[1] ?? 0) / 255,
      (overlay.backgroundColorRgba[2] ?? 0) / 255,
      (overlay.backgroundColorRgba[3] ?? 0) / 255,
    ]);
    const textColor = new Float32Array([
      (overlay.textColorRgba[0] ?? 0) / 255,
      (overlay.textColorRgba[1] ?? 0) / 255,
      (overlay.textColorRgba[2] ?? 0) / 255,
      (overlay.textColorRgba[3] ?? 0) / 255,
    ]);

    const rendered = this.filterPipeline.runToTexture({
      baseWidth: overlay.width,
      baseHeight: overlay.height,
      passes: [
        {
          id: "timestamp-overlay",
          programInfo: this.programs.timestampOverlay,
          uniforms: {
            u_canvasSize: new Float32Array([overlay.width, overlay.height]),
            u_rect: new Float32Array([
              overlay.rectLeft,
              overlay.rectTop,
              overlay.rectWidth,
              overlay.rectHeight,
            ]),
            u_textStart: new Float32Array([overlay.textStartX, overlay.textStartY]),
            u_cellSize: new Float32Array([overlay.cellWidth, overlay.cellHeight]),
            u_glyphAtlasGrid: new Float32Array([glyphAtlas.columns, glyphAtlas.rows]),
            u_backgroundColor: backgroundColor,
            u_textColor: textColor,
            u_charCount: overlay.charCount,
            u_glyphCount: glyphAtlas.glyphCount,
            u_glyphIndices: overlay.glyphIndices,
          },
          extraTextures: {
            u_glyphAtlas: glyphAtlas.texture,
          },
          outputFormat: "RGBA8",
          enabled: true,
        },
      ],
      input: {
        texture: this.emptyMaskTexture,
        width: 1,
        height: 1,
        format: "RGBA8",
      },
    });

    return {
      texture: rendered.texture,
      width: rendered.width,
      height: rendered.height,
      format: rendered.format,
      release: rendered.release,
    };
  }

  renderTimestampOverlayComposite(options: {
    baseCanvas: HTMLCanvasElement;
    overlay: TimestampOverlayGpuInput;
  }): boolean {
    if (this.destroyed || this.contextLost) {
      return false;
    }

    try {
      let composited = this.captureLinearSource(
        options.baseCanvas,
        options.baseCanvas.width,
        options.baseCanvas.height,
        options.baseCanvas.width,
        options.baseCanvas.height,
        {
          decodeSrgb: false,
        }
      );

      try {
        const overlayLayer = this.renderTimestampOverlayLayer(options.overlay);
        if (!overlayLayer) {
          this.presentTextureResult(composited, {
            inputLinear: false,
            enableDither: false,
          });
          return true;
        }

        try {
          const blended = this.blendLinearLayers(composited, overlayLayer, {
            blendMode: "normal",
            opacity: 1,
          });
          composited.release();
          composited = blended;
        } finally {
          overlayLayer.release();
        }

        this.presentTextureResult(composited, {
          inputLinear: false,
          enableDither: false,
        });
        return true;
      } finally {
        composited.release();
      }
    } catch {
      return false;
    }
  }

  generateMaskTexture(
    mask: EditorLayerMask,
    width: number,
    height: number,
    referenceSource?: CanvasImageSource,
    targetCanvas?: HTMLCanvasElement,
    scratchCanvas?: HTMLCanvasElement
  ): HTMLCanvasElement | null {
    return generateLayerMaskTexture(mask, {
      width,
      height,
      referenceSource,
      targetCanvas,
      scratchCanvas,
    });
  }

  blendLinearLayers(
    base: LinearRenderResult,
    layer: LinearRenderResult,
    options?: LayerBlendOptions
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

    const blendMode = options?.blendMode ?? "normal";
    const opacity = Math.max(0, Math.min(1, options?.opacity ?? 1));
    const useMask = Boolean(options?.maskSource);
    let maskTexture: WebGLTexture = this.fullMaskTexture;

    if (useMask && options?.maskSource) {
      maskTexture = twgl.createTexture(this.gl, {
        target: this.gl.TEXTURE_2D,
        src: options.maskSource,
        min: this.gl.LINEAR,
        mag: this.gl.LINEAR,
        wrapS: this.gl.CLAMP_TO_EDGE,
        wrapT: this.gl.CLAMP_TO_EDGE,
        auto: false,
      });
    }

    this.maskedBlendUniforms.u_opacity = opacity;
    this.maskedBlendUniforms.u_blendMode = LAYER_BLEND_MODE_MAP[blendMode];
    this.maskedBlendUniforms.u_useMask = useMask;
    this.maskedBlendUniforms.u_invertMask = Boolean(options?.invertMask);

    try {
      const blended = this.filterPipeline.runToTexture({
        baseWidth: this.lastTargetWidth,
        baseHeight: this.lastTargetHeight,
        passes: [
          {
            id: "layer-blend",
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
      if (useMask) {
        this.gl.deleteTexture(maskTexture);
      }
    }
  }

  blendLinearWithMask(
    base: LinearRenderResult,
    layer: LinearRenderResult,
    maskSource: TexImageSource
  ): LinearRenderResult {
    return this.blendLinearLayers(base, layer, {
      blendMode: "normal",
      opacity: 1,
      maskSource,
    });
  }

  async loadLUT(url: string, level: 8 | 16 = 8): Promise<void> {
    await this.loadCachedLutTexture(url, level, this.currentLutKey, this.lutTexture, (texture, key) => {
      this.lutTexture = texture;
      this.currentLutKey = key;
    });
  }

  async ensureLUT(lut: { url: string; level: 8 | 16 } | null): Promise<void> {
    if (!lut) {
      return;
    }
    await this.loadLUT(lut.url, lut.level);
  }

  async loadLUTBlend(url: string, level: 8 | 16 = 8): Promise<void> {
    await this.loadCachedLutTexture(
      url,
      level,
      this.currentLutBlendKey,
      this.lutBlendTexture,
      (texture, key) => {
        this.lutBlendTexture = texture;
        this.currentLutBlendKey = key;
      }
    );
  }

  async ensureLUTBlend(lut: { url: string; level: 8 | 16 } | null): Promise<void> {
    if (!lut) {
      return;
    }
    await this.loadLUTBlend(lut.url, lut.level);
  }

  async loadCustomLUT(url: string, level: 8 | 16 = 8): Promise<void> {
    await this.loadCachedLutTexture(
      url,
      level,
      this.currentCustomLutKey,
      this.customLutTexture,
      (texture, key) => {
        this.customLutTexture = texture;
        this.currentCustomLutKey = key;
      }
    );
  }

  async ensureCustomLUT(lut: { url: string; level: 8 | 16 } | null): Promise<void> {
    if (!lut) {
      return;
    }
    await this.loadCustomLUT(lut.url, lut.level);
  }

  async loadPrintLUT(url: string, level: 8 | 16 = 8): Promise<void> {
    await this.loadCachedLutTexture(
      url,
      level,
      this.currentPrintLutKey,
      this.printLutTexture,
      (texture, key) => {
        this.printLutTexture = texture;
        this.currentPrintLutKey = key;
      }
    );
  }

  async ensurePrintLUT(lut: { url: string; level: 8 | 16 } | null): Promise<void> {
    if (!lut) {
      return;
    }
    await this.loadPrintLUT(lut.url, lut.level);
  }

  private async loadCachedLutTexture(
    url: string,
    level: 8 | 16,
    currentKey: string | null,
    currentTexture: WebGLTexture | null,
    assign: (texture: WebGLTexture, key: string) => void
  ): Promise<void> {
    if (this.destroyed || this.contextLost) {
      return;
    }
    const lutFormat = this.intermediateFormat;
    const key = resolveLutCacheKey(url, level, lutFormat);
    if (currentKey === key && currentTexture) {
      return;
    }
    const texture = await this.lutCache.get(this.gl, url, level, {
      textureFormat: lutFormat,
    });
    assign(texture, key);
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

    const record = ensureSourceTextureRecord({
      gl: this.gl,
      sourceTextureCache: this.sourceTextureCache,
      source,
      width: sourceW,
      height: sourceH,
    });

    const sourceRefChanged = source !== this.lastSourceRef;
    const sourceSizeChanged = sourceW !== this.lastSourceWidth || sourceH !== this.lastSourceHeight;
    if (sourceRefChanged || sourceSizeChanged || record.mutable) {
      uploadSourceTexture(this.gl, record.texture, source);
    }

    this.sourceTextureLru = touchSourceTextureLru(this.sourceTextureLru, source);
    this.sourceTextureLru = pruneSourceTextureCache({
      gl: this.gl,
      sourceTextureCache: this.sourceTextureCache,
      sourceTextureLru: this.sourceTextureLru,
      currentSource: source,
      pinnedSource: this.lastSourceRef,
    });

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

    const useGeometry = !options?.skipGeometry;
    const useMaster = !options?.skipMaster;
    const useHsl = hslUniforms.enabled && !options?.skipHsl;
    const useCurve = curveUniforms.enabled && !options?.skipCurve;
    const useDetail = detailUniforms.enabled && !options?.skipDetail;
    const useFilm = !!filmUniforms && !options?.skipFilm;
    const useHalation = !!halationBloomUniforms && !options?.skipHalationBloom;

    const passCpuMs = this.updatePassUniformStates({
      useGeometry,
      useMaster,
      useHsl,
      useCurve,
      useDetail,
      useFilm,
      useHalation,
      geometryUniforms,
      masterUniforms,
      hslUniforms,
      curveUniforms,
      detailUniforms,
      filmUniforms,
      halationBloomUniforms,
    });

    const updateUniformsMs = performance.now() - startedAt;

    const filterChainStartedAt = performance.now();
    const {
      passes: mainPasses,
      filmStageCount,
      shouldRunMultiscaleDenoise,
    } = buildMainPasses({
      useGeometry,
      useMaster,
      useHsl,
      useCurve,
      useDetail,
      useFilm,
      intermediateFormat: this.intermediateFormat,
      programs: this.programs,
      geometryPassUniforms: this.geometryPassUniforms,
      masterPassUniforms: this.masterPassUniforms,
      hslPassUniforms: this.hslPassUniforms,
      curvePassUniforms: this.curvePassUniforms,
      detailPassUniforms: this.detailPassUniforms,
      filmPassUniforms: this.filmPassUniforms,
    });
    this.outputEncodeUniforms.u_applyToneMap = filmStageCount === 0;
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
    const postProcessingResult = runPostProcessing({
      filterPipeline: this.filterPipeline,
      programs: this.programs,
      baseResult,
      targetWidth: this.lastTargetWidth,
      targetHeight: this.lastTargetHeight,
      intermediateFormat: this.intermediateFormat,
      shouldRunMultiscaleDenoise,
      denoiseState: {
        downsamplePassUniforms: this.downsamplePassUniforms,
        bilateralHalfPassUniforms: this.bilateralHalfPassUniforms,
        bilateralQuarterPassUniforms: this.bilateralQuarterPassUniforms,
        reconstructPassUniforms: this.reconstructPassUniforms,
        detailPassUniforms: this.detailPassUniforms as {
          u_noiseReduction: number;
          u_colorNoiseReduction: number;
        },
      },
      useOptics: useHalation,
      opticsState: {
        thresholdPassUniforms: this.thresholdPassUniforms,
        glowThresholdPassUniforms: this.glowThresholdPassUniforms,
        blurHPassUniforms: this.blurHPassUniforms,
        blurVPassUniforms: this.blurVPassUniforms,
        glowBlurHPassUniforms: this.glowBlurHPassUniforms,
        glowBlurVPassUniforms: this.glowBlurVPassUniforms,
        compositePassUniforms: this.compositePassUniforms,
        glowCompositePassUniforms: this.glowCompositePassUniforms,
      },
      halationBlurPasses: this.halationBlurPasses,
      glowBlurPasses: this.glowBlurPasses,
      captureLinearOutput: Boolean(options?.captureLinearOutput),
      captureLinearResult: (result) => this.setCapturedLinearResult(result),
      drawLinearToCanvas: (texture, width, height, format) =>
        this.drawTextureToCanvas(texture, width, height, format),
    });

    const filterChainMs = Math.max(
      0,
      performance.now() - filterChainStartedAt - postProcessingResult.drawMs
    );

    const activePasses: string[] = [];
    if (useGeometry) activePasses.push("geometry");
    if (useMaster) activePasses.push("master");
    if (useHsl) activePasses.push("hsl");
    if (useCurve) activePasses.push("curve");
    if (useDetail) activePasses.push("detail");
    if (filmStageCount > 0) activePasses.push("film");
    if (postProcessingResult.opticsActive) activePasses.push("optics");

    return {
      totalMs: performance.now() - startedAt,
      updateUniformsMs,
      filterChainMs,
      drawMs: postProcessingResult.drawMs,
      passCpuMs,
      activePasses,
    };
  }

  private measureCallMs(work: () => void): number {
    const startedAt = performance.now();
    work();
    return performance.now() - startedAt;
  }

  private updatePassUniformStates(options: UniformUpdateOptions): PassCpuMs {
    const passCpuMs: PassCpuMs = {
      geometry: 0,
      master: 0,
      hsl: 0,
      curve: 0,
      detail: 0,
      film: 0,
      optics: 0,
    };
    if (options.useGeometry) {
      passCpuMs.geometry = this.measureCallMs(() =>
        this.updateGeometryPassUniforms(options.geometryUniforms)
      );
    }
    if (options.useMaster) {
      passCpuMs.master = this.measureCallMs(() =>
        this.updateMasterPassUniforms(options.masterUniforms)
      );
    }
    if (options.useHsl) {
      passCpuMs.hsl = this.measureCallMs(() => this.updateHslPassUniforms(options.hslUniforms));
    }
    if (options.useCurve) {
      passCpuMs.curve = this.measureCallMs(() => this.updateCurvePassUniforms(options.curveUniforms));
    }
    if (options.useDetail) {
      passCpuMs.detail = this.measureCallMs(() =>
        this.updateDetailPassUniforms(options.detailUniforms)
      );
    }
    if (options.useFilm && options.filmUniforms) {
      const filmUniforms = options.filmUniforms;
      passCpuMs.film = this.measureCallMs(() => this.updateFilmPassUniforms(filmUniforms));
    }
    if (options.useHalation && options.halationBloomUniforms) {
      const halationUniforms = options.halationBloomUniforms;
      passCpuMs.optics = this.measureCallMs(() => this.updateHalationPassUniforms(halationUniforms));
    }
    return passCpuMs;
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

    for (const atlas of this.asciiGlyphAtlasCache.values()) {
      this.releaseAsciiGlyphAtlasRecord(atlas);
    }
    this.asciiGlyphAtlasCache.clear();
    this.asciiGlyphAtlasLru = [];
    for (const record of this.asciiSurfaceTextureCache.values()) {
      this.releaseAsciiSurfaceTextureCacheRecord(record);
    }
    this.asciiSurfaceTextureCache.clear();
    this.asciiSurfaceTextureLru = [];
    this.asciiGlyphIndexStaging = null;
    this.asciiDotRadiusStaging = null;

    this.gl.deleteTexture(this.curveLutTexture);
    this.gl.deleteTexture(this.blueNoiseTexture);
    this.gl.deleteTexture(this.damageTexture);
    this.gl.deleteTexture(this.borderTexture);
    this.gl.deleteTexture(this.fallback3DLutTexture);
    this.gl.deleteTexture(this.fullMaskTexture);
    this.gl.deleteTexture(this.emptyMaskTexture);
    this.curveLutTexture = null as unknown as WebGLTexture;
    this.blueNoiseTexture = null as unknown as WebGLTexture;
    this.damageTexture = null as unknown as WebGLTexture;
    this.borderTexture = null as unknown as WebGLTexture;
    this.fallback3DLutTexture = null as unknown as WebGLTexture;
    this.fullMaskTexture = null as unknown as WebGLTexture;
    this.emptyMaskTexture = null as unknown as WebGLTexture;

    this.lutTexture = null;
    this.currentLutKey = null;
    this.lutBlendTexture = null;
    this.currentLutBlendKey = null;
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

  private updateGeometryPassUniforms(u: GeometryUniforms): void {
    applyGeometryPassUniforms(this.geometryPassUniforms, u);
  }

  private updateMasterPassUniforms(u: MasterUniforms): void {
    applyMasterPassUniforms(this.masterPassUniforms, u);
  }

  private updateHslPassUniforms(u: HSLUniforms): void {
    applyHslPassUniforms(this.hslPassUniforms, u);
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
    applyDetailPassUniforms(this.detailPassUniforms, u, {
      targetWidth: this.lastTargetWidth,
      targetHeight: this.lastTargetHeight,
      detailKernelRadius: this.detailKernelRadius,
    });
  }

  private updateFilmPassUniforms(u: FilmUniforms): void {
    applyFilmPassUniforms(this.filmPassUniforms, u, {
      lutTexture: this.lutTexture,
      lutBlendTexture: this.lutBlendTexture,
      customLutTexture: this.customLutTexture,
      printLutTexture: this.printLutTexture,
      fallback3DLutTexture: this.fallback3DLutTexture,
      blueNoiseTexture: this.blueNoiseTexture,
      damageTexture: this.damageTexture,
      borderTexture: this.borderTexture,
      targetWidth: this.lastTargetWidth,
      targetHeight: this.lastTargetHeight,
    });
  }

  private updateHalationPassUniforms(u: HalationBloomUniforms): void {
    const passCounts = applyHalationPassUniforms(
      {
        thresholdPassUniforms: this.thresholdPassUniforms,
        glowThresholdPassUniforms: this.glowThresholdPassUniforms,
        blurHPassUniforms: this.blurHPassUniforms,
        blurVPassUniforms: this.blurVPassUniforms,
        glowBlurHPassUniforms: this.glowBlurHPassUniforms,
        glowBlurVPassUniforms: this.glowBlurVPassUniforms,
        compositePassUniforms: this.compositePassUniforms,
        glowCompositePassUniforms: this.glowCompositePassUniforms,
      },
      u,
      {
        targetWidth: this.lastTargetWidth,
        targetHeight: this.lastTargetHeight,
      }
    );
    this.halationBlurPasses = passCounts.halationBlurPasses;
    this.glowBlurPasses = passCounts.glowBlurPasses;
  }
}
