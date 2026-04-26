/**
 * Detail pass — texture, clarity, sharpening, in-pass noise reduction.
 * Mirrors `shaders/Detail.frag`.
 *
 * Uniform layout matches `wgsl/develop/detail.wgsl::DetailParams`.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import colorSpaceWgsl from "../../wgsl/lib/colorSpace.wgsl?raw";
import detailWgsl from "../../wgsl/develop/detail.wgsl?raw";

const detailSource = `${fullscreenWgsl}\n${colorSpaceWgsl}\n${detailWgsl}`;

// 4 vec4 = 64 bytes.
const UNIFORM_BYTES = 4 * 16;

export interface DetailPassParams {
  texelSize: readonly [number, number];
  /** Short-edge pixel count. Pass 0 to derive from texelSize. */
  shortEdgePx: number;
  texture: number;
  clarity: number;
  sharpening: number;
  sharpenRadius: number;
  sharpenDetail: number;
  masking: number;
  noiseReduction: number;
  colorNoiseReduction: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class DetailPipelineCache {
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
    const module = this.shaders.compile(detailSource, "develop/detail.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "develop.detail.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `develop.detail.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "develop.detail.pipelineLayout",
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

export interface DetailPassOptions {
  outputFormat: GPUTextureFormat;
  params: DetailPassParams;
  id?: string;
  enabled?: boolean;
}

function writeUniforms(device: GPUDevice, buffer: GPUBuffer, p: DetailPassParams): void {
  const ab = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  // texelSize_shortEdge_pad @0
  f32[0] = p.texelSize[0]; f32[1] = p.texelSize[1]; f32[2] = p.shortEdgePx; f32[3] = 0;
  // scalars0 @16
  f32[4] = p.texture; f32[5] = p.clarity; f32[6] = p.sharpening; f32[7] = p.sharpenRadius;
  // scalars1 @32
  f32[8] = p.sharpenDetail; f32[9] = p.masking; f32[10] = p.noiseReduction; f32[11] = p.colorNoiseReduction;
  // flags @48: enabled
  u32[12] = 1; u32[13] = 0; u32[14] = 0; u32[15] = 0;
  device.queue.writeBuffer(buffer, 0, ab);
}

export interface DetailPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: DetailPassParams) => void;
  destroy: () => void;
}

export function createDetailPass(
  device: GPUDevice,
  cache: DetailPipelineCache,
  options: DetailPassOptions,
): DetailPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "develop.detail.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "develop.detail",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "develop.detail.bindGroup",
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
