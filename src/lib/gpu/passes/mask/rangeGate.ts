/**
 * Local mask range gate — modulates a mask by luma/color range from source.
 *
 * Both source and mask are explicitly provided; neither comes from the pipeline.
 */

import { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";
import { requestGPUContext } from "../../context";
import {
  TexturePool,
  uploadExternalImageToTexture,
  readbackTextureRGBA8,
} from "../../resources";
import { PipelineExecutor, type PipelineInputSource } from "../../pipeline";
import {
  createRenderSurfaceHandle,
  createEmptyRenderBoundaryMetrics,
  type RenderSurfaceHandle,
} from "@/lib/renderSurfaceHandle";
import type { RenderMode } from "@/lib/renderer/RenderManager";
import type { LocalAdjustmentMask } from "@/types";
import {
  hasLocalMaskRangeConstraints,
  resolveLocalMaskColorRange,
  resolveLocalMaskLumaRange,
} from "@/lib/localMaskShared";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import rangeGateWgsl  from "../../wgsl/mask/rangeGate.wgsl?raw";

const rangeGateSource = `${fullscreenWgsl}\n${rangeGateWgsl}`;

// 4 vec4 = 64 bytes
const UNIFORM_BYTES = 64;

export interface RangeGateParams {
  useLumaRange: boolean;
  lumaMin: number;
  lumaMax: number;
  lumaFeather: number;
  useColorRange: boolean;
  hueCenter: number;
  hueRange: number;
  hueFeather: number;
  satMin: number;
  satFeather: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class RangeGatePipelineCache {
  private readonly device: GPUDevice;
  private readonly shaders: ShaderCache;
  private readonly byFormat = new Map<GPUTextureFormat, CompiledPipeline>();

  constructor(device: GPUDevice, shaders: ShaderCache) {
    this.device = device;
    this.shaders = shaders;
  }

  pipelineFor(format: GPUTextureFormat): CompiledPipeline {
    const cached = this.byFormat.get(format);
    if (cached) return cached;
    const module = this.shaders.compile(rangeGateSource, "mask/rangeGate.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "mask.rangeGate.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `mask.rangeGate.pipeline:${format}`,
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex:   { module, entryPoint: "vs_main" },
      fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
      primitive: { topology: "triangle-strip" },
    });
    const entry: CompiledPipeline = { pipeline, bindGroupLayout };
    this.byFormat.set(format, entry);
    return entry;
  }
}

export interface RangeGatePassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: RangeGateParams) => void;
  updateSource: (tex: GPUTexture) => void;
  updateMask: (tex: GPUTexture) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: RangeGateParams): void {
  const ab  = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  // flags @ 0
  u32[0] = p.useLumaRange  ? 1 : 0;
  u32[1] = p.useColorRange ? 1 : 0;
  // luma @ 16
  f32[4] = p.lumaMin; f32[5] = p.lumaMax; f32[6] = p.lumaFeather;
  // color @ 32
  f32[8]  = p.hueCenter; f32[9]  = p.hueRange; f32[10] = p.hueFeather; f32[11] = p.satMin;
  // color2 @ 48
  f32[12] = p.satFeather;
  device.queue.writeBuffer(buf, 0, ab);
}

export function createRangeGatePass(
  device: GPUDevice,
  cache: RangeGatePipelineCache,
  options: {
    outputFormat: GPUTextureFormat;
    params: RangeGateParams;
    /** Linear-light source image for range analysis. */
    sourceTexture: GPUTexture;
    /** Existing mask to modulate. */
    maskTexture: GPUTexture;
    id?: string;
    enabled?: boolean;
  },
): RangeGatePassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "mask.rangeGate.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  let srcView  = options.sourceTexture.createView({ label: "mask.rangeGate.src"  });
  let maskView = options.maskTexture.createView({   label: "mask.rangeGate.mask" });

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "mask.rangeGate",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "mask.rangeGate.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: srcView },
          { binding: 1, resource: maskView },
          { binding: 2, resource: ctx.defaultSampler },
          { binding: 3, resource: { buffer: uniformBuffer } },
        ],
      }),
    ],
    outputFormat: options.outputFormat,
    enabled: options.enabled ?? true,
    vertexCount: 4,
  };

  return {
    descriptor,
    updateParams: (next) => writeUniforms(device, uniformBuffer, next),
    updateSource: (tex) => { srcView  = tex.createView({ label: "mask.rangeGate.src"  }); },
    updateMask:   (tex) => { maskView = tex.createView({ label: "mask.rangeGate.mask" }); },
    destroy: () => uniformBuffer.destroy(),
  };
}

// ─── standalone surface op ────────────────────────────────────────────────────

interface DeviceCache {
  shaders: ShaderCache;
  rangeGate: RangeGatePipelineCache;
}

const _cacheByDevice = new WeakMap<GPUDevice, DeviceCache>();

const getCache = (device: GPUDevice): DeviceCache => {
  let entry = _cacheByDevice.get(device);
  if (!entry) {
    const shaders = new ShaderCache(device);
    entry = {
      shaders,
      rangeGate: new RangeGatePipelineCache(device, shaders),
    };
    _cacheByDevice.set(device, entry);
  }
  return entry;
};

const OUTPUT_FORMAT: GPUTextureFormat = "rgba8unorm";

