/**
 * Identity render pass — copies the prior input texture to the output
 * attachment via `wgsl/passthrough.wgsl`. This is the simplest pass shape
 * in the new pipeline and the validation gate for Slice 0.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassDescriptor, GPURenderPassBindContext } from "../types";

import passthroughWgsl from "../../wgsl/passthrough.wgsl?raw";

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export interface PassthroughPassOptions {
  outputFormat: GPUTextureFormat;
  id?: string;
  enabled?: boolean;
  resolution?: number;
}

export class PassthroughPipelineCache {
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
    const module = this.shaders.compile(passthroughWgsl, "passthrough.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "passthrough.bindGroupLayout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
      ],
    });
    const pipelineLayout = this.device.createPipelineLayout({
      label: "passthrough.pipelineLayout",
      bindGroupLayouts: [bindGroupLayout],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `passthrough.pipeline:${format}`,
      layout: pipelineLayout,
      vertex: { module, entryPoint: "vs_main" },
      fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
      primitive: { topology: "triangle-strip" },
    });
    const entry: CompiledPipeline = { pipeline, bindGroupLayout };
    this.byFormat.set(format, entry);
    return entry;
  }
}

export function createPassthroughPass(
  cache: PassthroughPipelineCache,
  options: PassthroughPassOptions
): GPURenderPassDescriptor {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  return {
    kind: "render",
    id: options.id ?? "passthrough",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "passthrough.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: ctx.priorInputView },
          { binding: 1, resource: ctx.defaultSampler },
        ],
      }),
    ],
    outputFormat: options.outputFormat,
    enabled: options.enabled ?? true,
    resolution: options.resolution,
    vertexCount: 4,
  };
}
