/**
 * Local mask range gate — modulates a mask by luma/color range from source.
 *
 * Both source and mask are explicitly provided; neither comes from the pipeline.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import rangeGateWgsl  from "../../wgsl/mask/rangeGate.wgsl?raw";

const rangeGateSource = `${fullscreenWgsl}\n${rangeGateWgsl}`;

// 4 vec4 = 64 bytes
const UNIFORM_BYTES = 64;

export interface RangeGateParams {
  useLumaRange: boolean;
  lumaMin: number;
  lumaMax: number;
  lumaFeather: number;
  useColorRange: boolean;
  hueCenter: number;
  hueRange: number;
  hueFeather: number;
  satMin: number;
  satFeather: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class RangeGatePipelineCache {
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
    const module = this.shaders.compile(rangeGateSource, "mask/rangeGate.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "mask.rangeGate.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `mask.rangeGate.pipeline:${format}`,
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

export interface RangeGatePassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: RangeGateParams) => void;
  updateSource: (tex: GPUTexture) => void;
  updateMask: (tex: GPUTexture) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: RangeGateParams): void {
  const ab  = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  // flags @ 0
  u32[0] = p.useLumaRange  ? 1 : 0;
  u32[1] = p.useColorRange ? 1 : 0;
  // luma @ 16
  f32[4] = p.lumaMin; f32[5] = p.lumaMax; f32[6] = p.lumaFeather;
  // color @ 32
  f32[8]  = p.hueCenter; f32[9]  = p.hueRange; f32[10] = p.hueFeather; f32[11] = p.satMin;
  // color2 @ 48
  f32[12] = p.satFeather;
  device.queue.writeBuffer(buf, 0, ab);
}

export function createRangeGatePass(
  device: GPUDevice,
  cache: RangeGatePipelineCache,
  options: {
    outputFormat: GPUTextureFormat;
    params: RangeGateParams;
    /** Linear-light source image for range analysis. */
    sourceTexture: GPUTexture;
    /** Existing mask to modulate. */
    maskTexture: GPUTexture;
    id?: string;
    enabled?: boolean;
  },
): RangeGatePassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "mask.rangeGate.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  let srcView  = options.sourceTexture.createView({ label: "mask.rangeGate.src"  });
  let maskView = options.maskTexture.createView({   label: "mask.rangeGate.mask" });

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "mask.rangeGate",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "mask.rangeGate.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: srcView },
          { binding: 1, resource: maskView },
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
    updateParams: (next) => writeUniforms(device, uniformBuffer, next),
    updateSource: (tex) => { srcView  = tex.createView({ label: "mask.rangeGate.src"  }); },
    updateMask:   (tex) => { maskView = tex.createView({ label: "mask.rangeGate.mask" }); },
    destroy: () => uniformBuffer.destroy(),
  };
}
