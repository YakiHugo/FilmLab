/**
 * Mask invert — flips the alpha channel; RGB output is white.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl  from "../../wgsl/lib/fullscreen.wgsl?raw";
import maskInvertWgsl  from "../../wgsl/mask/maskInvert.wgsl?raw";

const maskInvertSource = `${fullscreenWgsl}\n${maskInvertWgsl}`;

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class MaskInvertPipelineCache {
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
    const module = this.shaders.compile(maskInvertSource, "mask/maskInvert.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "mask.maskInvert.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `mask.maskInvert.pipeline:${format}`,
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

/** @public — consumed by media-native-render-pipeline */
export function createMaskInvertPass(
  cache: MaskInvertPipelineCache,
  options: {
    outputFormat: GPUTextureFormat;
    id?: string;
    enabled?: boolean;
  },
): GPURenderPassDescriptor {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  return {
    kind: "render",
    id: options.id ?? "mask.maskInvert",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "mask.maskInvert.bindGroup",
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
