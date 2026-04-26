/**
 * Halation + bloom composite pass.
 *
 * Takes the original film output (priorInputView) and a separately-provided
 * blurred energy texture, composites halation tint + bloom onto the original.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl  from "../../wgsl/lib/fullscreen.wgsl?raw";
import compositeWgsl   from "../../wgsl/post/halationComposite.wgsl?raw";

const compositeSource = `${fullscreenWgsl}\n${compositeWgsl}`;

// 4 vec4 = 64 bytes
const UNIFORM_BYTES = 64;

export interface HalationCompositeParams {
  halationEnabled: boolean;
  halationIntensity: number;
  halationColor: readonly [number, number, number];
  halationHue: number;
  halationSaturation: number;
  halationBlueCompensation: number;
  bloomEnabled: boolean;
  bloomIntensity: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class HalationCompositePipelineCache {
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
    const module = this.shaders.compile(compositeSource, "post/halationComposite.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "post.halationComposite.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `post.halationComposite.pipeline:${format}`,
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

export interface HalationCompositePassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: HalationCompositeParams) => void;
  updateBlurredMask: (tex: GPUTexture) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: HalationCompositeParams): void {
  const ab  = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  // flags @ 0: x=halation, y=bloom
  u32[0] = p.halationEnabled ? 1 : 0;
  u32[1] = p.bloomEnabled    ? 1 : 0;
  // halation_params @ 16
  f32[4] = p.halationIntensity; f32[5] = p.halationHue;
  f32[6] = p.halationSaturation; f32[7] = p.halationBlueCompensation;
  // halation_color @ 32
  f32[8] = p.halationColor[0]; f32[9] = p.halationColor[1]; f32[10] = p.halationColor[2];
  // bloom_params @ 48
  f32[12] = p.bloomIntensity;
  device.queue.writeBuffer(buf, 0, ab);
}

export function createHalationCompositePass(
  device: GPUDevice,
  cache: HalationCompositePipelineCache,
  options: {
    outputFormat: GPUTextureFormat;
    params: HalationCompositeParams;
    blurredMask: GPUTexture;
    id?: string;
    enabled?: boolean;
  },
): HalationCompositePassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "post.halationComposite.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  let blurredView = options.blurredMask.createView({ label: "post.halationComposite.blurred" });

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "post.halationComposite",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "post.halationComposite.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: ctx.priorInputView },
          { binding: 1, resource: blurredView },
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
    updateParams:     (next) => writeUniforms(device, uniformBuffer, next),
    updateBlurredMask: (tex) => { blurredView = tex.createView({ label: "post.halationComposite.blurred" }); },
    destroy: () => uniformBuffer.destroy(),
  };
}
