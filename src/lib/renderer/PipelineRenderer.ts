import * as twgl from "twgl.js";
import { LUTCache } from "./LUTCache";
import { buildMainPasses } from "./PassBuilder";
import {
  DEFERRED_WARMUP_PROGRAMS,
  createPrograms,
  type RendererPrograms,
} from "./ProgramRegistry";
import {
  createBilateralPassUniforms,
  createBlurPassUniforms,
  createCompositePassUniforms,
  createCurvePassUniforms,
  createDetailPassUniforms,
  createDownsamplePassUniforms,
  createFilmPassUniforms,
  createGeometryPassUniforms,
  createGlowCompositePassUniforms,
  createGlowThresholdPassUniforms,
  createHslPassUniforms,
  createMasterPassUniforms,
  createOutputEncodeUniforms,
  createReconstructPassUniforms,
  createThresholdPassUniforms,
} from "./PassUniformStateFactory";
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

  private readonly geometryPassUniforms = createGeometryPassUniforms();
  private readonly masterPassUniforms = createMasterPassUniforms();
  private readonly hslPassUniforms = createHslPassUniforms();
  private readonly curvePassUniforms: Record<string, unknown> = createCurvePassUniforms();
  private readonly detailPassUniforms = createDetailPassUniforms();
  private readonly filmPassUniforms: Record<string, unknown> = createFilmPassUniforms();
  private readonly thresholdPassUniforms = createThresholdPassUniforms();
  private readonly glowThresholdPassUniforms = createGlowThresholdPassUniforms();
  private readonly blurHPassUniforms = createBlurPassUniforms();
  private readonly blurVPassUniforms = createBlurPassUniforms();
  private readonly glowBlurHPassUniforms = createBlurPassUniforms();
  private readonly glowBlurVPassUniforms = createBlurPassUniforms();
  private readonly compositePassUniforms = createCompositePassUniforms();
  private readonly glowCompositePassUniforms = createGlowCompositePassUniforms();
  private readonly downsamplePassUniforms = createDownsamplePassUniforms();
  private readonly bilateralHalfPassUniforms = createBilateralPassUniforms(0.045);
  private readonly bilateralQuarterPassUniforms = createBilateralPassUniforms(0.06);
  private readonly reconstructPassUniforms = createReconstructPassUniforms();
  private readonly outputEncodeUniforms = createOutputEncodeUniforms();
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
        this.drawLinearToCanvas(texture, width, height, format),
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
