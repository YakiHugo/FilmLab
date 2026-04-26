/**
 * 5×5 edge-preserving bilateral filter.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl   from "../../wgsl/lib/fullscreen.wgsl?raw";
import colorSpaceWgsl   from "../../wgsl/lib/colorSpace.wgsl?raw";
import bilateralWgsl    from "../../wgsl/utility/bilateralScale.wgsl?raw";

const bilateralSource = `${fullscreenWgsl}\n${colorSpaceWgsl}\n${bilateralWgsl}`;

const UNIFORM_BYTES = 16;

export interface BilateralScaleParams {
  texelSize: readonly [number, number];
  sigmaRange: number;
  strength: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class BilateralScalePipelineCache {
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
    const module = this.shaders.compile(bilateralSource, "utility/bilateralScale.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "utility.bilateralScale.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `utility.bilateralScale.pipeline:${format}`,
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

export interface BilateralScalePassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: BilateralScaleParams) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: BilateralScaleParams): void {
  const f32 = new Float32Array(4);
  f32[0] = p.texelSize[0]; f32[1] = p.texelSize[1];
  f32[2] = p.sigmaRange;   f32[3] = p.strength;
  device.queue.writeBuffer(buf, 0, f32);
}

export function createBilateralScalePass(
  device: GPUDevice,
  cache: BilateralScalePipelineCache,
  options: {
    outputFormat: GPUTextureFormat;
    params: BilateralScaleParams;
    id?: string;
    enabled?: boolean;
  },
): BilateralScalePassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "utility.bilateralScale.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "utility.bilateralScale",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "utility.bilateralScale.bindGroup",
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
