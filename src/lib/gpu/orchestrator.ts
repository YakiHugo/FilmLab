/**
 * WebGPU render orchestrator.
 * Named steps: fetchOrComputeSource → applyGeometry → runPipeline → composeLocal → produceSurface.
 */

import { requestGPUContext } from "@/lib/gpu/context";
import {
  TexturePool,
  uploadExternalImageToTexture,
  readbackTextureRGBA8,
  type ExternalImageSource,
  type PooledTexture,
} from "@/lib/gpu/resources";
import { ShaderCache } from "@/lib/gpu/shaders";
import { PipelineExecutor, type PipelineInputSource } from "@/lib/gpu/pipeline";
import { loadImageSource } from "@/lib/imageSourceLoader";
import type { RenderImageSource } from "@/lib/imageSourceLoader";
import {
  createGeometryUniforms,
  createPassthroughGeometryUniforms,
  resolveOrientedDimensions,
  resolveAspectRatio,
} from "@/lib/imageProcessingKeys";
import {
  resolveMasterUniforms,
  resolveHslUniformsFromState,
  resolveCurveUniformsFromState,
  resolveDetailUniformsFromState,
  resolveFilmUniformsV3,
  resolveHalationBloomUniformsV3,
} from "@/lib/renderer/uniformResolvers";
import { buildCurveLutPixels } from "@/lib/renderer/gpu/CurveLut";
import { encodeCurveLutToHalfFloats } from "@/lib/renderer/CurveLutEncoding";
import { resolveRenderProfileFromState } from "@/lib/film";
import { loadLut3DTexture, load2DTexture } from "@/lib/gpu/lutLoader";
import { fnv1a32 } from "@/lib/gpu/cacheKeys";
import {
  createRenderSurfaceHandle,
  createEmptyRenderBoundaryMetrics,
} from "@/lib/renderSurfaceHandle";
import type {
  BackendRenderOptions,
  BackendRenderResult,
} from "@/render/image/renderBackend";
import type { ImageProcessState, ImageRenderDevelopRegion } from "@/render/image/types";
import type { LocalAdjustmentDelta } from "@/types";

// --- develop passes ---
import { InputDecodePipelineCache, createInputDecodePass } from "@/lib/gpu/passes/develop/inputDecode";
import { GeometryPipelineCache, createGeometryPass } from "@/lib/gpu/passes/develop/geometry";
import { MasterPipelineCache, createMasterPass } from "@/lib/gpu/passes/develop/master";
import { HslPipelineCache, createHslPass } from "@/lib/gpu/passes/develop/hsl";
import { CurvePipelineCache, createCurvePass } from "@/lib/gpu/passes/develop/curve";
import { DetailPipelineCache, createDetailPass } from "@/lib/gpu/passes/develop/detail";
import { OutputEncodePipelineCache, createOutputEncodePass } from "@/lib/gpu/passes/develop/outputEncode";
// --- film passes ---
import { PrepPipelineCache, createPrepPass } from "@/lib/gpu/passes/film/prep";
import { ColorLutPipelineCache, createColorLutPass, createPlaceholderLut3D } from "@/lib/gpu/passes/film/colorLut";
import { PrintPipelineCache, createPrintPass } from "@/lib/gpu/passes/film/print";
import { GrainPipelineCache, createGrainPass } from "@/lib/gpu/passes/film/grain";
import { EffectsPipelineCache, createEffectsPass, createPlaceholder2D } from "@/lib/gpu/passes/film/effects";
// --- post passes ---
import { HalationThresholdPipelineCache, createHalationThresholdPass } from "@/lib/gpu/passes/post/halationThreshold";
import { HalationCompositePipelineCache, createHalationCompositePass } from "@/lib/gpu/passes/post/halationComposite";
import { GlowThresholdPipelineCache, createGlowThresholdPass } from "@/lib/gpu/passes/post/glowThreshold";
import { GlowCompositePipelineCache, createGlowCompositePass } from "@/lib/gpu/passes/post/glowComposite";
import { GaussianBlurPipelineCache, createGaussianBlurPass } from "@/lib/gpu/passes/utility/gaussianBlur";
// --- mask passes ---
import { LinearGradientPipelineCache, createLinearGradientPass } from "@/lib/gpu/passes/mask/linearGradient";
import { RadialGradientPipelineCache, createRadialGradientPass } from "@/lib/gpu/passes/mask/radialGradient";
import { BrushStampPipelineCache, createBrushStampPass } from "@/lib/gpu/passes/mask/brushStamp";
import { RangeGatePipelineCache, createRangeGatePass } from "@/lib/gpu/passes/mask/rangeGate";
import { MaskInvertPipelineCache } from "@/lib/gpu/passes/mask/maskInvert";
// --- utility ---
import { LayerBlendPipelineCache, createLayerBlendPass, createPlaceholderWhiteMask } from "@/lib/gpu/passes/utility/layerBlend";
import { PassthroughPipelineCache } from "@/lib/gpu/passes/utility/passthrough";
import type { GPURenderPassDescriptor } from "@/lib/gpu/passes/types";

// ─── constants ───────────────────────────────────────────────────────────────

const INTERNAL_FORMAT: GPUTextureFormat = "rgba16float";
const OUTPUT_FORMAT: GPUTextureFormat = "rgba8unorm";
const MASK_FORMAT: GPUTextureFormat = "rgba8unorm";
const CURVE_LUT_SIZE = 256;

// ─── per-device caches ────────────────────────────────────────────────────────