const gateSourcesToPixels = async ({
  referenceSource,
  maskSource,
  width,
  height,
  mask,
}: {
  referenceSource: CanvasImageSource;
  maskSource: CanvasImageSource;
  width: number;
  height: number;
  mask: LocalAdjustmentMask;
}): Promise<{ pixels: Uint8Array; width: number; height: number } | null> => {
  if (width <= 0 || height <= 0) return null;
  if (!hasLocalMaskRangeConstraints(mask)) return null;

  const ctx = await requestGPUContext();
  const { device } = ctx;
  const { rangeGate } = getCache(device);
  const pool = new TexturePool(device);
  let referenceTexture: GPUTexture | null = null;
  let maskTexture: GPUTexture | null = null;
  let handle: RangeGatePassHandle | null = null;

  try {
    const referenceUpload = uploadExternalImageToTexture(device, referenceSource, {
      format: OUTPUT_FORMAT,
      label: "rangeGate:reference",
    });
    referenceTexture = referenceUpload.texture;
    const maskUpload = uploadExternalImageToTexture(device, maskSource, {
      format: OUTPUT_FORMAT,
      label: "rangeGate:mask",
    });
    maskTexture = maskUpload.texture;

    const sampler = device.createSampler({
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    const executor = new PipelineExecutor({ device, texturePool: pool, defaultSampler: sampler });

    const lumaRange = resolveLocalMaskLumaRange(mask);
    const colorRange = resolveLocalMaskColorRange(mask);
    const useLumaRange = !(lumaRange.min <= 0.0001 && lumaRange.max >= 0.9999);
    const useColorRange = !(colorRange.hueRange >= 179.999 && colorRange.satMin <= 1e-4);

    handle = createRangeGatePass(device, rangeGate, {
      outputFormat: OUTPUT_FORMAT,
      params: {
        useLumaRange,
        lumaMin: lumaRange.min,
        lumaMax: lumaRange.max,
        lumaFeather: lumaRange.feather,
        useColorRange,
        hueCenter: colorRange.hueCenter,
        hueRange: colorRange.hueRange,
        hueFeather: colorRange.hueFeather,
        satMin: colorRange.satMin,
        satFeather: colorRange.satFeather,
      },
      sourceTexture: referenceUpload.texture,
      maskTexture: maskUpload.texture,
      id: "local-mask-range-gate",
    });

    const referenceInput: PipelineInputSource = {
      texture: referenceUpload.texture,
      view: referenceUpload.texture.createView({ label: "rangeGate:referenceView" }),
      width,
      height,
      format: OUTPUT_FORMAT,
      lease: null,
    };

    const result = executor.execute({
      passes: [handle.descriptor],
      input: referenceInput,
      baseWidth: width,
      baseHeight: height,
    });
    if (result.kind !== "texture") return null;

    const pixels = await readbackTextureRGBA8(
      device,
      result.output.texture,
      width,
      height
    );
    result.output.release();

    return { pixels, width, height };
  } finally {
    handle?.destroy();
    referenceTexture?.destroy();
    maskTexture?.destroy();
    pool.dispose();
  }
};

const writePixelsToCanvas = (
  pixels: Uint8Array,
  width: number,
  height: number,
  targetCanvas: HTMLCanvasElement
): boolean => {
  if (targetCanvas.width !== width) targetCanvas.width = width;
  if (targetCanvas.height !== height) targetCanvas.height = height;
  const c2d = targetCanvas.getContext("2d");
  if (!c2d) return false;
  c2d.putImageData(
    new ImageData(new Uint8ClampedArray(pixels), width, height),
    0,
    0
  );
  return true;
};

export interface ApplyLocalMaskRangeOnSurfaceOptions {
  referenceSource: CanvasImageSource;
  maskSource: CanvasImageSource;
  width: number;
  height: number;
  mask: LocalAdjustmentMask;
  slotId?: string;
  mode?: RenderMode;
}

export const applyLocalMaskRangeOnSurface = async ({
  referenceSource,
  maskSource,
  width,
  height,
  mask,
  slotId = "local-mask-range",
  mode = "preview",
}: ApplyLocalMaskRangeOnSurfaceOptions): Promise<RenderSurfaceHandle | null> => {
  const gated = await gateSourcesToPixels({
    referenceSource,
    maskSource,
    width,
    height,
    mask,
  });
  if (!gated) return null;

  const canvas = document.createElement("canvas");
  if (!writePixelsToCanvas(gated.pixels, gated.width, gated.height, canvas)) {
    return null;
  }

  const metrics = createEmptyRenderBoundaryMetrics();
  metrics.cpuPixelReads += 1;

  return createRenderSurfaceHandle({
    kind: "owned-canvas",
    mode,
    slotId,
    sourceCanvas: canvas,
    metrics,
  });
};

export interface ApplyLocalMaskRangeOnCanvasOptions {
  /** In-place target. Both the upload source and the writeback destination. */
  maskCanvas: HTMLCanvasElement;
  referenceSource: CanvasImageSource;
  mask: LocalAdjustmentMask;
}

export const applyLocalMaskRangeOnCanvas = async ({
  maskCanvas,
  referenceSource,
  mask,
}: ApplyLocalMaskRangeOnCanvasOptions): Promise<boolean> => {
  if (maskCanvas.width <= 0 || maskCanvas.height <= 0) return false;
  const gated = await gateSourcesToPixels({
    referenceSource,
    maskSource: maskCanvas,
    width: maskCanvas.width,
    height: maskCanvas.height,
    mask,
  });
  if (!gated) return false;
  return writePixelsToCanvas(gated.pixels, gated.width, gated.height, maskCanvas);
};
