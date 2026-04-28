/**
 * Brush dab stamp — accumulates a single soft dab into an existing mask.
 *
 * The prior pipeline texture is the existing mask; the stamp is applied on top.
 * Call this pass once per brush dab point; batch multiple points by chaining passes.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import stampWgsl      from "../../wgsl/mask/brushStamp.wgsl?raw";

const stampSource = `${fullscreenWgsl}\n${stampWgsl}`;

// 2 vec4 = 32 bytes
const UNIFORM_BYTES = 32;

export interface BrushStampParams {
  canvasWidth: number;
  canvasHeight: number;
  centerPxX: number;
  centerPxY: number;
  radiusPx: number;
  innerRadiusPx: number;
  flow: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class BrushStampPipelineCache {
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
    const module = this.shaders.compile(stampSource, "mask/brushStamp.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "mask.brushStamp.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `mask.brushStamp.pipeline:${format}`,
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

export interface BrushStampPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: BrushStampParams) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: BrushStampParams): void {
  const f32 = new Float32Array(8);
  f32[0] = p.canvasWidth;  f32[1] = p.canvasHeight;
  f32[2] = p.centerPxX;   f32[3] = p.centerPxY;
  f32[4] = p.radiusPx;    f32[5] = p.innerRadiusPx; f32[6] = p.flow;
  device.queue.writeBuffer(buf, 0, f32);
}

export function createBrushStampPass(
  device: GPUDevice,
  cache: BrushStampPipelineCache,
  options: {
    outputFormat: GPUTextureFormat;
    params: BrushStampParams;
    id?: string;
    enabled?: boolean;
  },
): BrushStampPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "mask.brushStamp.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "mask.brushStamp",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "mask.brushStamp.bindGroup",
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
