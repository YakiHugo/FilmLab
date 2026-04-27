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
import { reportGlError } from "./reportGlError";
import { generateMaskTexture as generateLayerMaskTexture } from "@/lib/layerMaskTexture";
import type { EditorLayerBlendMode, EditorLayerMask } from "@/types";
import type { HalftoneCarrierGpuInput } from "./gpuHalftoneCarrier";
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

const LAYER_BLEND_MODE_MAP: Record<EditorLayerBlendMode, number> = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  softLight: 4,
};


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
  private readonly rendererLabel: "preview" | "export";
  private readonly maxTextureSizeValue: number;
  private readonly intermediateFormat: "RGBA8" | "RGBA16F";
  private readonly supportsFloatReadback: boolean;
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
    this.supportsFloatReadback = supportsFloatRenderTarget;
    this.texturePool = new TexturePool(
      gl,
      supportsFloatRenderTarget,
      supportsFloatLinearFiltering
    );
    this.filterPipeline = new FilterPipeline(
      gl,
      this.texturePool,
      this.programs.passthrough
    );

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

  // captureLinearSource uploads `source` and returns an intermediate texture at
  // (targetWidth × targetHeight). updateSource() authoritatively sets the
  // renderer's output size to match, so downstream draws in the same render
  // callback (blendLinearLayers, presentTextureResult) see the correct
  // `lastTarget*` without a separate resize call. Since renderer slots are
  // reused across renders (the ASCII path shares one slot id), the caller
  // must pass targetWidth/targetHeight equal to its intended output size.
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
  renderHalftoneCarrierComposite(options: {
    baseCanvas: HTMLCanvasElement;
    carrier: HalftoneCarrierGpuInput;
  }): boolean {
    if (this.destroyed || this.contextLost) {
      return false;
    }

    try {
      const source = this.captureLinearSource(
        options.baseCanvas,
        options.baseCanvas.width,
        options.baseCanvas.height,
        options.baseCanvas.width,
        options.baseCanvas.height,
        { decodeSrgb: false }
      );

      try {
        const shapeIndex =
          options.carrier.shape === "diamond" ? 1 :
          options.carrier.shape === "line" ? 2 :
          options.carrier.shape === "square" ? 3 : 0;
        const colorModeIndex =
          options.carrier.colorMode === "cmyk" ? 1 :
          options.carrier.colorMode === "rgb" ? 2 : 0;

        const result = this.filterPipeline.runToTexture({
          baseWidth: options.carrier.width,
          baseHeight: options.carrier.height,
          passes: [
            {
              id: "halftone-carrier",
              programInfo: this.programs.halftoneCarrier,
              uniforms: {
                u_canvasSize: new Float32Array([options.carrier.width, options.carrier.height]),
                u_frequency: options.carrier.frequency,
                u_angle: options.carrier.angle,
                u_shape: shapeIndex,
                u_colorMode: colorModeIndex,
                u_dotScale: options.carrier.dotScale,
                u_contrast: options.carrier.contrast,
                u_invert: options.carrier.invert,
                u_backgroundColor: options.carrier.backgroundColorRgba,
                u_backgroundOpacity: options.carrier.backgroundOpacity,
              },
              outputFormat: "RGBA8",
              enabled: true,
            },
          ],
          input: {
            texture: source.texture,
            width: source.width,
            height: source.height,
            format: source.format,
          },
        });

        this.presentTextureResult(result, {
          inputLinear: false,
          enableDither: false,
        });
        result.release();
        return true;
      } finally {
        source.release();
      }
    } catch (error) {
      if (!this.contextLost) {
        reportGlError({
          op: "drawArrays",
          passId: "halftone-carrier-composite",
          rendererLabel: this.rendererLabel,
          cause: error,
        });
      }
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

  extractLinearPixelsFloat32(): Float32Array | null {
    if (this.destroyed || this.contextLost || !this.supportsFloatReadback) {
      return null;
    }
    const captured = this.capturedLinearResult;
    if (!captured || captured.format !== "RGBA16F") {
      return null;
    }
    const gl = this.gl;
    const fbo = gl.createFramebuffer();
    if (!fbo) {
      return null;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, captured.texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
      return null;
    }
    const pixels = new Float32Array(captured.width * captured.height * 4);
    gl.readPixels(0, 0, captured.width, captured.height, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    return pixels;
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
    this.gl.deleteTexture(this.fullMaskTexture);
    this.curveLutTexture = null as unknown as WebGLTexture;
    this.blueNoiseTexture = null as unknown as WebGLTexture;
    this.damageTexture = null as unknown as WebGLTexture;
    this.borderTexture = null as unknown as WebGLTexture;
    this.fallback3DLutTexture = null as unknown as WebGLTexture;
    this.fullMaskTexture = null as unknown as WebGLTexture;

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
