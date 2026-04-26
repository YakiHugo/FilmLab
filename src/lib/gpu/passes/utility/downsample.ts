/**
 * 4-corner box filter downsample pass.
 *
 * Set `texelSize` to (0.5/srcWidth, 0.5/srcHeight) for a 2× downsample.
 * Typically combined with `resolution: 0.5` in the pass options so the
 * executor allocates a half-size output texture.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl  from "../../wgsl/lib/fullscreen.wgsl?raw";
import downsampleWgsl  from "../../wgsl/utility/downsample.wgsl?raw";

const downsampleSource = `${fullscreenWgsl}\n${downsampleWgsl}`;

const UNIFORM_BYTES = 16;

export interface DownsampleParams {
  texelSize: readonly [number, number];
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class DownsamplePipelineCache {
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
    const module = this.shaders.compile(downsampleSource, "utility/downsample.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "utility.downsample.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `utility.downsample.pipeline:${format}`,
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

export interface DownsamplePassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: DownsampleParams) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: DownsampleParams): void {
  const f32 = new Float32Array(4);
  f32[0] = p.texelSize[0]; f32[1] = p.texelSize[1];
  device.queue.writeBuffer(buf, 0, f32);
}

export function createDownsamplePass(
  device: GPUDevice,
  cache: DownsamplePipelineCache,
  options: {
    outputFormat: GPUTextureFormat;
    params: DownsampleParams;
    id?: string;
    enabled?: boolean;
    resolution?: number;
  },
): DownsamplePassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "utility.downsample.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "utility.downsample",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "utility.downsample.bindGroup",
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
    resolution: options.resolution,
    vertexCount: 4,
  };

  return {
    descriptor,
    updateParams: (next) => writeUniforms(device, uniformBuffer, next),
    destroy: () => uniformBuffer.destroy(),
  };
}
