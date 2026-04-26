/**
 * Glow composite pass — additively blends blurred glow mask onto the source.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import glowWgsl       from "../../wgsl/post/glowComposite.wgsl?raw";

const glowSource = `${fullscreenWgsl}\n${glowWgsl}`;

// 2 vec4 = 32 bytes
const UNIFORM_BYTES = 32;

export interface GlowCompositeParams {
  glowEnabled: boolean;
  glowIntensity: number;
  glowBias: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class GlowCompositePipelineCache {
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
    const module = this.shaders.compile(glowSource, "post/glowComposite.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "post.glowComposite.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `post.glowComposite.pipeline:${format}`,
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

export interface GlowCompositePassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: GlowCompositeParams) => void;
  updateGlowMask: (tex: GPUTexture) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: GlowCompositeParams): void {
  const ab  = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  u32[0] = p.glowEnabled ? 1 : 0;
  f32[4] = p.glowIntensity; f32[5] = p.glowBias;
  device.queue.writeBuffer(buf, 0, ab);
}

export function createGlowCompositePass(
  device: GPUDevice,
  cache: GlowCompositePipelineCache,
  options: {
    outputFormat: GPUTextureFormat;
    params: GlowCompositeParams;
    glowMask: GPUTexture;
    id?: string;
    enabled?: boolean;
  },
): GlowCompositePassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "post.glowComposite.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  let glowView = options.glowMask.createView({ label: "post.glowComposite.mask" });

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "post.glowComposite",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "post.glowComposite.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: ctx.priorInputView },
          { binding: 1, resource: glowView },
          { binding: 2, resource: ctx.defaultSampler },
          { binding: 3, resource: { buffer: uniformBuffer } },
        ],
      }),
    ],
    outputFormat: options.outputFormat,
    enabled: options.enabled ?? true,
    vertexCount: 4,
  };

  return {
    descriptor,
    updateParams:  (next) => writeUniforms(device, uniformBuffer, next),
    updateGlowMask: (tex) => { glowView = tex.createView({ label: "post.glowComposite.mask" }); },
    destroy: () => uniformBuffer.destroy(),
  };
}
