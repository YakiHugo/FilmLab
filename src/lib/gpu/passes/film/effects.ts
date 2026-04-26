/**
 * Film effects pass — gate weave, film breath, damage, vignette, overscan.
 * Mirrors `shaders/FilmEffectsUber.frag`.
 *
 * Uniform layout matches `wgsl/film/effects.wgsl::EffectsParams`.
 *
 * Damage and border textures are provided by the caller; pass placeholder
 * 1×1 textures when the effects are disabled.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import colorSpaceWgsl from "../../wgsl/lib/colorSpace.wgsl?raw";
import effectsWgsl from "../../wgsl/film/effects.wgsl?raw";

const effectsSource = `${fullscreenWgsl}\n${colorSpaceWgsl}\n${effectsWgsl}`;

// 7 vec4 = 112 bytes
const UNIFORM_BYTES = 112;

export interface EffectsPassParams {
  vignetteEnabled: boolean;
  vignetteAmount: number;
  vignetteMidpoint: number;
  vignetteRoundness: number;
  aspectRatio: number;
  breathEnabled: boolean;
  breathAmount: number;
  breathSeed: number;
  damageEnabled: boolean;
  damageAmount: number;
  damageSeed: number;
  gateWeaveEnabled: boolean;
  gateWeaveAmount: number;
  gateWeaveSeed: number;
  overscanEnabled: boolean;
  overscanAmount: number;
  overscanRoundness: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class EffectsPipelineCache {
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
    const module = this.shaders.compile(effectsSource, "film/effects.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "film.effects.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `film.effects.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "film.effects.pipelineLayout",
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

/** 1×1 placeholder for damage/border texture slots when not in use. */
export function createPlaceholder2D(device: GPUDevice, label: string): GPUTexture {
  const tex = device.createTexture({
    label,
    size: { width: 1, height: 1 },
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: tex },
    new Uint8Array([0, 0, 0, 255]),
    { bytesPerRow: 4 },
    { width: 1, height: 1 },
  );
  return tex;
}

export interface EffectsPassOptions {
  outputFormat: GPUTextureFormat;
  params: EffectsPassParams;
  /** Damage texture (or placeholder). Caller manages lifetime. */
  damageTexture: GPUTexture;
  /** Border/sprocket texture (or placeholder). Caller manages lifetime. */
  borderTexture: GPUTexture;
  id?: string;
  enabled?: boolean;
}

export interface EffectsPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: EffectsPassParams) => void;
  updateDamageTexture: (tex: GPUTexture) => void;
  updateBorderTexture: (tex: GPUTexture) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: EffectsPassParams): void {
  const ab = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  // flags @ 0: [vignette, breath, damage, gateWeave]
  u32[0] = p.vignetteEnabled ? 1 : 0;
  u32[1] = p.breathEnabled ? 1 : 0;
  u32[2] = p.damageEnabled ? 1 : 0;
  u32[3] = p.gateWeaveEnabled ? 1 : 0;
  // flags2 @ 16: [overscan, -, -, -]
  u32[4] = p.overscanEnabled ? 1 : 0;
  // vignette @ 32: [amount, midpoint, roundness, aspectRatio]
  f32[8] = p.vignetteAmount; f32[9] = p.vignetteMidpoint; f32[10] = p.vignetteRoundness; f32[11] = p.aspectRatio;
  // breath @ 48: [amount, seed, -, -]
  f32[12] = p.breathAmount; f32[13] = p.breathSeed;
  // damage @ 64: [amount, seed, -, -]
  f32[16] = p.damageAmount; f32[17] = p.damageSeed;
  // gate_weave @ 80: [amount, seed, -, -]
  f32[20] = p.gateWeaveAmount; f32[21] = p.gateWeaveSeed;
  // overscan @ 96: [amount, roundness, -, -]
  f32[24] = p.overscanAmount; f32[25] = p.overscanRoundness;
  device.queue.writeBuffer(buf, 0, ab);
}

export function createEffectsPass(
  device: GPUDevice,
  cache: EffectsPipelineCache,
  options: EffectsPassOptions,
): EffectsPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "film.effects.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  let damageView = options.damageTexture.createView({ label: "film.effects.damage" });
  let borderView = options.borderTexture.createView({ label: "film.effects.border" });

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "film.effects",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "film.effects.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: ctx.priorInputView },
          { binding: 1, resource: damageView },
          { binding: 2, resource: borderView },
          { binding: 3, resource: ctx.defaultSampler },
          { binding: 4, resource: { buffer: uniformBuffer } },
        ],
      }),
    ],
    outputFormat: options.outputFormat,
    enabled: options.enabled ?? true,
    vertexCount: 4,
  };

  return {
    descriptor,
    updateParams:         (next) => writeUniforms(device, uniformBuffer, next),
    updateDamageTexture:  (tex) => { damageView = tex.createView({ label: "film.effects.damage" }); },
    updateBorderTexture:  (tex) => { borderView = tex.createView({ label: "film.effects.border" }); },
    destroy: () => uniformBuffer.destroy(),
  };
}
