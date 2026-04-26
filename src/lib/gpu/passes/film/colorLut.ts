/**
 * Film color LUT pass — 3×3 color matrix, 3D LUT (+ optional blend LUT),
 * and a secondary custom 3D LUT. Mirrors `shaders/FilmColorLutUber.frag`.
 *
 * Uniform layout matches `wgsl/film/colorLut.wgsl::ColorLutParams`.
 *
 * 3D LUT textures must be `rgba8unorm` or `rgba16float`, dimension "3d".
 * Pass `createPlaceholderLut3D(device)` for disabled slots.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import colorSpaceWgsl from "../../wgsl/lib/colorSpace.wgsl?raw";
import colorLutWgsl from "../../wgsl/film/colorLut.wgsl?raw";

const colorLutSource = `${fullscreenWgsl}\n${colorSpaceWgsl}\n${colorLutWgsl}`;

// 5 vec4 = 80 bytes
const UNIFORM_BYTES = 80;

export interface ColorLutPassParams {
  colorMatrixEnabled: boolean;
  /** Column-major 9 values: col0[0..2], col1[3..5], col2[6..8]. */
  colorMatrix: readonly number[];
  lutEnabled: boolean;
  lutIntensity: number;
  lutMixEnabled: boolean;
  lutMixFactor: number;
  customLutEnabled: boolean;
  customLutIntensity: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class ColorLutPipelineCache {
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
    const module = this.shaders.compile(colorLutSource, "film/colorLut.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "film.colorLut.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "3d" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "3d" } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "3d" } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `film.colorLut.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "film.colorLut.pipelineLayout",
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

/** 1×1×1 passthrough LUT used when a slot is disabled. */
export function createPlaceholderLut3D(device: GPUDevice): GPUTexture {
  const tex = device.createTexture({
    label: "film.colorLut.placeholder3d",
    size: { width: 1, height: 1, depthOrArrayLayers: 1 },
    dimension: "3d",
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  // Identity texel: (0, 0, 0) samples as (0, 0, 0, 255) — harmless for a
  // disabled slot because the flag check prevents this texture from being used.
  device.queue.writeTexture(
    { texture: tex },
    new Uint8Array([0, 0, 0, 255]),
    { bytesPerRow: 4, rowsPerImage: 1 },
    { width: 1, height: 1, depthOrArrayLayers: 1 },
  );
  return tex;
}

export interface ColorLutPassOptions {
  outputFormat: GPUTextureFormat;
  params: ColorLutPassParams;
  /** 3D LUT texture (or placeholder from createPlaceholderLut3D). */
  lut: GPUTexture;
  /** Blend target for mix; can be the same placeholder when mix is off. */
  lutBlend: GPUTexture;
  /** Custom LUT texture (or placeholder). */
  customLut: GPUTexture;
  id?: string;
  enabled?: boolean;
}

export interface ColorLutPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: ColorLutPassParams) => void;
  /** Replace a LUT texture (e.g. after profile change). */
  updateLut: (tex: GPUTexture) => void;
  updateLutBlend: (tex: GPUTexture) => void;
  updateCustomLut: (tex: GPUTexture) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: ColorLutPassParams): void {
  const ab = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  // flags @ 0
  u32[0] = p.colorMatrixEnabled ? 1 : 0;
  u32[1] = p.lutEnabled ? 1 : 0;
  u32[2] = p.lutMixEnabled ? 1 : 0;
  u32[3] = p.customLutEnabled ? 1 : 0;
  // col0 @ 16, col1 @ 32, col2 @ 48 — column-major layout
  const m = p.colorMatrix;
  f32[4] = m[0] ?? 1; f32[5] = m[1] ?? 0; f32[6] = m[2] ?? 0;
  f32[8] = m[3] ?? 0; f32[9] = m[4] ?? 1; f32[10] = m[5] ?? 0;
  f32[12] = m[6] ?? 0; f32[13] = m[7] ?? 0; f32[14] = m[8] ?? 1;
  // lut_params @ 64
  f32[16] = p.lutIntensity; f32[17] = p.lutMixFactor; f32[18] = p.customLutIntensity;
  device.queue.writeBuffer(buf, 0, ab);
}

export function createColorLutPass(
  device: GPUDevice,
  cache: ColorLutPipelineCache,
  options: ColorLutPassOptions,
): ColorLutPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "film.colorLut.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  let lutView       = options.lut.createView({ label: "film.colorLut.lut", dimension: "3d" });
  let lutBlendView  = options.lutBlend.createView({ label: "film.colorLut.lutBlend", dimension: "3d" });
  let customLutView = options.customLut.createView({ label: "film.colorLut.customLut", dimension: "3d" });

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "film.colorLut",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "film.colorLut.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: ctx.priorInputView },
          { binding: 1, resource: ctx.defaultSampler },
          { binding: 2, resource: lutView },
          { binding: 3, resource: lutBlendView },
          { binding: 4, resource: customLutView },
          { binding: 5, resource: { buffer: uniformBuffer } },
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
    updateLut:       (tex) => { lutView       = tex.createView({ label: "film.colorLut.lut",       dimension: "3d" }); },
    updateLutBlend:  (tex) => { lutBlendView  = tex.createView({ label: "film.colorLut.lutBlend",  dimension: "3d" }); },
    updateCustomLut: (tex) => { customLutView = tex.createView({ label: "film.colorLut.customLut", dimension: "3d" }); },
    destroy: () => uniformBuffer.destroy(),
  };
}