interface DeviceCaches {
  shaders: ShaderCache;
  inputDecode: InputDecodePipelineCache;
  geometry: GeometryPipelineCache;
  master: MasterPipelineCache;
  hsl: HslPipelineCache;
  curve: CurvePipelineCache;
  detail: DetailPipelineCache;
  outputEncode: OutputEncodePipelineCache;
  prep: PrepPipelineCache;
  colorLut: ColorLutPipelineCache;
  print: PrintPipelineCache;
  grain: GrainPipelineCache;
  effects: EffectsPipelineCache;
  halationThreshold: HalationThresholdPipelineCache;
  halationComposite: HalationCompositePipelineCache;
  glowThreshold: GlowThresholdPipelineCache;
  glowComposite: GlowCompositePipelineCache;
  gaussianBlur: GaussianBlurPipelineCache;
  linearGradient: LinearGradientPipelineCache;
  radialGradient: RadialGradientPipelineCache;
  brushStamp: BrushStampPipelineCache;
  rangeGate: RangeGatePipelineCache;
  maskInvert: MaskInvertPipelineCache;
  layerBlend: LayerBlendPipelineCache;
  passthrough: PassthroughPipelineCache;
  placeholder2D: GPUTexture;
  placeholder3D: GPUTexture;
  placeholderWhiteMask: GPUTexture;
}

const _cachesByDevice = new WeakMap<GPUDevice, DeviceCaches>();

