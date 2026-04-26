/**
 * InputDecode pass — clamps source to [0,1] and converts sRGB→linear.
 *
 * No tunable parameters; the bind group is identical to passthrough plus the
 * shared color-space helpers. Mirrors `shaders/InputDecode.frag`.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import colorSpaceWgsl from "../../wgsl/lib/colorSpace.wgsl?raw";
import inputDecodeWgsl from "../../wgsl/develop/inputDecode.wgsl?raw";

const inputDecodeSource = `${fullscreenWgsl}\n${colorSpaceWgsl}\n${inputDecodeWgsl}`;

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class InputDecodePipelineCache {
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
    const module = this.shaders.compile(inputDecodeSource, "develop/inputDecode.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "develop.inputDecode.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `develop.inputDecode.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "develop.inputDecode.pipelineLayout",
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

export interface InputDecodePassOptions {
  outputFormat: GPUTextureFormat;
  id?: string;
  enabled?: boolean;
}

export function createInputDecodePass(
  cache: InputDecodePipelineCache,
  options: InputDecodePassOptions
): GPURenderPassDescriptor {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  return {
    kind: "render",
    id: options.id ?? "develop.inputDecode",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "develop.inputDecode.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: ctx.priorInputView },
          { binding: 1, resource: ctx.defaultSampler },
        ],
      }),
    ],
    outputFormat: options.outputFormat,
    enabled: options.enabled ?? true,
    vertexCount: 4,
  };
}
