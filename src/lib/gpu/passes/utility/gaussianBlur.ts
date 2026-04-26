/**
 * 13-tap separable Gaussian blur.
 *
 * Run horizontal (dir=(1/width,0)) then vertical (dir=(0,1/height)) for a
 * full 2D blur. `radius` scales the kernel spread.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import blurWgsl       from "../../wgsl/utility/gaussianBlur.wgsl?raw";

const blurSource = `${fullscreenWgsl}\n${blurWgsl}`;

const UNIFORM_BYTES = 16; // 1 vec4

export interface GaussianBlurParams {
  /** (1/width, 0) for horizontal pass; (0, 1/height) for vertical. */
  direction: readonly [number, number];
  radius: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class GaussianBlurPipelineCache {
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
    const module = this.shaders.compile(blurSource, "utility/gaussianBlur.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "utility.gaussianBlur.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `utility.gaussianBlur.pipeline:${format}`,
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

export interface GaussianBlurPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: GaussianBlurParams) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: GaussianBlurParams): void {
  const f32 = new Float32Array(4);
  f32[0] = p.direction[0]; f32[1] = p.direction[1]; f32[2] = p.radius;
  device.queue.writeBuffer(buf, 0, f32);
}

export function createGaussianBlurPass(
  device: GPUDevice,
  cache: GaussianBlurPipelineCache,
  options: {
    outputFormat: GPUTextureFormat;
    params: GaussianBlurParams;
    id?: string;
    enabled?: boolean;
  },
): GaussianBlurPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "utility.gaussianBlur.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "utility.gaussianBlur",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "utility.gaussianBlur.bindGroup",
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
