/**
 * Filter2D post-processing — port of `shaders/Filter2dAdjust.frag`. The WGSL
 * pass below is brightness + hue only; `applyFilter2dOnSurface` composes
 * adjust → blur(h) → blur(v) → dilate via the existing utility passes.
 */

import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";
import { requestGPUContext } from "../../context";
import {
  TexturePool,
  uploadExternalImageToTexture,
  readbackTextureRGBA8,
} from "../../resources";
import { ShaderCache } from "../../shaders";
import { PipelineExecutor, type PipelineInputSource } from "../../pipeline";
import { createPerDeviceCache } from "../../perDeviceCache";
import {
  createRenderSurfaceHandle,
  createEmptyRenderBoundaryMetrics,
  type RenderSurfaceHandle,
} from "@/lib/renderSurfaceHandle";
import type { RenderMode } from "@/lib/renderMode";
import {
  clampFilter2dValue,
  resolveBlurRadiusPx,
  resolveDilateRadiusPx,
  type Filter2dPostProcessingParams,
} from "@/lib/filter2dShared";

import {
  GaussianBlurPipelineCache,
  createGaussianBlurPass,
  type GaussianBlurPassHandle,
} from "../utility/gaussianBlur";
import {
  DilatePipelineCache,
  createDilatePass,
  type DilatePassHandle,
} from "../utility/dilate";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import filter2dAdjustWgsl from "../../wgsl/post/filter2dAdjust.wgsl?raw";

const filter2dAdjustSource = `${fullscreenWgsl}\n${filter2dAdjustWgsl}`;

// 1 vec4 = 16 bytes.
const UNIFORM_BYTES = 16;

