/**
 * Radial gradient mask generator.
 *
 * No source texture — output is a white RGBA texture with alpha = elliptical gradient.
 * The `priorInputView` from the executor context is unused.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import gradientWgsl   from "../../wgsl/mask/radialGradient.wgsl?raw";

const gradientSource = `${fullscreenWgsl}\n${gradientWgsl}`;

// 3 vec4 = 48 bytes
const UNIFORM_BYTES = 48;

export interface RadialGradientParams {
  center: readonly [number, number];
  /** Ellipse radii in UV space. */
  radius: readonly [number, number];
  feather: number;
  invert: boolean;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class RadialGradientPipelineCache {
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
    const module = this.shaders.compile(gradientSource, "mask/radialGradient.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "mask.radialGradient.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `mask.radialGradient.pipeline:${format}`,
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

export interface RadialGradientPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: RadialGradientParams) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: RadialGradientParams): void {
  const ab  = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  // flags @ 0
  u32[0] = p.invert ? 1 : 0;
  // center_radius @ 16
  f32[4] = p.center[0]; f32[5] = p.center[1]; f32[6] = p.radius[0]; f32[7] = p.radius[1];
  // feather @ 32
  f32[8] = p.feather;
  device.queue.writeBuffer(buf, 0, ab);
}

export function createRadialGradientPass(
  device: GPUDevice,
  cache: RadialGradientPipelineCache,
  options: {
    outputFormat: GPUTextureFormat;
    params: RadialGradientParams;
    id?: string;
    enabled?: boolean;
  },
): RadialGradientPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "mask.radialGradient.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "mask.radialGradient",
    pipeline,
    // priorInputView is deliberately unused — this pass generates from UV only.
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "mask.radialGradient.bindGroup",
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
