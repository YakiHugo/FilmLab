/**
 * OutputEncode pass — optional tonemap, linear→sRGB, optional ordered dither.
 *
 * Owns its uniform buffer (created on construction); call `updateParams` to
 * rewrite values between frames. Bind group is rebuilt per execute because
 * the prior input view changes.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import colorSpaceWgsl from "../../wgsl/lib/colorSpace.wgsl?raw";
import outputEncodeWgsl from "../../wgsl/develop/outputEncode.wgsl?raw";

const outputEncodeSource = `${fullscreenWgsl}\n${colorSpaceWgsl}\n${outputEncodeWgsl}`;

const UNIFORM_BYTES = 32;

export interface OutputEncodeParams {
  outputSize: readonly [number, number];
  inputLinear: boolean;
  enableDither: boolean;
  applyToneMap: boolean;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class OutputEncodePipelineCache {
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
    const module = this.shaders.compile(outputEncodeSource, "develop/outputEncode.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "develop.outputEncode.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `develop.outputEncode.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "develop.outputEncode.pipelineLayout",
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

export interface OutputEncodePassOptions {
  outputFormat: GPUTextureFormat;
  params: OutputEncodeParams;
  id?: string;
  enabled?: boolean;
}

function writeUniforms(device: GPUDevice, buffer: GPUBuffer, params: OutputEncodeParams): void {
  const ab = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  // outputSize_pad: vec4<f32>
  f32[0] = params.outputSize[0];
  f32[1] = params.outputSize[1];
  f32[2] = 0;
  f32[3] = 0;
  // flags: vec4<u32>
  u32[4] = params.inputLinear ? 1 : 0;
  u32[5] = params.enableDither ? 1 : 0;
  u32[6] = params.applyToneMap ? 1 : 0;
  u32[7] = 0;
  device.queue.writeBuffer(buffer, 0, ab);
}

export interface OutputEncodePassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: OutputEncodeParams) => void;
  destroy: () => void;
}

export function createOutputEncodePass(
  device: GPUDevice,
  cache: OutputEncodePipelineCache,
  options: OutputEncodePassOptions
): OutputEncodePassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "develop.outputEncode.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "develop.outputEncode",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "develop.outputEncode.bindGroup",
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