export interface Filter2dAdjustPassParams {
  /** Multiplicative factor (>= 0). 1.0 is identity. */
  brightnessFactor: number;
  /** Hue rotation in radians; 0 is identity. */
  hueRadians: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

class Filter2dAdjustPipelineCache {
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
    const module = this.shaders.compile(filter2dAdjustSource, "post/filter2dAdjust.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "post.filter2dAdjust.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `post.filter2dAdjust.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "post.filter2dAdjust.pipelineLayout",
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: { module, entryPoint: "vs_main" },
      fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
      primitive: { topology: "triangle-strip" },
    });
    const entry: CompiledPipeline = { pipeline, bindGroupLayout };
    this.byFormat.set(format, entry);
    return entry;
  }
}

function writeUniforms(device: GPUDevice, buffer: GPUBuffer, p: Filter2dAdjustPassParams): void {
  const ab = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  f32[0] = p.brightnessFactor;
  f32[1] = p.hueRadians;
  f32[2] = 0;
  f32[3] = 0;
  device.queue.writeBuffer(buffer, 0, ab);
}

interface Filter2dAdjustPassOptions {
  outputFormat: GPUTextureFormat;
  params: Filter2dAdjustPassParams;
  id?: string;
  enabled?: boolean;
}

interface Filter2dAdjustPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: Filter2dAdjustPassParams) => void;
  destroy: () => void;
}

function createFilter2dAdjustPass(
  device: GPUDevice,
  cache: Filter2dAdjustPipelineCache,
  options: Filter2dAdjustPassOptions
): Filter2dAdjustPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "post.filter2dAdjust.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "post.filter2dAdjust",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "post.filter2dAdjust.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: ctx.priorInputView },
          { binding: 1, resource: ctx.defaultSampler },
          { binding: 2, resource: { buffer: uniformBuffer } },
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
    destroy: () => uniformBuffer.destroy(),
  };
}

// ─── standalone surface op ────────────────────────────────────────────────────

const getCache = createPerDeviceCache((device) => {
  const shaders = new ShaderCache(device);
  return {
    shaders,
    filter2dAdjust: new Filter2dAdjustPipelineCache(device, shaders),
    gaussianBlur: new GaussianBlurPipelineCache(device, shaders),
    dilate: new DilatePipelineCache(device, shaders),
  };
});

const OUTPUT_FORMAT: GPUTextureFormat = "rgba8unorm";

export interface ApplyFilter2dOnSurfaceOptions {
  surface: RenderSurfaceHandle;
  params: Filter2dPostProcessingParams;
  slotId?: string;
  mode?: RenderMode;
}

export const applyFilter2dOnSurface = async ({
  surface,
  params,
  slotId = "filter2d-postprocess",
  mode,
}: ApplyFilter2dOnSurfaceOptions): Promise<RenderSurfaceHandle | null> => {
  if (surface.width <= 0 || surface.height <= 0) return null;

  const ctx = await requestGPUContext();
  const { device } = ctx;
  const caches = getCache(device);
  const pool = new TexturePool(device);
  let uploadTexture: GPUTexture | null = null;
  let adjustHandle: Filter2dAdjustPassHandle | null = null;
  let blurHHandle: GaussianBlurPassHandle | null = null;
  let blurVHandle: GaussianBlurPassHandle | null = null;
  let dilateHandle: DilatePassHandle | null = null;

  try {
    const upload = uploadExternalImageToTexture(device, surface.sourceCanvas, {
      format: OUTPUT_FORMAT,
      label: "filter2d:source",
    });
    uploadTexture = upload.texture;
    const srcInput: PipelineInputSource = {
      texture: upload.texture,
      view: upload.texture.createView({ label: "filter2d:srcView" }),
      width: upload.width,
      height: upload.height,
      format: OUTPUT_FORMAT,
      lease: null,
    };

    const sampler = device.createSampler({
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    const executor = new PipelineExecutor({ device, texturePool: pool, defaultSampler: sampler });

    const targetWidth = upload.width;
    const targetHeight = upload.height;
    const shortEdge = Math.min(targetWidth, targetHeight);
    const brightnessFactor = Math.max(
      0,
      1 + clampFilter2dValue(params.brightness, -100, 100) / 100
    );
    const hueRadians =
      (clampFilter2dValue(params.hue, -100, 100) / 100) * Math.PI;
    const blurRadius = resolveBlurRadiusPx(params.blur, shortEdge);
    const dilateRadius = resolveDilateRadiusPx(params.dilate, shortEdge);

    const adjustEnabled =
      Math.abs(params.brightness) > 0.001 || Math.abs(params.hue) > 0.001;
    const blurEnabled = blurRadius > 0.001;
    const dilateEnabled = dilateRadius > 0;

    const passes: GPURenderPassDescriptor[] = [];
    if (adjustEnabled) {
      adjustHandle = createFilter2dAdjustPass(device, caches.filter2dAdjust, {
        outputFormat: OUTPUT_FORMAT,
        params: { brightnessFactor, hueRadians },
        id: "filter2d-adjust",
      });
      passes.push(adjustHandle.descriptor);
    }
    if (blurEnabled) {
      blurHHandle = createGaussianBlurPass(device, caches.gaussianBlur, {
        outputFormat: OUTPUT_FORMAT,
        params: { direction: [1 / targetWidth, 0], radius: Math.max(blurRadius, 1) },
        id: "filter2d-blur-h",
      });
      blurVHandle = createGaussianBlurPass(device, caches.gaussianBlur, {
        outputFormat: OUTPUT_FORMAT,
        params: { direction: [0, 1 / targetHeight], radius: Math.max(blurRadius, 1) },
        id: "filter2d-blur-v",
      });
      passes.push(blurHHandle.descriptor, blurVHandle.descriptor);
    }
    if (dilateEnabled) {
      dilateHandle = createDilatePass(device, caches.dilate, {
        outputFormat: OUTPUT_FORMAT,
        params: { texelSize: [1 / targetWidth, 1 / targetHeight], radius: dilateRadius },
        id: "filter2d-dilate",
      });
      passes.push(dilateHandle.descriptor);
    }

    let outputPixels: Uint8Array | null = null;
    if (passes.length === 0) {
      outputPixels = await readbackTextureRGBA8(
        device,
        upload.texture,
        targetWidth,
        targetHeight
      );
    } else {
      const result = executor.execute({
        passes,
        input: srcInput,
        baseWidth: targetWidth,
        baseHeight: targetHeight,
      });
      if (result.kind !== "texture") return null;
      outputPixels = await readbackTextureRGBA8(
        device,
        result.output.texture,
        targetWidth,
        targetHeight
      );
      result.output.release();
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const c2d = canvas.getContext("2d");
    if (!c2d) return null;
    c2d.putImageData(
      new ImageData(new Uint8ClampedArray(outputPixels), targetWidth, targetHeight),
      0,
      0
    );

    const metrics = createEmptyRenderBoundaryMetrics();
    metrics.cpuPixelReads += 1;

    return createRenderSurfaceHandle({
      kind: "owned-canvas",
      mode: mode ?? surface.mode,
      slotId,
      sourceCanvas: canvas,
      metrics,
    });
  } finally {
    adjustHandle?.destroy();
    blurHHandle?.destroy();
    blurVHandle?.destroy();
    dilateHandle?.destroy();
    uploadTexture?.destroy();
    pool.dispose();
  }
};