function getOrCreateCaches(device: GPUDevice): DeviceCaches {
  const existing = _cachesByDevice.get(device);
  if (existing) return existing;
  const shaders = new ShaderCache(device);
  const caches: DeviceCaches = {
    shaders,
    inputDecode: new InputDecodePipelineCache(device, shaders),
    geometry: new GeometryPipelineCache(device, shaders),
    master: new MasterPipelineCache(device, shaders),
    hsl: new HslPipelineCache(device, shaders),
    curve: new CurvePipelineCache(device, shaders),
    detail: new DetailPipelineCache(device, shaders),
    outputEncode: new OutputEncodePipelineCache(device, shaders),
    prep: new PrepPipelineCache(device, shaders),
    colorLut: new ColorLutPipelineCache(device, shaders),
    print: new PrintPipelineCache(device, shaders),
    grain: new GrainPipelineCache(device, shaders),
    effects: new EffectsPipelineCache(device, shaders),
    halationThreshold: new HalationThresholdPipelineCache(device, shaders),
    halationComposite: new HalationCompositePipelineCache(device, shaders),
    glowThreshold: new GlowThresholdPipelineCache(device, shaders),
    glowComposite: new GlowCompositePipelineCache(device, shaders),
    gaussianBlur: new GaussianBlurPipelineCache(device, shaders),
    linearGradient: new LinearGradientPipelineCache(device, shaders),
    radialGradient: new RadialGradientPipelineCache(device, shaders),
    brushStamp: new BrushStampPipelineCache(device, shaders),
    rangeGate: new RangeGatePipelineCache(device, shaders),
    maskInvert: new MaskInvertPipelineCache(device, shaders),
    layerBlend: new LayerBlendPipelineCache(device, shaders),
    passthrough: new PassthroughPipelineCache(device, shaders),
    placeholder2D: createPlaceholder2D(device, "orchestrator.placeholder2D"),
    placeholder3D: createPlaceholderLut3D(device),
    placeholderWhiteMask: createPlaceholderWhiteMask(device),
  };
  _cachesByDevice.set(device, caches);
  return caches;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function loadStaticTextures(device: GPUDevice): Promise<{
  blueNoise: GPUTexture;
  damage: GPUTexture;
  border: GPUTexture;
}> {
  const [blueNoise, damage, border] = await Promise.all([
    load2DTexture(device, "/noise/blue-noise-64.png"),
    load2DTexture(device, "/textures/damage/default.png"),
    load2DTexture(device, "/textures/borders/default.png"),
  ]);
  return { blueNoise, damage, border };
}

function buildCurveLutTexture(device: GPUDevice, curveUniforms: ReturnType<typeof resolveCurveUniformsFromState>): GPUTexture {
  const pixels = buildCurveLutPixels(curveUniforms);
  const halfFloats = encodeCurveLutToHalfFloats(pixels, new Uint16Array(CURVE_LUT_SIZE * 4));
  const tex = device.createTexture({
    label: "orchestrator.curveLut",
    size: { width: CURVE_LUT_SIZE, height: 1 },
    format: "rgba16float",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: tex },
    halfFloats.buffer as ArrayBuffer,
    { bytesPerRow: CURVE_LUT_SIZE * 4 * 2 },
    { width: CURVE_LUT_SIZE, height: 1 },
  );
  return tex;
}

function resolveDimensions(
  srcW: number,
  srcH: number,
  targetSize: { width: number; height: number } | undefined,
  geometry: ImageProcessState["geometry"],
) {
  const oriented = resolveOrientedDimensions(srcW, srcH, geometry.rightAngleRotation);
  const targetRatio = resolveAspectRatio(
    geometry.aspectRatio,
    geometry.customAspectRatio,
    oriented.width / oriented.height,
  );
  const srcRatio = oriented.width / oriented.height;
  let cropW: number;
  let cropH: number;
  if (srcRatio > targetRatio) {
    cropH = oriented.height;
    cropW = cropH * targetRatio;
  } else {
    cropW = oriented.width;
    cropH = cropW / targetRatio;
  }
  const cropX = (oriented.width - cropW) / 2;
  const cropY = (oriented.height - cropH) / 2;

  let outputW = targetSize?.width ?? Math.round(cropW);
  let outputH = targetSize?.height ?? Math.round(cropH);
  if (!outputW || !outputH) {
    outputW = Math.round(cropW);
    outputH = Math.round(cropH);
  }

  const geoUniforms = createGeometryUniforms({
    cropX,
    cropY,
    cropWidth: cropW,
    cropHeight: cropH,
    sourceWidth: oriented.width,
    sourceHeight: oriented.height,
    outputWidth: outputW,
    outputHeight: outputH,
    geometry,
  });

  return { outputW, outputH, geoUniforms };
}

function applyDevelopDelta(base: ImageProcessState, delta: LocalAdjustmentDelta): ImageProcessState {
  const clamp = (v: number, lo = -100, hi = 100) => Math.min(hi, Math.max(lo, v));
  const t = { ...base.develop.tone };
  const c = { ...base.develop.color };
  const d = { ...base.develop.detail };
  if (delta.exposure !== undefined) t.exposure = clamp((t.exposure ?? 0) + delta.exposure);
  if (delta.contrast !== undefined) t.contrast = clamp((t.contrast ?? 0) + delta.contrast);
  if (delta.highlights !== undefined) t.highlights = clamp((t.highlights ?? 0) + delta.highlights);
  if (delta.shadows !== undefined) t.shadows = clamp((t.shadows ?? 0) + delta.shadows);
  if (delta.whites !== undefined) t.whites = clamp((t.whites ?? 0) + delta.whites);
  if (delta.blacks !== undefined) t.blacks = clamp((t.blacks ?? 0) + delta.blacks);
  if (delta.temperature !== undefined) c.temperature = clamp((c.temperature ?? 0) + delta.temperature);
  if (delta.tint !== undefined) c.tint = clamp((c.tint ?? 0) + delta.tint);
  if (delta.vibrance !== undefined) c.vibrance = clamp((c.vibrance ?? 0) + delta.vibrance);
  if (delta.saturation !== undefined) c.saturation = clamp((c.saturation ?? 0) + delta.saturation);
  if (delta.texture !== undefined) d.texture = clamp((d.texture ?? 0) + delta.texture);
  if (delta.clarity !== undefined) d.clarity = clamp((d.clarity ?? 0) + delta.clarity);
  if (delta.dehaze !== undefined) d.dehaze = clamp((d.dehaze ?? 0) + delta.dehaze);
  if (delta.sharpening !== undefined) d.sharpening = clamp((d.sharpening ?? 0) + delta.sharpening, 0, 100);
  if (delta.noiseReduction !== undefined) d.noiseReduction = clamp((d.noiseReduction ?? 0) + delta.noiseReduction, 0, 100);
  if (delta.colorNoiseReduction !== undefined) d.colorNoiseReduction = clamp((d.colorNoiseReduction ?? 0) + delta.colorNoiseReduction, 0, 100);
  return {
    ...base,
    develop: { ...base.develop, tone: t, color: c, detail: d, regions: [] },
  };
}

function makePlaceholderInput(caches: DeviceCaches): PipelineInputSource {
  return {
    texture: caches.placeholder2D,
    view: caches.placeholder2D.createView(),
    width: 1,
    height: 1,
    format: MASK_FORMAT,
    lease: null,
  };
}

// ─── develop chain ────────────────────────────────────────────────────────────

interface DevelopPassBuild {
  passes: readonly GPURenderPassDescriptor[];
  curveLutTex: GPUTexture;
  destroy: () => void;
}

function buildDevelopPasses(
  device: GPUDevice,
  caches: DeviceCaches,
  state: ImageProcessState,
  outputW: number,
  outputH: number,
  outputFormat: GPUTextureFormat,
  withOutputEncode: boolean,
  geoOverride?: ReturnType<typeof createGeometryUniforms>,
): DevelopPassBuild {
  const masterU = resolveMasterUniforms(
    state.develop.tone,
    state.develop.color,
    { dehaze: state.develop.detail.dehaze ?? 0 },
  );
  const hslU = resolveHslUniformsFromState(state.develop.color);
  const curveU = resolveCurveUniformsFromState(state.develop.color);
  const detailU = resolveDetailUniformsFromState(state.develop.detail, {
    shortEdgePx: Math.min(outputW, outputH),
  });

  const curveLutTex = buildCurveLutTexture(device, curveU);

  const inputDecode = createInputDecodePass(caches.inputDecode, { outputFormat: INTERNAL_FORMAT });

  const geoResolved = geoOverride ?? createPassthroughGeometryUniforms(outputW, outputH);
  const geoHandle = createGeometryPass(device, caches.geometry, {
    outputFormat: INTERNAL_FORMAT,
    params: geoResolved,
    enabled: true,
  });

  const masterHandle = createMasterPass(device, caches.master, {
    outputFormat: INTERNAL_FORMAT,
    params: masterU,
  });

  const hslHandle = createHslPass(device, caches.hsl, {
    outputFormat: INTERNAL_FORMAT,
    params: {
      hue: hslU.hue as [number,number,number,number,number,number,number,number],
      saturation: hslU.saturation as [number,number,number,number,number,number,number,number],
      luminance: hslU.luminance as [number,number,number,number,number,number,number,number],
      bwEnabled: hslU.bwEnabled,
      bwMix: hslU.bwMix as [number,number,number],
      calibrationEnabled: hslU.calibrationEnabled,
      calibrationHue: hslU.calibrationHue as [number,number,number],
      calibrationSaturation: hslU.calibrationSaturation as [number,number,number],
    },
    enabled: hslU.enabled,
  });

  const curveHandle = createCurvePass(device, caches.curve, {
    outputFormat: INTERNAL_FORMAT,
    curveLut: curveLutTex,
    enabled: curveU.enabled,
  });

  const detailHandle = createDetailPass(device, caches.detail, {
    outputFormat: INTERNAL_FORMAT,
    params: {
      texelSize: [1 / outputW, 1 / outputH],
      shortEdgePx: Math.min(outputW, outputH),
      texture: detailU.texture,
      clarity: detailU.clarity,
      sharpening: detailU.sharpening,
      sharpenRadius: detailU.sharpenRadius,
      sharpenDetail: detailU.sharpenDetail,
      masking: detailU.masking,
      noiseReduction: detailU.noiseReduction,
      colorNoiseReduction: detailU.colorNoiseReduction,
    },
    enabled: detailU.enabled,
  });

  const passes: GPURenderPassDescriptor[] = [
    inputDecode,
    geoHandle.descriptor,
    masterHandle.descriptor,
    hslHandle.descriptor,
    curveHandle.descriptor,
    detailHandle.descriptor,
  ];

  let encodeHandle: ReturnType<typeof createOutputEncodePass> | null = null;
  if (withOutputEncode) {
    encodeHandle = createOutputEncodePass(device, caches.outputEncode, {
      outputFormat,
      params: { outputSize: [outputW, outputH], inputLinear: true, enableDither: true, applyToneMap: false },
    });
    passes.push(encodeHandle.descriptor);
  }

  return {
    passes,
    curveLutTex,
    destroy: () => {
      curveLutTex.destroy();
      geoHandle.destroy();
      masterHandle.destroy();
      hslHandle.destroy();
      curveHandle.destroy();
      detailHandle.destroy();
      encodeHandle?.destroy();
    },
  };
}

// ─── film chain ───────────────────────────────────────────────────────────────

interface FilmPassBuild {
  /** inputDecode → effects, no encode */
  passesWithDecode: readonly GPURenderPassDescriptor[];
  /** prep → effects, no inputDecode and no encode */
  bodyPasses: readonly GPURenderPassDescriptor[];
  encodePass: GPURenderPassDescriptor;
  destroy: () => void;
}

async function buildFilmPasses(
  device: GPUDevice,
  caches: DeviceCaches,
  state: ImageProcessState,
  grainSeed: number,
  outputW: number,
  outputH: number,
  staticTextures: Awaited<ReturnType<typeof loadStaticTextures>>,
): Promise<FilmPassBuild> {
  const resolvedProfile = resolveRenderProfileFromState({
    film: state.film,
    develop: state.develop,
  });
  const filmU = resolveFilmUniformsV3(resolvedProfile.v3, { grainSeed });

  // Load LUT textures (cached by device)
  const [lut, lutBlend, customLut, printLut] = await Promise.all([
    resolvedProfile.lut
      ? loadLut3DTexture(device, resolvedProfile.lut.path, resolvedProfile.lut.size)
      : Promise.resolve(caches.placeholder3D),
    resolvedProfile.lutBlend
      ? loadLut3DTexture(device, resolvedProfile.lutBlend.path, resolvedProfile.lutBlend.size)
      : Promise.resolve(caches.placeholder3D),
    resolvedProfile.customLut
      ? loadLut3DTexture(device, resolvedProfile.customLut.path, resolvedProfile.customLut.size)
      : Promise.resolve(caches.placeholder3D),
    resolvedProfile.printLut
      ? loadLut3DTexture(device, resolvedProfile.printLut.path)
      : Promise.resolve(caches.placeholder3D),
  ]);

  const inputDecode = createInputDecodePass(caches.inputDecode, { outputFormat: INTERNAL_FORMAT });

  const prepHandle = createPrepPass(device, caches.prep, {
    outputFormat: INTERNAL_FORMAT,
    params: {
      expandEnabled: filmU.u_expandEnabled,
      expandBlackPoint: filmU.u_expandBlackPoint,
      expandWhitePoint: filmU.u_expandWhitePoint,
      compressionEnabled: filmU.u_filmCompressionEnabled,
      highlightRolloff: filmU.u_highlightRolloff,
      shoulderWidth: filmU.u_shoulderWidth,
      developerEnabled: filmU.u_filmDeveloperEnabled,
      developerContrast: filmU.u_developerContrast,
      developerGamma: filmU.u_developerGamma,
      colorSeparation: filmU.u_colorSeparation as [number, number, number],
      toneEnabled: filmU.u_toneEnabled,
      toneShoulder: filmU.u_shoulder,
      toneToe: filmU.u_toe,
      toneGamma: filmU.u_gamma,
      pushPullEv: filmU.u_pushPullEv,
    },
  });

  const colorLutHandle = createColorLutPass(device, caches.colorLut, {
    outputFormat: INTERNAL_FORMAT,
    params: {
      colorMatrixEnabled: filmU.u_colorMatrixEnabled,
      colorMatrix: filmU.u_colorMatrix,
      lutEnabled: filmU.u_lutEnabled,
      lutIntensity: filmU.u_lutIntensity,
      lutMixEnabled: filmU.u_lutMixEnabled,
      lutMixFactor: filmU.u_lutMixFactor,
      customLutEnabled: filmU.u_customLutEnabled,
      customLutIntensity: filmU.u_customLutIntensity,
    },
    lut,
    lutBlend,
    customLut,
  });

  const printHandle = createPrintPass(device, caches.print, {
    outputFormat: INTERNAL_FORMAT,
    params: {
      printEnabled: filmU.u_printEnabled,
      printDensity: filmU.u_printDensity,
      printContrast: filmU.u_printContrast,
      printWarmth: filmU.u_printWarmth,
      printStock: filmU.u_printStock,
      printLutEnabled: filmU.u_printLutEnabled,
      printLutIntensity: filmU.u_printLutIntensity,
      printTargetWhiteKelvin: filmU.u_printTargetWhiteKelvin,
      cmyEnabled: filmU.u_cmyColorHeadEnabled,
      cyan: filmU.u_cyan,
      magenta: filmU.u_magenta,
      yellow: filmU.u_yellow,
      colorCastEnabled: filmU.u_colorCastEnabled,
      colorCastShadows: filmU.u_colorCastShadows as [number, number, number],
      colorCastMidtones: filmU.u_colorCastMidtones as [number, number, number],
      colorCastHighlights: filmU.u_colorCastHighlights as [number, number, number],
      toningEnabled: filmU.u_printToningEnabled,
      toningShadows: filmU.u_toningShadows as [number, number, number],
      toningMidtones: filmU.u_toningMidtones as [number, number, number],
      toningHighlights: filmU.u_toningHighlights as [number, number, number],
      toningStrength: filmU.u_toningStrength,
    },
    printLut,
  });

  const grainHandle = createGrainPass(device, caches.grain, {
    outputFormat: INTERNAL_FORMAT,
    params: {
      enabled: filmU.u_grainEnabled,
      grainModel: filmU.u_grainModel,
      grainAmount: filmU.u_grainAmount,
      grainSize: filmU.u_grainSize,
      grainRoughness: filmU.u_grainRoughness,
      grainShadowBias: filmU.u_grainShadowBias,
      grainSeed: filmU.u_grainSeed,
      grainIsColor: filmU.u_grainIsColor,
      textureWidth: outputW,
      textureHeight: outputH,
      crystalDensity: filmU.u_crystalDensity,
      crystalSizeMean: filmU.u_crystalSizeMean,
      crystalSizeVariance: filmU.u_crystalSizeVariance,
      grainColorSeparation: filmU.u_grainColorSeparation as [number, number, number],
      scannerMTF: filmU.u_scannerMTF,
      filmFormat: filmU.u_filmFormat,
    },
    blueNoise: staticTextures.blueNoise,
    enabled: filmU.u_grainEnabled,
  });

  const effectsHandle = createEffectsPass(device, caches.effects, {
    outputFormat: INTERNAL_FORMAT,
    params: {
      vignetteEnabled: filmU.u_vignetteEnabled,
      vignetteAmount: filmU.u_vignetteAmount,
      vignetteMidpoint: filmU.u_vignetteMidpoint,
      vignetteRoundness: filmU.u_vignetteRoundness,
      aspectRatio: outputW / outputH,
      breathEnabled: filmU.u_filmBreathEnabled,
      breathAmount: filmU.u_breathAmount,
      breathSeed: filmU.u_breathSeed,
      damageEnabled: filmU.u_filmDamageEnabled,
      damageAmount: filmU.u_damageAmount,
      damageSeed: filmU.u_damageSeed,
      gateWeaveEnabled: filmU.u_gateWeaveEnabled,
      gateWeaveAmount: filmU.u_gateWeaveAmount,
      gateWeaveSeed: filmU.u_gateWeaveSeed,
      overscanEnabled: filmU.u_overscanEnabled,
      overscanAmount: filmU.u_overscanAmount,
      overscanRoundness: filmU.u_overscanRoundness,
    },
    damageTexture: staticTextures.damage,
    borderTexture: staticTextures.border,
  });

  const encodeHandle = createOutputEncodePass(device, caches.outputEncode, {
    outputFormat: OUTPUT_FORMAT,
    params: { outputSize: [outputW, outputH], inputLinear: true, enableDither: true, applyToneMap: false },
  });

  const bodyPasses = [prepHandle.descriptor, colorLutHandle.descriptor, printHandle.descriptor, grainHandle.descriptor, effectsHandle.descriptor];
  return {
    passesWithDecode: [inputDecode, ...bodyPasses],
    bodyPasses,
    encodePass: encodeHandle.descriptor,
    destroy: () => {
      prepHandle.destroy();
      colorLutHandle.destroy();
      printHandle.destroy();
      grainHandle.destroy();
      effectsHandle.destroy();
      encodeHandle.destroy();
    },
  };
}

// ─── halation / bloom / glow ──────────────────────────────────────────────────

function runHalationBloomGlow(
  filmTex: PooledTexture,
  device: GPUDevice,
  executor: PipelineExecutor,
  caches: DeviceCaches,
  halBloomU: ReturnType<typeof resolveHalationBloomUniformsV3>,
  outputW: number,
  outputH: number,
): PooledTexture {
  const anyHalationBloom = halBloomU.halationEnabled || halBloomU.bloomEnabled;
  const anyGlow = halBloomU.glowEnabled;
  if (!anyHalationBloom && !anyGlow) return filmTex;

  const filmInput: PipelineInputSource = {
    texture: filmTex.texture,
    view: filmTex.view,
    width: outputW,
    height: outputH,
    format: INTERNAL_FORMAT,
    lease: null,
  };

  // Phase 1: halation threshold + blur
  const halRadius = Math.max(1, halBloomU.halationRadius ?? 3);
  const threshHandle = createHalationThresholdPass(device, caches.halationThreshold, {
    outputFormat: INTERNAL_FORMAT,
    params: {
      halationThreshold: halBloomU.halationThreshold,
      bloomThreshold: halBloomU.bloomThreshold,
    },
    enabled: anyHalationBloom,
  });
  const blurH = createGaussianBlurPass(device, caches.gaussianBlur, {
    outputFormat: INTERNAL_FORMAT,
    params: { direction: [1 / outputW, 0], radius: halRadius },
    enabled: anyHalationBloom,
  });
  const blurV = createGaussianBlurPass(device, caches.gaussianBlur, {
    outputFormat: INTERNAL_FORMAT,
    params: { direction: [0, 1 / outputH], radius: halRadius },
    enabled: anyHalationBloom,
  });

  const blurResult = executor.execute({
    passes: [threshHandle.descriptor, blurH.descriptor, blurV.descriptor],
    input: filmInput,
    baseWidth: outputW,
    baseHeight: outputH,
  });
  threshHandle.destroy();
  blurH.destroy();
  blurV.destroy();

  let blurredTex: PooledTexture | null = null;
  if (blurResult.kind === "texture") blurredTex = blurResult.output;

  // Phase 2: halation+bloom composite
  const halCompHandle = createHalationCompositePass(device, caches.halationComposite, {
    outputFormat: INTERNAL_FORMAT,
    params: {
      halationEnabled: halBloomU.halationEnabled,
      halationIntensity: halBloomU.halationIntensity,
      halationHue: halBloomU.halationHue ?? 16,
      halationSaturation: halBloomU.halationSaturation ?? 0.75,
      halationBlueCompensation: halBloomU.halationBlueCompensation ?? 0,
      halationColor: (halBloomU.halationColor ?? [1, 0.3, 0.1]) as [number, number, number],
      bloomEnabled: halBloomU.bloomEnabled,
      bloomIntensity: halBloomU.bloomIntensity,
    },
    blurredMask: blurredTex?.texture ?? caches.placeholder2D,
    enabled: anyHalationBloom,
  });

  const compResult = executor.execute({
    passes: [halCompHandle.descriptor],
    input: filmInput,
    baseWidth: outputW,
    baseHeight: outputH,
  });
  halCompHandle.destroy();
  blurredTex?.release();

  let currentTex = filmTex;
  if (compResult.kind === "texture") {
    currentTex = compResult.output;
  }

  if (!anyGlow) {
    if (currentTex !== filmTex) filmTex.release();
    return currentTex;
  }

  // Phase 3: glow threshold + blur
  const glowRadius = Math.max(1, halBloomU.glowRadius ?? 4);
  const glowThreshHandle = createGlowThresholdPass(device, caches.glowThreshold, {
    outputFormat: INTERNAL_FORMAT,
    params: {
      glowEnabled: halBloomU.glowEnabled,
      glowIntensity: halBloomU.glowIntensity,
      glowMidtoneFocus: halBloomU.glowMidtoneFocus,
      glowBias: halBloomU.glowBias,
    },
    enabled: true,
  });
  const glowBlurH = createGaussianBlurPass(device, caches.gaussianBlur, {
    outputFormat: INTERNAL_FORMAT,
    params: { direction: [1 / outputW, 0], radius: glowRadius },
    enabled: true,
  });
  const glowBlurV = createGaussianBlurPass(device, caches.gaussianBlur, {
    outputFormat: INTERNAL_FORMAT,
    params: { direction: [0, 1 / outputH], radius: glowRadius },
    enabled: true,
  });

  const currentInput: PipelineInputSource = {
    texture: currentTex.texture,
    view: currentTex.view,
    width: outputW,
    height: outputH,
    format: INTERNAL_FORMAT,
    lease: null,
  };

  const glowBlurResult = executor.execute({
    passes: [glowThreshHandle.descriptor, glowBlurH.descriptor, glowBlurV.descriptor],
    input: currentInput,
    baseWidth: outputW,
    baseHeight: outputH,
  });
  glowThreshHandle.destroy();
  glowBlurH.destroy();
  glowBlurV.destroy();

  let glowBlurredTex: PooledTexture | null = null;
  if (glowBlurResult.kind === "texture") glowBlurredTex = glowBlurResult.output;

  // Phase 4: glow composite
  const glowCompHandle = createGlowCompositePass(device, caches.glowComposite, {
    outputFormat: INTERNAL_FORMAT,
    params: {
      glowEnabled: halBloomU.glowEnabled,
      glowIntensity: halBloomU.glowIntensity,
      glowBias: halBloomU.glowBias,
    },
    glowMask: glowBlurredTex?.texture ?? caches.placeholder2D,
    enabled: true,
  });

  const glowCompResult = executor.execute({
    passes: [glowCompHandle.descriptor],
    input: { ...currentInput, lease: currentTex === filmTex ? null : currentTex },
    baseWidth: outputW,
    baseHeight: outputH,
  });
  glowCompHandle.destroy();
  glowBlurredTex?.release();

  if (glowCompResult.kind === "texture") {
    filmTex.release();
    return glowCompResult.output;
  }
  if (currentTex !== filmTex) filmTex.release();
  return currentTex;
}

// ─── mask generation ──────────────────────────────────────────────────────────

function buildMask(
  device: GPUDevice,
  executor: PipelineExecutor,
  caches: DeviceCaches,
  region: ImageRenderDevelopRegion,
  state: ImageProcessState,
  sourceTex: PooledTexture,
  outputW: number,
  outputH: number,
): PooledTexture | null {
  const maskDef = state.masks.byId[region.maskId];
  if (!maskDef) return null;
  const { mask } = maskDef;

  let maskPasses: GPURenderPassDescriptor[] = [];
  const destroyFns: (() => void)[] = [];

  if (mask.mode === "linear") {
    const handle = createLinearGradientPass(device, caches.linearGradient, {
      outputFormat: MASK_FORMAT,
      params: {
        start: [mask.startX, mask.startY],
        end: [mask.endX, mask.endY],
        feather: mask.feather,
        invert: mask.invert ?? false,
      },
    });
    maskPasses = [handle.descriptor];
    destroyFns.push(() => handle.destroy());
  } else if (mask.mode === "radial") {
    const handle = createRadialGradientPass(device, caches.radialGradient, {
      outputFormat: MASK_FORMAT,
      params: {
        center: [mask.centerX, mask.centerY],
        radius: [mask.radiusX, mask.radiusY],
        feather: mask.feather,
        invert: mask.invert ?? false,
      },
    });
    maskPasses = [handle.descriptor];
    destroyFns.push(() => handle.destroy());
  } else if (mask.mode === "brush") {
    const radiusPx = mask.brushSize * Math.min(outputW, outputH) * 0.5;
    const innerRadiusPx = radiusPx * Math.max(0, 1 - mask.feather);
    for (const pt of mask.points) {
      const handle = createBrushStampPass(device, caches.brushStamp, {
        outputFormat: MASK_FORMAT,
        params: {
          canvasWidth: outputW,
          canvasHeight: outputH,
          centerPxX: pt.x * outputW,
          centerPxY: pt.y * outputH,
          radiusPx,
          innerRadiusPx,
          flow: mask.flow,
        },
      });
      maskPasses.push(handle.descriptor);
      destroyFns.push(() => handle.destroy());
    }
  }

  if (maskPasses.length === 0) return null;

  const maskResult = executor.execute({
    passes: maskPasses,
    input: makePlaceholderInput(caches),
    baseWidth: outputW,
    baseHeight: outputH,
  });
  destroyFns.forEach((fn) => fn());

  if (maskResult.kind !== "texture") return null;
  let maskTex = maskResult.output;

  // optional range gate
  const hasLuma = mask.lumaMin !== undefined || mask.lumaMax !== undefined;
  const hasColor = mask.hueCenter !== undefined || mask.satMin !== undefined;
  if (hasLuma || hasColor) {
    const rgHandle = createRangeGatePass(device, caches.rangeGate, {
      outputFormat: MASK_FORMAT,
      params: {
        useLumaRange: hasLuma,
        lumaMin: mask.lumaMin ?? 0,
        lumaMax: mask.lumaMax ?? 1,
        lumaFeather: mask.lumaFeather ?? 0.1,
        useColorRange: hasColor,
        hueCenter: mask.hueCenter ?? 0,
        hueRange: mask.hueRange ?? 30,
        hueFeather: mask.hueFeather ?? 15,
        satMin: mask.satMin ?? 0,
        satFeather: mask.satFeather ?? 0.1,
      },
      sourceTexture: sourceTex.texture,
      maskTexture: maskTex.texture,
    });
    const gated = executor.execute({
      passes: [rgHandle.descriptor],
      input: makePlaceholderInput(caches),
      baseWidth: outputW,
      baseHeight: outputH,
    });
    rgHandle.destroy();
    maskTex.release();
    if (gated.kind !== "texture") return null;
    maskTex = gated.output;
  }

  return maskTex;
}

// ─── local adjustments ────────────────────────────────────────────────────────

async function composeLocalAdjustments(
  device: GPUDevice,
  executor: PipelineExecutor,
  caches: DeviceCaches,
  srcInput: PipelineInputSource,
  baseTex: PooledTexture,
  state: ImageProcessState,
  outputW: number,
  outputH: number,
): Promise<PooledTexture> {
  const regions = state.develop.regions.filter((r) => r.enabled && r.amount > 0);
  if (regions.length === 0) return baseTex;

  let currentTex = baseTex;

  for (const region of regions) {
    // Build mask
    const maskTex = buildMask(device, executor, caches, region, state, currentTex, outputW, outputH);
    if (!maskTex) continue;

    // Run develop with delta-applied state
    const deltaState = applyDevelopDelta(state, region.adjustments);
    const localBuild = buildDevelopPasses(device, caches, deltaState, outputW, outputH, INTERNAL_FORMAT, false);
    const localResult = executor.execute({
      passes: localBuild.passes,
      input: srcInput,
      baseWidth: outputW,
      baseHeight: outputH,
    });
    localBuild.destroy();

    if (localResult.kind !== "texture") {
      maskTex.release();
      continue;
    }
    const localTex = localResult.output;

    // Layer blend: base=currentTex, layer=localTex, mask=maskTex, opacity=amount/100
    const blendHandle = createLayerBlendPass(device, caches.layerBlend, {
      outputFormat: INTERNAL_FORMAT,
      params: {
        blendMode: 0,
        useMask: true,
        invertMask: false,
        opacity: region.amount / 100,
      },
      layerTexture: localTex.texture,
      maskTexture: maskTex.texture,
    });

    const blendResult = executor.execute({
      passes: [blendHandle.descriptor],
      input: {
        texture: currentTex.texture,
        view: currentTex.view,
        width: outputW,
        height: outputH,
        format: INTERNAL_FORMAT,
        lease: currentTex !== baseTex ? currentTex : null,
      },
      baseWidth: outputW,
      baseHeight: outputH,
    });
    blendHandle.destroy();
    localTex.release();
    maskTex.release();

    if (blendResult.kind === "texture") {
      currentTex = blendResult.output;
    } else {
      currentTex = baseTex;
    }
  }

  return currentTex;
}

// ─── surface production ───────────────────────────────────────────────────────

async function produceSurface(
  device: GPUDevice,
  outputTex: PooledTexture,
  outputW: number,
  outputH: number,
  options: BackendRenderOptions,
): Promise<BackendRenderResult> {
  const pixels = await readbackTextureRGBA8(device, outputTex.texture, outputW, outputH);
  outputTex.release();

  const canvas = document.createElement("canvas");
  canvas.width = outputW;
  canvas.height = outputH;
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("Failed to acquire 2d context for WebGPU output canvas");
  ctx2d.putImageData(new ImageData(new Uint8ClampedArray(pixels), outputW, outputH), 0, 0);

  const metrics = createEmptyRenderBoundaryMetrics();
  metrics.cpuPixelReads += 1;

  const surface = createRenderSurfaceHandle({
    kind: "owned-canvas",
    mode: options.mode ?? "preview",
    slotId: options.renderSlot ?? "webgpu",
    sourceCanvas: canvas,
    metrics,
  });

  return { stageId: "full", surface, backendStatus: "rendered" };
}

// ─── public render functions ──────────────────────────────────────────────────

export async function renderDevelopBase(options: BackendRenderOptions): Promise<BackendRenderResult> {
  const gpuCtx = await requestGPUContext();
  const { device } = gpuCtx;
  const pool = new TexturePool(device);

  try {
    // fetchOrComputeSource
    const loaded = await loadImageSource(options.source as RenderImageSource, { signal: options.signal });
    const { texture: srcTex, width: srcW, height: srcH } = uploadExternalImageToTexture(
      device,
      loaded.source as ExternalImageSource,
      { label: "orchestrator.develop:source" },
    );

    // applyGeometry
    const { outputW, outputH, geoUniforms } = resolveDimensions(srcW, srcH, options.targetSize, options.state.geometry);

    const srcInput: PipelineInputSource = {
      texture: srcTex,
      view: srcTex.createView({ label: "orchestrator.develop:srcView" }),
      width: srcW,
      height: srcH,
      format: OUTPUT_FORMAT,
      lease: null,
    };

    const sampler = device.createSampler({ minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    const executor = new PipelineExecutor({ device, texturePool: pool, defaultSampler: sampler });

    // runPipeline — develop
    const caches = getOrCreateCaches(device);
    const devBuild = buildDevelopPasses(device, caches, options.state, outputW, outputH, INTERNAL_FORMAT, false, geoUniforms);
    const devResult = executor.execute({ passes: devBuild.passes, input: srcInput, baseWidth: outputW, baseHeight: outputH });
    devBuild.destroy();

    if (devResult.kind !== "texture") throw new Error("Develop pipeline produced no output");
    let baseTex = devResult.output;

    // composeLocal — srcInput must remain valid until all local adjustments are done
    baseTex = await composeLocalAdjustments(device, executor, caches, srcInput, baseTex, options.state, outputW, outputH);
    srcTex.destroy();
    loaded.cleanup?.();

    // produceSurface — encode to rgba8unorm
    const encodeHandle = createOutputEncodePass(device, caches.outputEncode, {
      outputFormat: OUTPUT_FORMAT,
      params: { outputSize: [outputW, outputH], inputLinear: true, enableDither: true, applyToneMap: false },
    });
    const encodeResult = executor.execute({
      passes: [encodeHandle.descriptor],
      input: { texture: baseTex.texture, view: baseTex.view, width: outputW, height: outputH, format: INTERNAL_FORMAT, lease: baseTex },
      baseWidth: outputW,
      baseHeight: outputH,
    });
    encodeHandle.destroy();
    if (encodeResult.kind !== "texture") throw new Error("Output encode produced no result");

    return await produceSurface(device, encodeResult.output, outputW, outputH, options);
  } finally {
    pool.dispose();
    gpuCtx.dispose();
  }
}

export async function renderFilmStage(options: BackendRenderOptions): Promise<BackendRenderResult> {
  const gpuCtx = await requestGPUContext();
  const { device } = gpuCtx;
  const pool = new TexturePool(device);

  try {
    // fetchOrComputeSource (source is already a develop-stage canvas)
    const loaded = await loadImageSource(options.source as RenderImageSource, { signal: options.signal });
    const { texture: srcTex, width: outputW, height: outputH } = uploadExternalImageToTexture(
      device,
      loaded.source as ExternalImageSource,
      { label: "orchestrator.film:source" },
    );

    const srcInput: PipelineInputSource = {
      texture: srcTex,
      view: srcTex.createView({ label: "orchestrator.film:srcView" }),
      width: outputW,
      height: outputH,
      format: OUTPUT_FORMAT,
      lease: null,
    };

    const sampler = device.createSampler({ minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    const executor = new PipelineExecutor({ device, texturePool: pool, defaultSampler: sampler });
    const caches = getOrCreateCaches(device);

    const grainSeed = parseInt(fnv1a32(options.seedKey ?? `${Date.now()}`), 16);
    const staticTextures = await loadStaticTextures(device);
    const resolvedProfile = resolveRenderProfileFromState({ film: options.state.film, develop: options.state.develop });
    const halBloomU = resolveHalationBloomUniformsV3(resolvedProfile.v3);

    // runPipeline — film (inputDecode → prep → colorLut → print → grain → effects)
    const filmBuild = await buildFilmPasses(device, caches, options.state, grainSeed, outputW, outputH, staticTextures);
    try {
      const filmResult = executor.execute({ passes: filmBuild.passesWithDecode, input: srcInput, baseWidth: outputW, baseHeight: outputH });

      if (filmResult.kind !== "texture") {
        srcTex.destroy();
        loaded.cleanup?.();
        throw new Error("Film pipeline produced no output");
      }
      srcTex.destroy();
      loaded.cleanup?.();

      // halation / bloom / glow
      const postTex = runHalationBloomGlow(filmResult.output, device, executor, caches, halBloomU, outputW, outputH);

      // final encode
      const encodeResult = executor.execute({
        passes: [filmBuild.encodePass],
        input: { texture: postTex.texture, view: postTex.view, width: outputW, height: outputH, format: INTERNAL_FORMAT, lease: postTex },
        baseWidth: outputW,
        baseHeight: outputH,
      });
      if (encodeResult.kind !== "texture") throw new Error("Output encode produced no result");

      return await produceSurface(device, encodeResult.output, outputW, outputH, options);
    } finally {
      filmBuild.destroy();
    }
  } finally {
    pool.dispose();
    gpuCtx.dispose();
  }
}

export async function renderFull(options: BackendRenderOptions): Promise<BackendRenderResult> {
  const gpuCtx = await requestGPUContext();
  const { device } = gpuCtx;
  const pool = new TexturePool(device);

  try {
    // fetchOrComputeSource
    const loaded = await loadImageSource(options.source as RenderImageSource, { signal: options.signal });
    const { texture: srcTex, width: srcW, height: srcH } = uploadExternalImageToTexture(
      device,
      loaded.source as ExternalImageSource,
      { label: "orchestrator.full:source" },
    );

    // applyGeometry
    const { outputW, outputH, geoUniforms } = resolveDimensions(srcW, srcH, options.targetSize, options.state.geometry);

    const srcInput: PipelineInputSource = {
      texture: srcTex,
      view: srcTex.createView({ label: "orchestrator.full:srcView" }),
      width: srcW,
      height: srcH,
      format: OUTPUT_FORMAT,
      lease: null,
    };

    const sampler = device.createSampler({ minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    const executor = new PipelineExecutor({ device, texturePool: pool, defaultSampler: sampler });
    const caches = getOrCreateCaches(device);

    // runPipeline — develop (no outputEncode, stay linear)
    const devBuild = buildDevelopPasses(device, caches, options.state, outputW, outputH, INTERNAL_FORMAT, false, geoUniforms);
    const devResult = executor.execute({ passes: devBuild.passes, input: srcInput, baseWidth: outputW, baseHeight: outputH });
    devBuild.destroy();

    if (devResult.kind !== "texture") throw new Error("Develop pipeline produced no output");
    let developTex = devResult.output;

    // composeLocal
    developTex = await composeLocalAdjustments(device, executor, caches, srcInput, developTex, options.state, outputW, outputH);

    srcTex.destroy();
    loaded.cleanup?.();

    // runPipeline — film (no inputDecode since source is already linear rgba16float)
    const grainSeed = parseInt(fnv1a32(options.seedKey ?? `${Date.now()}`), 16);
    const staticTextures = await loadStaticTextures(device);
    const resolvedProfile = resolveRenderProfileFromState({ film: options.state.film, develop: options.state.develop });
    const halBloomU = resolveHalationBloomUniformsV3(resolvedProfile.v3);

    const filmBuild = await buildFilmPasses(device, caches, options.state, grainSeed, outputW, outputH, staticTextures);
    try {
      // bodyPasses skips inputDecode — develop output is already linear rgba16float
      const filmResult = executor.execute({
        passes: filmBuild.bodyPasses,
        input: { texture: developTex.texture, view: developTex.view, width: outputW, height: outputH, format: INTERNAL_FORMAT, lease: developTex },
        baseWidth: outputW,
        baseHeight: outputH,
      });

      if (filmResult.kind !== "texture") throw new Error("Film pipeline produced no output");

      // halation / bloom / glow
      const postTex = runHalationBloomGlow(filmResult.output, device, executor, caches, halBloomU, outputW, outputH);

      // final encode
      const encodeResult = executor.execute({
        passes: [filmBuild.encodePass],
        input: { texture: postTex.texture, view: postTex.view, width: outputW, height: outputH, format: INTERNAL_FORMAT, lease: postTex },
        baseWidth: outputW,
        baseHeight: outputH,
      });
      if (encodeResult.kind !== "texture") throw new Error("Output encode produced no result");

      return await produceSurface(device, encodeResult.output, outputW, outputH, options);
    } finally {
      filmBuild.destroy();
    }
  } finally {
    pool.dispose();
    gpuCtx.dispose();
  }
}
