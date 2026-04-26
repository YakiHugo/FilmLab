/**
 * Curve pass — two-stage point curve via a 256×1 RGBA8 LUT texture.
 * The caller owns and provides the LUT texture; this pass references it.
 *
 * Uniform layout matches `wgsl/develop/curve.wgsl::CurveParams`.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import colorSpaceWgsl from "../../wgsl/lib/colorSpace.wgsl?raw";
import curveWgsl from "../../wgsl/develop/curve.wgsl?raw";

const curveSource = `${fullscreenWgsl}\n${colorSpaceWgsl}\n${curveWgsl}`;

// 1 vec4 = 16 bytes.
const UNIFORM_BYTES = 16;

export interface CurvePassParams {
  // No float params — the curve is fully encoded in the LUT texture.
  // Present for parity with other pass handles.
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class CurvePipelineCache {
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
    const module = this.shaders.compile(curveSource, "develop/curve.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "develop.curve.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `develop.curve.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "develop.curve.pipelineLayout",
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

export interface CurvePassOptions {
  outputFormat: GPUTextureFormat;
  /** 256×1 rgba8unorm LUT; caller owns the texture lifetime. */
  curveLut: GPUTexture;
  id?: string;
  enabled?: boolean;
}

export interface CurvePassHandle {
  descriptor: GPURenderPassDescriptor;
  /** Swap to a new LUT texture (e.g. after curve points change). */
  updateLut: (newTex: GPUTexture) => void;
  destroy: () => void;
}

export function createCurvePass(
  device: GPUDevice,
  cache: CurvePipelineCache,
  options: CurvePassOptions,
): CurvePassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "develop.curve.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // flags.x=1 (enabled always true at creation; toggle via descriptor.enabled)
  const u32 = new Uint32Array(4);
  u32[0] = 1;
  device.queue.writeBuffer(uniformBuffer, 0, u32);

  // Mutable LUT view captured in closure; updated by updateLut.
  let curveLutView = options.curveLut.createView({ label: "develop.curve.lut" });

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "develop.curve",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "develop.curve.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: ctx.priorInputView },
          { binding: 1, resource: ctx.defaultSampler },
          { binding: 2, resource: curveLutView },
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
    updateLut: (newTex) => { curveLutView = newTex.createView({ label: "develop.curve.lut" }); },
    destroy: () => uniformBuffer.destroy(),
  };
}
