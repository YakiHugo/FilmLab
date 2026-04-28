/**
 * Film grain pass — blue-noise and procedural crystal models.
 *
 * Uniform layout matches `wgsl/film/grain.wgsl::GrainParams`.
 *
 * The caller owns the blue-noise texture; pass a placeholder 1×1 texture
 * if the grain effect is fully disabled to satisfy the binding slot.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import colorSpaceWgsl from "../../wgsl/lib/colorSpace.wgsl?raw";
import grainWgsl from "../../wgsl/film/grain.wgsl?raw";

const grainSource = `${fullscreenWgsl}\n${colorSpaceWgsl}\n${grainWgsl}`;

// 6 vec4 = 96 bytes
const UNIFORM_BYTES = 96;

export interface GrainPassParams {
  enabled: boolean;
  /** 0 = blue-noise model; 1 = procedural crystal model. */
  grainModel: number;
  grainAmount: number;
  grainSize: number;
  grainRoughness: number;
  grainShadowBias: number;
  grainSeed: number;
  grainIsColor: boolean;
  /** Source image width in pixels (used for noise tiling). */
  textureWidth: number;
  /** Source image height in pixels. */
  textureHeight: number;
  crystalDensity: number;
  crystalSizeMean: number;
  crystalSizeVariance: number;
  grainColorSeparation: readonly [number, number, number];
  scannerMTF: number;
  filmFormat: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class GrainPipelineCache {
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
    const module = this.shaders.compile(grainSource, "film/grain.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "film.grain.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `film.grain.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "film.grain.pipelineLayout",
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

export interface GrainPassOptions {
  outputFormat: GPUTextureFormat;
  params: GrainPassParams;
  /** 64×64 (or larger) RGBA blue-noise texture. Caller manages lifetime. */
  blueNoise: GPUTexture;
  id?: string;
  enabled?: boolean;
}

export interface GrainPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: GrainPassParams) => void;
  updateBlueNoise: (tex: GPUTexture) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: GrainPassParams): void {
  const ab = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  // flags @ 0: [enabled, isColor, -, -]
  u32[0] = p.enabled ? 1 : 0;
  u32[1] = p.grainIsColor ? 1 : 0;
  // params0 @ 16: [amount, size, roughness, shadowBias]
  f32[4] = p.grainAmount; f32[5] = p.grainSize; f32[6] = p.grainRoughness; f32[7] = p.grainShadowBias;
  // params1 @ 32: [seed, model, -, -]
  f32[8] = p.grainSeed; f32[9] = p.grainModel;
  // tex_size @ 48: [width, height, -, -]
  f32[12] = p.textureWidth; f32[13] = p.textureHeight;
  // procedural @ 64: [crystalDensity, crystalSizeMean, crystalSizeVariance, scannerMTF]
  f32[16] = p.crystalDensity; f32[17] = p.crystalSizeMean; f32[18] = p.crystalSizeVariance; f32[19] = p.scannerMTF;
  // color_sep @ 80: [r, g, b, filmFormat]
  f32[20] = p.grainColorSeparation[0]; f32[21] = p.grainColorSeparation[1]; f32[22] = p.grainColorSeparation[2];
  f32[23] = p.filmFormat;
  device.queue.writeBuffer(buf, 0, ab);
}

export function createGrainPass(
  device: GPUDevice,
  cache: GrainPipelineCache,
  options: GrainPassOptions,
): GrainPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "film.grain.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  let blueNoiseView = options.blueNoise.createView({ label: "film.grain.blueNoise" });

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "film.grain",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "film.grain.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: ctx.priorInputView },
          { binding: 1, resource: blueNoiseView },
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
    updateParams:    (next) => writeUniforms(device, uniformBuffer, next),
    updateBlueNoise: (tex) => { blueNoiseView = tex.createView({ label: "film.grain.blueNoise" }); },
    destroy: () => uniformBuffer.destroy(),
  };
}
