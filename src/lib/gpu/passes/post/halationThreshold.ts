/**
 * Halation + bloom threshold pass.
 *
 * Output: RGBA where RGB = color × halation energy, A = bloom energy.
 * Feed this texture into a blur pass then HalationComposite.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import colorSpaceWgsl from "../../wgsl/lib/colorSpace.wgsl?raw";
import thresholdWgsl  from "../../wgsl/post/halationThreshold.wgsl?raw";

const thresholdSource = `${fullscreenWgsl}\n${colorSpaceWgsl}\n${thresholdWgsl}`;

const UNIFORM_BYTES = 16; // 1 vec4

export interface HalationThresholdParams {
  halationThreshold: number;
  bloomThreshold: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class HalationThresholdPipelineCache {
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
    const module = this.shaders.compile(thresholdSource, "post/halationThreshold.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "post.halationThreshold.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `post.halationThreshold.pipeline:${format}`,
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

export interface HalationThresholdPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: HalationThresholdParams) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: HalationThresholdParams): void {
  const f32 = new Float32Array(4);
  f32[0] = p.halationThreshold;
  f32[1] = p.bloomThreshold;
  device.queue.writeBuffer(buf, 0, f32);
}

export function createHalationThresholdPass(
  device: GPUDevice,
  cache: HalationThresholdPipelineCache,
  options: {
    outputFormat: GPUTextureFormat;
    params: HalationThresholdParams;
    id?: string;
    enabled?: boolean;
  },
): HalationThresholdPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "post.halationThreshold.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "post.halationThreshold",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "post.halationThreshold.bindGroup",
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
