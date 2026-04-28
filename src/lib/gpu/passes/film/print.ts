/**
 * Film print pass — print stock, density/contrast, CMY color head,
 * color cast, and print toning.
 *
 * Uniform layout matches `wgsl/film/print.wgsl::PrintParams`.
 *
 * The print LUT is a 3D texture used only when `printLutEnabled=true`.
 * Pass `createPlaceholderPrintLut3D(device)` when not in use.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import colorSpaceWgsl from "../../wgsl/lib/colorSpace.wgsl?raw";
import printWgsl from "../../wgsl/film/print.wgsl?raw";

export { createPlaceholderLut3D as createPlaceholderPrintLut3D } from "./utils";

const printSource = `${fullscreenWgsl}\n${colorSpaceWgsl}\n${printWgsl}`;

// 12 vec4 = 192 bytes
const UNIFORM_BYTES = 192;

export interface PrintPassParams {
  printEnabled: boolean;
  printDensity: number;
  printContrast: number;
  printWarmth: number;
  printStock: number;
  printLutEnabled: boolean;
  printLutIntensity: number;
  printTargetWhiteKelvin: number;
  cmyEnabled: boolean;
  cyan: number;
  magenta: number;
  yellow: number;
  colorCastEnabled: boolean;
  colorCastShadows: readonly [number, number, number];
  colorCastMidtones: readonly [number, number, number];
  colorCastHighlights: readonly [number, number, number];
  toningEnabled: boolean;
  toningShadows: readonly [number, number, number];
  toningMidtones: readonly [number, number, number];
  toningHighlights: readonly [number, number, number];
  toningStrength: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class PrintPipelineCache {
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
    const module = this.shaders.compile(printSource, "film/print.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "film.print.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "3d" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `film.print.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "film.print.pipelineLayout",
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

export interface PrintPassOptions {
  outputFormat: GPUTextureFormat;
  params: PrintPassParams;
  /** Print LUT (or placeholder from createPlaceholderPrintLut3D). */
  printLut: GPUTexture;
  id?: string;
  enabled?: boolean;
}

export interface PrintPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: PrintPassParams) => void;
  updatePrintLut: (tex: GPUTexture) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: PrintPassParams): void {
  const ab = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  // flags @ 0: [print, cmy, colorCast, toning]
  u32[0] = p.printEnabled ? 1 : 0;
  u32[1] = p.cmyEnabled ? 1 : 0;
  u32[2] = p.colorCastEnabled ? 1 : 0;
  u32[3] = p.toningEnabled ? 1 : 0;
  // flags2 @ 16: [printLut, -, -, -]
  u32[4] = p.printLutEnabled ? 1 : 0;
  // print_params @ 32: [density, contrast, warmth, stock]
  f32[8] = p.printDensity; f32[9] = p.printContrast; f32[10] = p.printWarmth; f32[11] = p.printStock;
  // lut_params @ 48: [lutIntensity, targetWhiteKelvin, -, -]
  f32[12] = p.printLutIntensity; f32[13] = p.printTargetWhiteKelvin;
  // cmy @ 64: [cyan, magenta, yellow, -]
  f32[16] = p.cyan; f32[17] = p.magenta; f32[18] = p.yellow;
  // cast_shadows @ 80, cast_midtones @ 96, cast_highlights @ 112
  f32[20] = p.colorCastShadows[0];    f32[21] = p.colorCastShadows[1];    f32[22] = p.colorCastShadows[2];
  f32[24] = p.colorCastMidtones[0];   f32[25] = p.colorCastMidtones[1];   f32[26] = p.colorCastMidtones[2];
  f32[28] = p.colorCastHighlights[0]; f32[29] = p.colorCastHighlights[1]; f32[30] = p.colorCastHighlights[2];
  // toning_shadows @ 128, midtones @ 144, highlights @ 160
  f32[32] = p.toningShadows[0];    f32[33] = p.toningShadows[1];    f32[34] = p.toningShadows[2];
  f32[36] = p.toningMidtones[0];   f32[37] = p.toningMidtones[1];   f32[38] = p.toningMidtones[2];
  f32[40] = p.toningHighlights[0]; f32[41] = p.toningHighlights[1]; f32[42] = p.toningHighlights[2];
  // toning_strength @ 176
  f32[44] = p.toningStrength;
  device.queue.writeBuffer(buf, 0, ab);
}

export function createPrintPass(
  device: GPUDevice,
  cache: PrintPipelineCache,
  options: PrintPassOptions,
): PrintPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "film.print.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  let printLutView = options.printLut.createView({ label: "film.print.lut", dimension: "3d" });

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "film.print",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "film.print.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: ctx.priorInputView },
          { binding: 1, resource: ctx.defaultSampler },
          { binding: 2, resource: printLutView },
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
    updateParams:   (next) => writeUniforms(device, uniformBuffer, next),
    updatePrintLut: (tex) => { printLutView = tex.createView({ label: "film.print.lut", dimension: "3d" }); },
    destroy: () => uniformBuffer.destroy(),
  };
}
