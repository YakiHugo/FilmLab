/**
 * Linear gradient mask generator.
 *
 * No source texture — output is a white RGBA texture with alpha = gradient mask.
 * The `priorInputView` from the executor context is unused.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import gradientWgsl   from "../../wgsl/mask/linearGradient.wgsl?raw";

const gradientSource = `${fullscreenWgsl}\n${gradientWgsl}`;

// 3 vec4 = 48 bytes
const UNIFORM_BYTES = 48;

export interface LinearGradientParams {
  /** UV coordinate of gradient start (alpha=1 side). */
  start: readonly [number, number];
  /** UV coordinate of gradient end (alpha=0 side). */
  end: readonly [number, number];
  /** Feather amount [0,1]. 0 = hard edge at midpoint. */
  feather: number;
  invert: boolean;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class LinearGradientPipelineCache {
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
    const module = this.shaders.compile(gradientSource, "mask/linearGradient.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "mask.linearGradient.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `mask.linearGradient.pipeline:${format}`,
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

export interface LinearGradientPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: LinearGradientParams) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: LinearGradientParams): void {
  const ab  = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  // flags @ 0
  u32[0] = p.invert ? 1 : 0;
  // start_end @ 16
  f32[4] = p.start[0]; f32[5] = p.start[1]; f32[6] = p.end[0]; f32[7] = p.end[1];
  // feather @ 32
  f32[8] = p.feather;
  device.queue.writeBuffer(buf, 0, ab);
}

export function createLinearGradientPass(
  device: GPUDevice,
  cache: LinearGradientPipelineCache,
  options: {
    outputFormat: GPUTextureFormat;
    params: LinearGradientParams;
    id?: string;
    enabled?: boolean;
  },
): LinearGradientPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "mask.linearGradient.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "mask.linearGradient",
    pipeline,
    // priorInputView is deliberately unused — this pass generates from UV only.
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "mask.linearGradient.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
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
